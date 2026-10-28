import { Router } from 'express';
import { config } from '../config.js';
import {
  addMessage,
  createConversation,
  getConversation,
  getMessage,
  pathTo,
  updateConversation,
  updateMessageMeta,
  type Attachment,
} from '../db/conversations.js';
import { getSettings } from '../db/settings.js';
import { checkLimit } from '../db/usage.js';
import { runAgent, toInput, type AgentResult } from '../services/chat.js';
import { buildInstructions, type ToolHint } from '../services/context.js';
import { getFile, toAttachment } from '../services/files.js';
import { extractMemories } from '../services/memory.js';
import { friendlyError, quickText } from '../services/openai.js';

export const chatRouter = Router();

interface ChatRequest {
  conversationId?: string;
  /** Message the new user message hangs under (null = root). For regenerate: the user message to answer again. */
  parentId?: string | null;
  message?: string;
  attachmentIds?: string[];
  regenerate?: boolean;
  model?: string;
  think?: boolean;
  tool?: ToolHint;
  projectId?: string | null;
  temporary?: boolean;
}

async function generateTitle(userText: string, assistantText: string): Promise<string> {
  const title = await quickText(
    `User: ${userText.slice(0, 1500)}\n\nAssistant: ${assistantText.slice(0, 1500)}`,
    {
      instructions:
        'Write a short title (2-6 words) for this conversation. No quotes, no trailing punctuation. Reply with the title only.',
    },
  );
  return title.replace(/^["']|["'.]$/g, '').slice(0, 80) || 'New chat';
}

chatRouter.post('/', async (req, res) => {
  const body = req.body as ChatRequest;
  const settings = getSettings();

  try {
    checkLimit('tokens');
  } catch (err) {
    res.status(429).json({ error: (err as Error).message });
    return;
  }

  let conversation = body.conversationId ? getConversation(body.conversationId) : undefined;
  if (body.conversationId && !conversation) {
    res.status(404).json({ error: 'Conversation not found' });
    return;
  }

  let userMessage;
  if (body.regenerate) {
    userMessage = body.parentId ? getMessage(body.parentId) : undefined;
    if (!conversation || !userMessage || userMessage.role !== 'user' || userMessage.conversation_id !== conversation.id) {
      res.status(400).json({ error: 'Nothing to regenerate' });
      return;
    }
  } else {
    const text = body.message?.trim() ?? '';
    const attachments: Attachment[] = (body.attachmentIds ?? [])
      .map(getFile)
      .filter((f) => !!f)
      .map(toAttachment);
    if (!text && attachments.length === 0) {
      res.status(400).json({ error: 'Message is required' });
      return;
    }
    conversation ??= createConversation({
      title: 'New chat',
      projectId: body.projectId,
      temporary: body.temporary,
    });
    userMessage = addMessage({
      conversationId: conversation.id,
      parentId: body.parentId ?? null,
      role: 'user',
      content: text,
      attachments,
    });
  }

  const isFirstExchange = !userMessage.parent_id && conversation.title === 'New chat';
  const model = body.model && config.models.includes(body.model) ? body.model : settings.defaultModel;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });
  const send = (data: unknown) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(data)}\n\n`);
  };
  send({ type: 'meta', conversationId: conversation.id, userMessage, title: conversation.title, model });

  const abort = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) abort.abort();
  });

  const result: AgentResult = { text: '', meta: {} };
  let error: string | null = null;
  try {
    const history = pathTo(conversation.id, userMessage.id).slice(-config.limits.maxHistoryMessages);
    const instructions = await buildInstructions({
      conversation,
      settings,
      query: userMessage.content,
      tool: body.tool ?? null,
    });
    await runAgent(
      {
        conversationId: conversation.id,
        model,
        think: !!body.think,
        instructions,
        input: await toInput(history),
        webSearch: settings.webSearchAuto || body.tool === 'search',
        forceImage: body.tool === 'image',
        signal: abort.signal,
        emit: send,
      },
      result,
    );
  } catch (err) {
    if (!abort.signal.aborted) error = friendlyError(err);
  }

  const hasOutput = result.text.trim() || result.meta.images?.length || result.meta.canvas;
  if (!hasOutput) {
    if (error) send({ type: 'error', message: error });
    res.end();
    return;
  }

  if (abort.signal.aborted) result.meta.stopped = true;
  if (error) result.meta.error = error;
  const assistant = addMessage({
    conversationId: conversation.id,
    parentId: userMessage.id,
    role: 'assistant',
    content: result.text.trim(),
    meta: result.meta,
    model,
  });
  if (abort.signal.aborted) {
    res.end();
    return;
  }
  send({ type: 'done', message: assistant });

  const followUps: Promise<void>[] = [];
  if (isFirstExchange) {
    followUps.push(
      generateTitle(userMessage.content || 'Shared files', result.text)
        .then((title) => {
          updateConversation(conversation.id, { title });
          send({ type: 'title', title });
        })
        .catch(() => {}),
    );
  }
  if (settings.memoryEnabled && !conversation.temporary && userMessage.content && !body.regenerate) {
    followUps.push(
      extractMemories(userMessage.content, conversation.id)
        .then((saved) => {
          if (saved.length === 0) return;
          updateMessageMeta(assistant.id, { ...assistant.meta, memoryUpdated: saved });
          send({ type: 'memory', messageId: assistant.id, memories: saved });
        })
        .catch(() => {}),
    );
  }
  await Promise.all(followUps);
  res.end();
});
