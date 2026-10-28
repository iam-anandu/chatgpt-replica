import { Router } from 'express';
import { toFile } from 'openai';
import { config } from '../config.js';
import { getSettings } from '../db/settings.js';
import { checkLimit, recordUsage } from '../db/usage.js';
import { friendlyError, openai } from '../services/openai.js';
import { upload } from './files.js';

export const audioRouter = Router();

audioRouter.post('/transcribe', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No audio uploaded' });
    return;
  }
  try {
    checkLimit('voice');
    if (req.file.size < 1000) {
      res.status(400).json({ error: "The recording was empty. Check that the right microphone is selected." });
      return;
    }
    const result = await openai().audio.transcriptions.create({
      model: config.transcribeModel,
      file: await toFile(req.file.buffer, req.file.originalname || 'audio.webm', {
        type: req.file.mimetype.split(';')[0],
      }),
    });
    recordUsage({ audio_seconds: Number((req.body as { duration?: string }).duration) || 0 });
    res.json({ text: result.text });
  } catch (err) {
    res.status(500).json({ error: friendlyError(err) });
  }
});

audioRouter.post('/speech', async (req, res) => {
  const text = String((req.body as { text?: string }).text ?? '').slice(0, 4000);
  if (!text.trim()) {
    res.status(400).json({ error: 'Text is required' });
    return;
  }
  try {
    checkLimit('voice');
    const speech = await openai().audio.speech.create({
      model: config.ttsModel,
      voice: getSettings().voice || config.ttsVoice,
      input: text,
      response_format: 'mp3',
    });
    // ~15 characters per second of speech
    recordUsage({ audio_seconds: text.length / 15 });
    res.type('audio/mpeg');
    res.send(Buffer.from(await speech.arrayBuffer()));
  } catch (err) {
    res.status(500).json({ error: friendlyError(err) });
  }
});
