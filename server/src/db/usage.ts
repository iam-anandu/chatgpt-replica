import { all, get, run } from './index.js';
import { config } from '../config.js';

export interface UsageRow {
  date: string;
  input_tokens: number;
  output_tokens: number;
  images: number;
  audio_seconds: number;
}

const today = () => new Date().toISOString().slice(0, 10);

export function recordUsage(delta: Partial<Omit<UsageRow, 'date'>>) {
  run(
    `INSERT INTO usage (date, input_tokens, output_tokens, images, audio_seconds) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET
       input_tokens = input_tokens + excluded.input_tokens,
       output_tokens = output_tokens + excluded.output_tokens,
       images = images + excluded.images,
       audio_seconds = audio_seconds + excluded.audio_seconds`,
    today(),
    delta.input_tokens ?? 0,
    delta.output_tokens ?? 0,
    delta.images ?? 0,
    Math.round(delta.audio_seconds ?? 0),
  );
}

export const todayUsage = (): UsageRow =>
  get<UsageRow>('SELECT * FROM usage WHERE date = ?', today()) ?? {
    date: today(),
    input_tokens: 0,
    output_tokens: 0,
    images: 0,
    audio_seconds: 0,
  };

export function estimateCost(u: Omit<UsageRow, 'date'>): number {
  const p = config.pricing;
  return (
    (u.input_tokens / 1e6) * p.inputPer1M +
    (u.output_tokens / 1e6) * p.outputPer1M +
    u.images * p.perImage +
    (u.audio_seconds / 60) * p.perAudioMinute
  );
}

export function usageReport() {
  const days = all<UsageRow>('SELECT * FROM usage ORDER BY date DESC LIMIT 30');
  return {
    today: { ...todayUsage(), cost: estimateCost(todayUsage()) },
    days: days.map((d) => ({ ...d, cost: estimateCost(d) })),
    limits: config.limits,
  };
}

export class LimitError extends Error {
  status = 429;
}

export function checkLimit(kind: 'tokens' | 'images' | 'voice') {
  const u = todayUsage();
  const l = config.limits;
  if (kind === 'tokens' && l.dailyTokens > 0 && u.input_tokens + u.output_tokens >= l.dailyTokens) {
    throw new LimitError("You've reached your daily message limit. It resets tomorrow, or raise DAILY_TOKEN_LIMIT.");
  }
  if (kind === 'images' && l.dailyImages > 0 && u.images >= l.dailyImages) {
    throw new LimitError("You've reached your daily image limit. It resets tomorrow, or raise DAILY_IMAGE_LIMIT.");
  }
  if (kind === 'voice' && l.dailyVoiceSeconds > 0 && u.audio_seconds >= l.dailyVoiceSeconds) {
    throw new LimitError("You've reached your daily voice limit. It resets tomorrow, or raise DAILY_VOICE_MINUTES.");
  }
}
