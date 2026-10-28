import { Router } from 'express';
import { all, get, newId, run } from '../db/index.js';
import {
  deleteConversation,
  getConversation,
  listConversations,
  listMessages,
  pathTo,
  updateConversation,
} from '../db/conversations.js';

export const conversationsRouter = Router();

conversationsRouter.get('/', (req, res) => {
  res.json(listConversations({ archived: req.query.archived === '1' }));
});

conversationsRouter.get('/:id', (req, res) => {
  const conversation = getConversation(req.params.id);
  if (!conversation) {
    res.status(404).json({ error: 'Conversation not found' });
    return;
  }
  const canvases = all('SELECT * FROM canvases WHERE conversation_id = ? ORDER BY created_at', conversation.id);
  res.json({ ...conversation, messages: listMessages(conversation.id), canvases });
});

conversationsRouter.patch('/:id', (req, res) => {
  const { title, pinned, archived, project_id, current_node_id } = req.body as Record<string, unknown>;
  const patch: Record<string, string | number | null> = {};
  if (typeof title === 'string' && title.trim()) patch.title = title.trim().slice(0, 120);
  if (typeof pinned === 'boolean') patch.pinned = pinned ? 1 : 0;
  if (typeof archived === 'boolean') patch.archived = archived ? 1 : 0;
  if (project_id === null || typeof project_id === 'string') patch.project_id = project_id;
  if (typeof current_node_id === 'string') patch.current_node_id = current_node_id;
  const updated = updateConversation(req.params.id, patch);
  if (!updated) {
    res.status(404).json({ error: 'Conversation not found' });
    return;
  }
  res.json(updated);
});

conversationsRouter.delete('/:id', (req, res) => {
  deleteConversation(req.params.id);
  res.status(204).end();
});

conversationsRouter.delete('/', (_req, res) => {
  run('DELETE FROM conversations');
  res.status(204).end();
});

conversationsRouter.post('/archive-all', (_req, res) => {
  run('UPDATE conversations SET archived = 1 WHERE temporary = 0');
  res.status(204).end();
});

conversationsRouter.post('/:id/share', (req, res) => {
  const conversation = getConversation(req.params.id);
  if (!conversation) {
    res.status(404).json({ error: 'Conversation not found' });
    return;
  }
  const leaf = (req.body as { leafId?: string }).leafId ?? conversation.current_node_id;
  const messages = pathTo(conversation.id, leaf).map(({ role, content, attachments, meta, created_at }) => ({
    role,
    content,
    attachments,
    meta: { sources: meta.sources, images: meta.images, canvas: meta.canvas },
    created_at,
  }));
  const id = newId();
  run(
    'INSERT INTO shares (id, conversation_id, snapshot, created_at) VALUES (?, ?, ?, ?)',
    id,
    conversation.id,
    JSON.stringify({ title: conversation.title, messages }),
    Date.now(),
  );
  res.json({ id, url: `/share/${id}` });
});

export const sharesRouter = Router();

sharesRouter.get('/:id', (req, res) => {
  const share = get<{ snapshot: string; created_at: number }>('SELECT snapshot, created_at FROM shares WHERE id = ?', req.params.id);
  if (!share) {
    res.status(404).json({ error: 'This shared link has been deleted or never existed.' });
    return;
  }
  res.json({ ...JSON.parse(share.snapshot), created_at: share.created_at });
});

export const messagesRouter = Router();

messagesRouter.patch('/:id', (req, res) => {
  const { feedback } = req.body as { feedback?: number };
  if (feedback !== undefined) run('UPDATE messages SET feedback = ? WHERE id = ?', Math.sign(feedback), req.params.id);
  res.status(204).end();
});
