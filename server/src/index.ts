import express, { type ErrorRequestHandler } from 'express';
import { MulterError } from 'multer';
import { config } from './config.js';
import { accountRouter } from './routes/account.js';
import { audioRouter } from './routes/audio.js';
import { canvasesRouter } from './routes/canvases.js';
import { chatRouter } from './routes/chat.js';
import { conversationsRouter, messagesRouter, sharesRouter } from './routes/conversations.js';
import { filesRouter } from './routes/files.js';
import { projectsRouter } from './routes/projects.js';

const app = express();
app.use(express.json({ limit: '5mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, apiKeyConfigured: !!config.openaiApiKey });
});
app.use('/api/chat', chatRouter);
app.use('/api/conversations', conversationsRouter);
app.use('/api/messages', messagesRouter);
app.use('/api/shares', sharesRouter);
app.use('/api/files', filesRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/audio', audioRouter);
app.use('/api/canvases', canvasesRouter);
app.use('/api', accountRouter);

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof MulterError && err.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json({ error: `File is too large (max ${config.limits.maxUploadMb} MB).` });
    return;
  }
  console.error(err);
  if (!res.headersSent) res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
};
app.use(errorHandler);

app.listen(config.port, () => {
  console.log(`Server listening on http://localhost:${config.port}`);
  if (!config.openaiApiKey) {
    console.warn('Warning: OPENAI_API_KEY is not set. Copy server/.env.example to server/.env and add your key.');
  }
});
