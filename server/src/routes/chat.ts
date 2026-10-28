import { Router } from 'express';
import { addMessage, createConversation, getConversation, listMessages } from '../db/index.js';
import { streamChat } from '../services/openai.js';
import { config } from '../config.js';

export const chatRouter = Router();

function titleFrom(message: string): string {
  const oneLine = message.replace(/\s+/g, ' ').trim();
  return oneLine.length > 40 ? `${oneLine.slice(0, 40)}…` : oneLine || 'New chat';
}

chatRouter.post('/', async (req, res) => {
  const { conversationId, message, think } = req.body as {
    conversationId?: string;
    message?: string;
    think?: boolean;
  };

  if (!message?.trim()) {
    res.status(400).json({ error: 'Message is required' });
    return;
  }

  let conversation = conversationId ? getConversation(conversationId) : undefined;
  if (conversationId && !conversation) {
    res.status(404).json({ error: 'Conversation not found' });
    return;
  }
  conversation ??= createConversation(titleFrom(message));

  const prior = listMessages(conversation.id);
  const userMessage = addMessage({
    conversation_id: conversation.id,
    parent_id: prior.at(-1)?.id ?? null,
    role: 'user',
    content: message,
    model: null,
  });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
  });
  const send = (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  send({ type: 'meta', conversationId: conversation.id, userMessageId: userMessage.id, title: conversation.title });

  const abort = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) abort.abort();
  });

  let text = '';
  let error: string | null = null;
  try {
    const history = [...prior, userMessage]
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
    for await (const delta of streamChat(history, { think: !!think, signal: abort.signal })) {
      text += delta;
      send({ type: 'delta', text: delta });
    }
  } catch (err) {
    if (!abort.signal.aborted) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  if (text) {
    const assistant = addMessage({
      conversation_id: conversation.id,
      parent_id: userMessage.id,
      role: 'assistant',
      content: text,
      model: config.model,
    });
    if (!abort.signal.aborted) send({ type: 'done', messageId: assistant.id });
  }
  if (error) send({ type: 'error', message: error });
  res.end();
});
