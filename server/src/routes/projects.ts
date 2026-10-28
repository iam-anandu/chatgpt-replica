import { Router } from 'express';
import { all, get, newId, run } from '../db/index.js';
import { deleteFile, listProjectFiles, toAttachment } from '../services/files.js';

export interface ProjectRow {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  instructions: string | null;
  created_at: number;
}

export const projectsRouter = Router();

projectsRouter.get('/', (_req, res) => {
  res.json(all<ProjectRow>('SELECT * FROM projects ORDER BY created_at'));
});

projectsRouter.post('/', (req, res) => {
  const { name, color } = req.body as { name?: string; color?: string };
  const id = newId();
  run(
    'INSERT INTO projects (id, name, color, instructions, created_at) VALUES (?, ?, ?, ?, ?)',
    id,
    name?.trim() || 'Untitled project',
    color ?? null,
    '',
    Date.now(),
  );
  res.json(get<ProjectRow>('SELECT * FROM projects WHERE id = ?', id));
});

projectsRouter.get('/:id', (req, res) => {
  const project = get<ProjectRow>('SELECT * FROM projects WHERE id = ?', req.params.id);
  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }
  const conversations = all(
    'SELECT * FROM conversations WHERE project_id = ? AND temporary = 0 AND archived = 0 ORDER BY updated_at DESC',
    project.id,
  );
  res.json({ ...project, conversations, files: listProjectFiles(project.id).map(toAttachment) });
});

projectsRouter.patch('/:id', (req, res) => {
  const { name, instructions, color } = req.body as Partial<ProjectRow>;
  if (typeof name === 'string' && name.trim()) run('UPDATE projects SET name = ? WHERE id = ?', name.trim(), req.params.id);
  if (typeof instructions === 'string') run('UPDATE projects SET instructions = ? WHERE id = ?', instructions, req.params.id);
  if (typeof color === 'string') run('UPDATE projects SET color = ? WHERE id = ?', color, req.params.id);
  res.json(get<ProjectRow>('SELECT * FROM projects WHERE id = ?', req.params.id));
});

projectsRouter.delete('/:id', async (req, res) => {
  for (const f of listProjectFiles(req.params.id)) await deleteFile(f.id);
  run('DELETE FROM conversations WHERE project_id = ?', req.params.id);
  run('DELETE FROM projects WHERE id = ?', req.params.id);
  res.status(204).end();
});
