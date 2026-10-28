import express from 'express';
import { config } from './config.js';
import { chatRouter } from './routes/chat.js';
import { conversationsRouter } from './routes/conversations.js';

const app = express();
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, model: config.model, apiKeyConfigured: !!config.openaiApiKey });
});
app.use('/api/chat', chatRouter);
app.use('/api/conversations', conversationsRouter);

app.listen(config.port, () => {
  console.log(`Server listening on http://localhost:${config.port}`);
  if (!config.openaiApiKey) {
    console.warn('Warning: OPENAI_API_KEY is not set. Copy server/.env.example to server/.env and add your key.');
  }
});
