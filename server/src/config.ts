const num = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) && value !== '' && value !== undefined ? n : fallback;
};

const models = (process.env.OPENAI_MODELS ?? process.env.OPENAI_MODEL ?? 'gpt-5-mini')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);

export const config = {
  port: num(process.env.PORT, 3001),
  dbPath: process.env.DB_PATH ?? 'data/chatgpt.db',
  uploadsDir: process.env.UPLOADS_DIR ?? 'data/uploads',
  openaiApiKey: process.env.OPENAI_API_KEY ?? '',

  models,
  defaultModel: process.env.OPENAI_MODEL ?? models[0],
  utilityModel: process.env.UTILITY_MODEL ?? 'gpt-5-nano',
  reasoningEffortDefault: process.env.REASONING_EFFORT_DEFAULT ?? 'low',
  reasoningEffortThink: process.env.REASONING_EFFORT_THINK ?? 'high',

  imageModel: process.env.IMAGE_MODEL ?? 'gpt-image-1-mini',
  imageQuality: process.env.IMAGE_QUALITY ?? 'low',
  embeddingModel: process.env.EMBEDDING_MODEL ?? 'text-embedding-3-small',
  transcribeModel: process.env.TRANSCRIBE_MODEL ?? 'gpt-4o-mini-transcribe',
  ttsModel: process.env.TTS_MODEL ?? 'gpt-4o-mini-tts',
  ttsVoice: process.env.TTS_VOICE ?? 'coral',

  limits: {
    dailyTokens: num(process.env.DAILY_TOKEN_LIMIT, 0),
    dailyImages: num(process.env.DAILY_IMAGE_LIMIT, 20),
    dailyVoiceSeconds: num(process.env.DAILY_VOICE_MINUTES, 30) * 60,
    maxUploadMb: num(process.env.MAX_UPLOAD_MB, 20),
    maxMemories: num(process.env.MAX_MEMORIES, 200),
    maxHistoryMessages: num(process.env.MAX_HISTORY_MESSAGES, 40),
  },

  pricing: {
    inputPer1M: num(process.env.PRICE_INPUT_PER_1M, 0.25),
    outputPer1M: num(process.env.PRICE_OUTPUT_PER_1M, 2),
    perImage: num(process.env.PRICE_PER_IMAGE, 0.005),
    perAudioMinute: num(process.env.PRICE_PER_AUDIO_MINUTE, 0.003),
  },
};
