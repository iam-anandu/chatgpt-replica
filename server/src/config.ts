export const config = {
  port: Number(process.env.PORT ?? 3001),
  dbPath: process.env.DB_PATH ?? 'data/chatgpt.db',
  openaiApiKey: process.env.OPENAI_API_KEY ?? '',
  model: process.env.OPENAI_MODEL ?? 'gpt-5-mini',
  reasoningEffortDefault: process.env.REASONING_EFFORT_DEFAULT ?? 'low',
  reasoningEffortThink: process.env.REASONING_EFFORT_THINK ?? 'high',
};
