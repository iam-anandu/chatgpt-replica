import { all, get, newId, run } from './index.js';

export interface ConversationRow {
  id: string;
  title: string;
  project_id: string | null;
  pinned: number;
  archived: number;
  temporary: number;
  current_node_id: string | null;
  created_at: number;
  updated_at: number;
}

export interface MessageMeta {
  sources?: { url: string; title: string }[];
  images?: { id: string; url: string; prompt: string }[];
  canvas?: { id: string; title: string; action: 'created' | 'updated' };
  memoryUpdated?: string[];
  error?: string;
  stopped?: boolean;
}

export interface Attachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  url: string;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  parent_id: string | null;
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments: string | null;
  meta: string | null;
  model: string | null;
  feedback: number;
  created_at: number;
}

export interface Message extends Omit<MessageRow, 'attachments' | 'meta'> {
  attachments: Attachment[];
  meta: MessageMeta;
}

export const parseMessage = (row: MessageRow): Message => ({
  ...row,
  attachments: row.attachments ? JSON.parse(row.attachments) : [],
  meta: row.meta ? JSON.parse(row.meta) : {},
});

export function listConversations(opts: { archived?: boolean } = {}): ConversationRow[] {
  return all<ConversationRow>(
    'SELECT * FROM conversations WHERE temporary = 0 AND archived = ? ORDER BY updated_at DESC',
    opts.archived ? 1 : 0,
  );
}

export const getConversation = (id: string) =>
  get<ConversationRow>('SELECT * FROM conversations WHERE id = ?', id);

export function createConversation(opts: {
  title: string;
  projectId?: string | null;
  temporary?: boolean;
}): ConversationRow {
  const now = Date.now();
  const id = newId();
  run(
    'INSERT INTO conversations (id, title, project_id, temporary, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    id,
    opts.title,
    opts.projectId ?? null,
    opts.temporary ? 1 : 0,
    now,
    now,
  );
  return getConversation(id)!;
}

const updatable = ['title', 'pinned', 'archived', 'project_id', 'current_node_id'] as const;
type Updatable = (typeof updatable)[number];

export function updateConversation(id: string, patch: Partial<Record<Updatable, string | number | null>>) {
  for (const key of updatable) {
    if (key in patch) run(`UPDATE conversations SET ${key} = ? WHERE id = ?`, patch[key] ?? null, id);
  }
  return getConversation(id);
}

export const touchConversation = (id: string) =>
  run('UPDATE conversations SET updated_at = ? WHERE id = ?', Date.now(), id);

export const deleteConversation = (id: string) => run('DELETE FROM conversations WHERE id = ?', id);

export const listMessages = (conversationId: string) =>
  all<MessageRow>('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at, rowid', conversationId).map(
    parseMessage,
  );

export const getMessage = (id: string) => {
  const row = get<MessageRow>('SELECT * FROM messages WHERE id = ?', id);
  return row && parseMessage(row);
};

export function addMessage(msg: {
  conversationId: string;
  parentId: string | null;
  role: 'user' | 'assistant';
  content: string;
  attachments?: Attachment[];
  meta?: MessageMeta;
  model?: string | null;
}): Message {
  const now = Date.now();
  const id = newId();
  run(
    `INSERT INTO messages (id, conversation_id, parent_id, role, content, attachments, meta, model, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    msg.conversationId,
    msg.parentId,
    msg.role,
    msg.content,
    msg.attachments?.length ? JSON.stringify(msg.attachments) : null,
    msg.meta ? JSON.stringify(msg.meta) : null,
    msg.model ?? null,
    now,
  );
  run('UPDATE conversations SET updated_at = ?, current_node_id = ? WHERE id = ?', now, id, msg.conversationId);
  return getMessage(id)!;
}

export function updateMessageMeta(id: string, meta: MessageMeta) {
  run('UPDATE messages SET meta = ? WHERE id = ?', JSON.stringify(meta), id);
}

/** Messages from the root down to `leafId`, following parent links. */
export function pathTo(conversationId: string, leafId: string | null): Message[] {
  if (!leafId) return [];
  const byId = new Map(listMessages(conversationId).map((m) => [m.id, m]));
  const path: Message[] = [];
  for (let node = byId.get(leafId); node; node = node.parent_id ? byId.get(node.parent_id) : undefined) {
    path.push(node);
  }
  return path.reverse();
}
