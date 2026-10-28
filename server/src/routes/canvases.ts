import { Router } from 'express';
import { all, get } from '../db/index.js';
import { getCanvas, saveCanvasVersion } from '../services/tools.js';

export const canvasesRouter = Router();

const versions = (canvasId: string) =>
  all('SELECT id, source, created_at, content FROM canvas_versions WHERE canvas_id = ? ORDER BY created_at DESC LIMIT 50', canvasId);

canvasesRouter.get('/:id', (req, res) => {
  const canvas = getCanvas(req.params.id);
  if (!canvas) {
    res.status(404).json({ error: 'Canvas not found' });
    return;
  }
  res.json({ ...canvas, versions: versions(canvas.id) });
});

canvasesRouter.put('/:id', (req, res) => {
  const canvas = getCanvas(req.params.id);
  const content = (req.body as { content?: string }).content;
  if (!canvas || typeof content !== 'string') {
    res.status(400).json({ error: 'Invalid canvas update' });
    return;
  }
  if (content !== canvas.content) saveCanvasVersion(canvas.id, content, 'user');
  res.json({ ...getCanvas(canvas.id), versions: versions(canvas.id) });
});

canvasesRouter.post('/:id/restore', (req, res) => {
  const version = get<{ content: string; canvas_id: string }>(
    'SELECT content, canvas_id FROM canvas_versions WHERE id = ?',
    String((req.body as { versionId?: string }).versionId),
  );
  if (!version || version.canvas_id !== req.params.id) {
    res.status(404).json({ error: 'Version not found' });
    return;
  }
  saveCanvasVersion(req.params.id, version.content, 'user');
  res.json({ ...getCanvas(req.params.id), versions: versions(req.params.id) });
});
