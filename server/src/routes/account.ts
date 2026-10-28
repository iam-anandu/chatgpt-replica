import { Router } from 'express';
import { config } from '../config.js';
import { all, run } from '../db/index.js';
import { listConversations, listMessages } from '../db/conversations.js';
import { getSettings, updateSettings } from '../db/settings.js';
import { usageReport } from '../db/usage.js';
import { addMemory, clearMemories, deleteMemory, listMemories } from '../services/memory.js';
import { fileUrl } from '../services/files.js';

export const accountRouter = Router();

accountRouter.get('/config', (_req, res) => {
  res.json({
    models: config.models,
    defaultModel: config.defaultModel,
    apiKeyConfigured: !!config.openaiApiKey,
    maxUploadMb: config.limits.maxUploadMb,
  });
});

accountRouter.get('/settings', (_req, res) => res.json(getSettings()));
accountRouter.patch('/settings', (req, res) => res.json(updateSettings(req.body)));

accountRouter.get('/usage', (_req, res) => res.json(usageReport()));

accountRouter.get('/memories', (_req, res) => res.json({ memories: listMemories(), max: config.limits.maxMemories }));
accountRouter.post('/memories', async (req, res) => {
  const content = String((req.body as { content?: string }).content ?? '').trim();
  if (!content) {
    res.status(400).json({ error: 'Memory content is required' });
    return;
  }
  res.json({ id: await addMemory(content) });
});
accountRouter.delete('/memories/:id', (req, res) => {
  deleteMemory(req.params.id);
  res.status(204).end();
});
accountRouter.delete('/memories', (_req, res) => {
  clearMemories();
  res.status(204).end();
});

accountRouter.get('/search', (req, res) => {
  const q = String(req.query.q ?? '').trim();
  if (!q) {
    res.json(listConversations().slice(0, 20).map((c) => ({ ...c, snippet: null })));
    return;
  }
  const like = `%${q.replace(/[%_]/g, '\\$&')}%`;
  const rows = all<{ id: string; title: string; updated_at: number; project_id: string | null; snippet: string | null }>(
    `SELECT c.id, c.title, c.updated_at, c.project_id,
       (SELECT m.content FROM messages m WHERE m.conversation_id = c.id AND m.content LIKE ? ESCAPE '\\' LIMIT 1) AS snippet
     FROM conversations c
     WHERE c.temporary = 0 AND (c.title LIKE ? ESCAPE '\\' OR EXISTS (
       SELECT 1 FROM messages m WHERE m.conversation_id = c.id AND m.content LIKE ? ESCAPE '\\'))
     ORDER BY c.updated_at DESC LIMIT 50`,
    like,
    like,
    like,
  );
  res.json(
    rows.map((r) => {
      if (!r.snippet) return r;
      const i = r.snippet.toLowerCase().indexOf(q.toLowerCase());
      const start = Math.max(0, i - 40);
      return { ...r, snippet: (start > 0 ? '…' : '') + r.snippet.slice(start, start + 140).replace(/\s+/g, ' ') };
    }),
  );
});

accountRouter.get('/library', (_req, res) => {
  const files = all<{ id: string; name: string; source: string; conversation_id: string | null; created_at: number }>(
    `SELECT id, name, source, conversation_id, created_at FROM files WHERE mime LIKE 'image/%' ORDER BY created_at DESC`,
  );
  res.json(files.map((f) => ({ ...f, url: fileUrl(f.id) })));
});

accountRouter.get('/export', (_req, res) => {
  const conversations = [...listConversations(), ...listConversations({ archived: true })].map((c) => ({
    ...c,
    messages: listMessages(c.id).map(({ id, parent_id, role, content, attachments, meta, model, created_at }) => ({
      id,
      parent_id,
      role,
      content,
      attachments,
      meta,
      model,
      created_at,
    })),
  }));
  res.attachment(`chatgpt-export-${new Date().toISOString().slice(0, 10)}.json`);
  res.json({
    exported_at: new Date().toISOString(),
    settings: getSettings(),
    memories: listMemories(),
    projects: all('SELECT * FROM projects'),
    conversations,
  });
});

accountRouter.delete('/data', (_req, res) => {
  run('DELETE FROM conversations');
  clearMemories();
  res.status(204).end();
});
