import { all, cosine, fromBlob, get } from '../db/index.js';
import type { ConversationRow } from '../db/conversations.js';
import type { Settings } from '../db/settings.js';
import { embed } from './openai.js';
import { relevantMemories } from './memory.js';

export type ToolHint = 'image' | 'search' | 'canvas' | null;

interface ContextInput {
  conversation: ConversationRow;
  settings: Settings;
  query: string;
  tool: ToolHint;
}

async function projectContext(projectId: string, query: string): Promise<string[]> {
  const project = get<{ name: string; instructions: string | null }>(
    'SELECT name, instructions FROM projects WHERE id = ?',
    projectId,
  );
  if (!project) return [];
  const parts = [`# Project: ${project.name}`];
  if (project.instructions?.trim()) parts.push(`Project instructions (follow these):\n${project.instructions.trim()}`);

  const chunks = all<{ content: string; embedding: Uint8Array | null; name: string }>(
    `SELECT c.content, c.embedding, f.name FROM file_chunks c JOIN files f ON f.id = c.file_id WHERE c.project_id = ?`,
    projectId,
  );
  if (chunks.length && query.trim()) {
    const [q] = await embed([query]);
    const top = chunks
      .map((c) => ({ c, score: fromBlob(c.embedding) ? cosine(q, fromBlob(c.embedding)!) : 0 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 6);
    parts.push(
      'Relevant excerpts from project files (cite the file name when you use them):\n' +
        top.map(({ c }) => `--- ${c.name} ---\n${c.content}`).join('\n\n'),
    );
  }

  const otherChats = all<{ title: string }>(
    'SELECT title FROM conversations WHERE project_id = ? AND temporary = 0 ORDER BY updated_at DESC LIMIT 15',
    projectId,
  );
  if (otherChats.length) parts.push(`Other chats in this project: ${otherChats.map((c) => c.title).join('; ')}`);
  return parts;
}

export async function buildInstructions({ conversation, settings, query, tool }: ContextInput): Promise<string> {
  const now = new Date();
  const parts = [
    `You are ChatGPT, a large language model. Be helpful, accurate and concise; use Markdown when it improves readability.
Current date: ${now.toISOString().slice(0, 10)}.

Tools:
- generate_image: use when the user asks to create, draw or edit an image. The image is shown to the user automatically; do not embed it in Markdown. Briefly describe what you made.
- create_canvas / update_canvas: use for long-form documents or substantial code the user will iterate on (essays, reports, full programs, web pages). Don't use canvas for short answers or snippets. After writing to the canvas, reply with a one or two sentence summary instead of repeating its content.
- web_search: use for current events, recent facts, prices, or anything you are unsure about. Cite sources.
- Math: write LaTeX with $...$ inline and $$...$$ for display.`,
  ];

  if (tool === 'image') parts.push('The user picked "Create image": call generate_image for this request.');
  if (tool === 'search') parts.push('The user picked "Search the web": you must search the web before answering.');
  if (tool === 'canvas') parts.push('The user picked "Canvas": write the result into a canvas with create_canvas or update_canvas.');

  const about = [
    settings.nickname && `Preferred name: ${settings.nickname}`,
    settings.occupation && `Occupation: ${settings.occupation}`,
    settings.aboutUser && `About the user: ${settings.aboutUser}`,
  ].filter(Boolean);
  if (about.length) parts.push(`# User profile\n${about.join('\n')}`);
  if (settings.responseStyle.trim()) {
    parts.push(`# How the user wants you to respond (follow this)\n${settings.responseStyle.trim()}`);
  }

  const useMemory = settings.memoryEnabled && !conversation.temporary;
  if (useMemory) {
    const memories = await relevantMemories(query).catch(() => []);
    if (memories.length) {
      parts.push(
        `# Saved memories about the user\nUse these naturally when relevant; don't list them unprompted.\n${memories.map((m) => `- ${m}`).join('\n')}`,
      );
    }
  }
  if (useMemory && settings.referenceChatHistory) {
    const recent = all<{ title: string; updated_at: number }>(
      `SELECT title, updated_at FROM conversations
       WHERE id != ? AND temporary = 0 AND archived = 0 AND title != 'New chat'
       ORDER BY updated_at DESC LIMIT 12`,
      conversation.id,
    );
    if (recent.length) {
      parts.push(
        `# Recent conversation topics\nBackground only: refer to these when the user mentions them; don't bring them up unprompted.\n${recent
          .map((c) => `- ${new Date(c.updated_at).toISOString().slice(0, 10)}: ${c.title}`)
          .join('\n')}`,
      );
    }
  }

  if (conversation.project_id) parts.push(...(await projectContext(conversation.project_id, query).catch(() => [])));

  const canvases = all<{ id: string; title: string; type: string; language: string | null; content: string }>(
    'SELECT id, title, type, language, content FROM canvases WHERE conversation_id = ? ORDER BY updated_at DESC LIMIT 3',
    conversation.id,
  );
  if (canvases.length) {
    parts.push(
      '# Open canvases in this chat (latest content, possibly edited by the user)\n' +
        canvases
          .map((c) => `canvas_id: ${c.id}\ntitle: ${c.title} (${c.type}${c.language ? `, ${c.language}` : ''})\n<<<\n${c.content.slice(0, 20000)}\n>>>`)
          .join('\n\n'),
    );
  }

  return parts.join('\n\n');
}
