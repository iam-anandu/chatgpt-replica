import OpenAI from 'openai';
import { config } from '../config.js';

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!config.openaiApiKey) {
    throw new Error('OPENAI_API_KEY is not set. Add it to server/.env and restart the server.');
  }
  client ??= new OpenAI({ apiKey: config.openaiApiKey });
  return client;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

function systemPrompt(): string {
  const today = new Date().toISOString().slice(0, 10);
  return [
    'You are ChatGPT, a large language model. Be helpful, accurate and concise.',
    'Format answers with Markdown when it improves readability.',
    `Current date: ${today}.`,
  ].join('\n');
}

export async function* streamChat(
  history: ChatTurn[],
  opts: { think: boolean; signal: AbortSignal },
): AsyncGenerator<string> {
  const stream = await getClient().responses.create(
    {
      model: config.model,
      instructions: systemPrompt(),
      input: history.map((m) => ({ role: m.role, content: m.content })),
      reasoning: {
        effort: (opts.think
          ? config.reasoningEffortThink
          : config.reasoningEffortDefault) as OpenAI.ReasoningEffort,
      },
      stream: true,
    },
    { signal: opts.signal },
  );

  for await (const event of stream) {
    if (event.type === 'response.output_text.delta') {
      yield event.delta;
    } else if (event.type === 'error') {
      throw new Error(event.message);
    } else if (event.type === 'response.failed') {
      throw new Error(event.response.error?.message ?? 'The response failed.');
    }
  }
}
