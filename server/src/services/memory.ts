import { all, cosine, fromBlob, get, newId, run, toBlob } from '../db/index.js';
import { config } from '../config.js';
import { embed, quickJson } from './openai.js';

export interface MemoryRow {
  id: string;
  content: string;
  embedding: Uint8Array | null;
  source_conversation_id: string | null;
  created_at: number;
}

export const listMemories = () =>
  all<MemoryRow>('SELECT * FROM memories ORDER BY created_at DESC').map(({ embedding: _e, ...m }) => m);

export const memoryCount = () => get<{ n: number }>('SELECT COUNT(*) AS n FROM memories')!.n;

export async function addMemory(content: string, conversationId: string | null = null) {
  const [vector] = await embed([content]).catch(() => [null]);
  const id = newId();
  run(
    'INSERT INTO memories (id, content, embedding, source_conversation_id, created_at) VALUES (?, ?, ?, ?, ?)',
    id,
    content,
    vector ? toBlob(vector) : null,
    conversationId,
    Date.now(),
  );
  return id;
}

export const deleteMemory = (id: string) => run('DELETE FROM memories WHERE id = ?', id);
export const clearMemories = () => run('DELETE FROM memories');

const ALWAYS_INCLUDE_UP_TO = 30;

/** Memories relevant to `query`: all of them when few, otherwise the closest by embedding. */
export async function relevantMemories(query: string, limit = 15): Promise<string[]> {
  const rows = all<MemoryRow>('SELECT * FROM memories ORDER BY created_at');
  if (rows.length <= ALWAYS_INCLUDE_UP_TO) return rows.map((r) => r.content);
  const [q] = await embed([query]);
  return rows
    .map((r) => ({ r, score: fromBlob(r.embedding) ? cosine(q, fromBlob(r.embedding)!) : 0 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.r.content);
}

const extractionPrompt = `You maintain long-term memory for an AI assistant about its single user.
Given the user's latest message and the facts already saved, return NEW durable facts worth remembering
across future conversations: name, preferences, profession, projects, goals, relationships, location,
recurring constraints, or anything the user explicitly asks to remember.
Do NOT save: one-off requests or formatting instructions for the current reply (e.g. "answer in one sentence"), transient details, the assistant's own content, sensitive data
(passwords, financial/medical identifiers) unless the user explicitly asked, or anything already saved.
Write each fact as a short sentence, e.g. "Prefers concise answers." or "Works as a .NET developer."
Return an empty list when nothing qualifies — that is the common case.`;

export async function extractMemories(userMessage: string, conversationId: string): Promise<string[]> {
  if (memoryCount() >= config.limits.maxMemories) return [];
  const existing = all<{ content: string }>('SELECT content FROM memories ORDER BY created_at DESC LIMIT 100');
  const { memories } = await quickJson<{ memories: string[] }>(
    `Already saved:\n${existing.map((m) => `- ${m.content}`).join('\n') || '(none)'}\n\nUser message:\n${userMessage.slice(0, 4000)}`,
    'memories',
    {
      type: 'object',
      properties: { memories: { type: 'array', items: { type: 'string' } } },
      required: ['memories'],
      additionalProperties: false,
    },
    extractionPrompt,
  );
  const fresh = memories.map((m) => m.trim()).filter(Boolean).slice(0, 5);
  for (const m of fresh) await addMemory(m, conversationId);
  return fresh;
}
