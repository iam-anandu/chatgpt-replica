import { all, run } from './index.js';
import { config } from '../config.js';

export interface Settings {
  theme: 'dark' | 'light' | 'system';
  defaultModel: string;
  memoryEnabled: boolean;
  referenceChatHistory: boolean;
  aboutUser: string;
  responseStyle: string;
  nickname: string;
  occupation: string;
  voice: string;
  webSearchAuto: boolean;
}

const defaults = (): Settings => ({
  theme: 'dark',
  defaultModel: config.defaultModel,
  memoryEnabled: true,
  referenceChatHistory: true,
  aboutUser: '',
  responseStyle: '',
  nickname: '',
  occupation: '',
  voice: config.ttsVoice,
  webSearchAuto: true,
});

export function getSettings(): Settings {
  const stored = Object.fromEntries(
    all<{ key: string; value: string }>('SELECT key, value FROM settings').map((r) => [r.key, JSON.parse(r.value)]),
  );
  return { ...defaults(), ...stored };
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const known = defaults();
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in known)) continue;
    run(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      key,
      JSON.stringify(value),
    );
  }
  return getSettings();
}
