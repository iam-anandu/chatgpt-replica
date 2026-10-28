import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from '../config.js';

mkdirSync(dirname(config.dbPath), { recursive: true });

export const db = new DatabaseSync(config.dbPath);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));

export interface ConversationRow {
  id: string;
  title: string;
  project_id: string | null;
  pinned: number;
  archived: number;
  created_at: number;
  updated_at: number;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  parent_id: string | null;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model: string | null;
  created_at: number;
}

export function listConversations(): ConversationRow[] {
  return db
    .prepare('SELECT * FROM conversations WHERE archived = 0 ORDER BY updated_at DESC')
    .all() as unknown as ConversationRow[];
}

export function getConversation(id: string): ConversationRow | undefined {
  return db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as unknown as
    | ConversationRow
    | undefined;
}

export function createConversation(title: string): ConversationRow {
  const now = Date.now();
  const id = crypto.randomUUID();
  db.prepare(
    'INSERT INTO conversations (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)',
  ).run(id, title, now, now);
  return getConversation(id)!;
}

export function deleteConversation(id: string): void {
  db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
}

export function listMessages(conversationId: string): MessageRow[] {
  return db
    .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at, rowid')
    .all(conversationId) as unknown as MessageRow[];
}

export function addMessage(
  msg: Pick<MessageRow, 'conversation_id' | 'parent_id' | 'role' | 'content' | 'model'>,
): MessageRow {
  const now = Date.now();
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO messages (id, conversation_id, parent_id, role, content, model, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, msg.conversation_id, msg.parent_id, msg.role, msg.content, msg.model, now);
  db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now, msg.conversation_id);
  return { ...msg, id, created_at: now };
}
