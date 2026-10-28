import { Router } from 'express';
import multer from 'multer';
import { resolve } from 'node:path';
import { config } from '../config.js';
import { deleteFile, getFile, indexProjectFile, saveFile, toAttachment } from '../services/files.js';
import { friendlyError } from '../services/openai.js';

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.limits.maxUploadMb * 1024 * 1024 },
});

export const filesRouter = Router();

filesRouter.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }
  const projectId = (req.body as { projectId?: string }).projectId || null;
  const file = await saveFile({
    buffer: req.file.buffer,
    name: Buffer.from(req.file.originalname, 'latin1').toString('utf8'),
    mime: req.file.mimetype || 'application/octet-stream',
    projectId,
  });
  let warning: string | undefined;
  if (projectId) {
    await indexProjectFile(file).catch((err) => {
      warning = `Uploaded, but couldn't index for search: ${friendlyError(err)}`;
    });
  }
  res.json({ ...toAttachment(file), warning });
});

filesRouter.get('/:id/content', (req, res) => {
  const file = getFile(req.params.id);
  if (!file) {
    res.status(404).end();
    return;
  }
  res.type(file.mime);
  if (req.query.download) res.attachment(file.name);
  res.sendFile(resolve(file.path));
});

filesRouter.delete('/:id', async (req, res) => {
  await deleteFile(req.params.id);
  res.status(204).end();
});
