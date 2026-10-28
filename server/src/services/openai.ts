import OpenAI from 'openai';
import { config } from '../config.js';
import { recordUsage } from '../db/usage.js';

let client: OpenAI | null = null;

export function openai(): OpenAI {
  if (!config.openaiApiKey) {
    throw new Error('OPENAI_API_KEY is not set. Add it to server/.env and restart the server.');
  }
  client ??= new OpenAI({ apiKey: config.openaiApiKey });
  return client;
}

const supportsReasoning = (model: string) => /^(gpt-5|o\d)/.test(model);

export function reasoningFor(model: string, effort: string) {
  return supportsReasoning(model) ? { reasoning: { effort: effort as OpenAI.ReasoningEffort } } : {};
}

/** Turns OpenAI/network errors into messages a user can act on. */
export function friendlyError(err: unknown): string {
  if (err instanceof OpenAI.APIConnectionError) {
    return "Couldn't reach OpenAI. Check your internet connection and try again.";
  }
  if (err instanceof OpenAI.APIError) {
    if (err.status === 401) return 'Your OpenAI API key was rejected. Check OPENAI_API_KEY in server/.env (it should start with "sk-").';
    if (err.status === 429 && err.code === 'insufficient_quota') {
      return 'Your OpenAI account has run out of credit. Add credit under Billing at platform.openai.com.';
    }
    if (err.status === 429) return 'OpenAI rate limit reached. Wait a moment and try again.';
    if (err.status === 404) return `Model not available for your API key: ${err.message}`;
    if (err.status && err.status >= 500) return 'OpenAI is having trouble right now. Please try again.';
    return err.message;
  }
  return err instanceof Error ? err.message : String(err);
}

export async function quickText(input: string, opts: { instructions?: string } = {}): Promise<string> {
  const res = await openai().responses.create({
    model: config.utilityModel,
    instructions: opts.instructions,
    input,
    ...reasoningFor(config.utilityModel, 'minimal'),
  });
  recordUsage({ input_tokens: res.usage?.input_tokens, output_tokens: res.usage?.output_tokens });
  return res.output_text.trim();
}

export async function quickJson<T>(input: string, name: string, schema: Record<string, unknown>, instructions?: string): Promise<T> {
  const res = await openai().responses.create({
    model: config.utilityModel,
    instructions,
    input,
    text: { format: { type: 'json_schema', name, schema, strict: true } },
    ...reasoningFor(config.utilityModel, 'minimal'),
  });
  recordUsage({ input_tokens: res.usage?.input_tokens, output_tokens: res.usage?.output_tokens });
  return JSON.parse(res.output_text) as T;
}

export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const res = await openai().embeddings.create({ model: config.embeddingModel, input: texts });
  recordUsage({ input_tokens: res.usage.prompt_tokens });
  return res.data.map((d) => d.embedding);
}
