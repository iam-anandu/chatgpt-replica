import type OpenAI from 'openai';
import { config } from '../config.js';
import type { Message, MessageMeta } from '../db/conversations.js';
import { recordUsage } from '../db/usage.js';
import { getFile, isImage, isPdf, readFileBase64 } from './files.js';
import { openai, reasoningFor } from './openai.js';
import { runTool, functionTools, type ToolEvent } from './tools.js';

type InputItem = OpenAI.Responses.ResponseInputItem;
type InputContent = OpenAI.Responses.ResponseInputContent;

const MAX_INLINE_TEXT = 100_000;

async function userContent(m: Message): Promise<InputContent[]> {
  const content: InputContent[] = [];
  const notes: string[] = [];
  for (const a of m.attachments) {
    const file = getFile(a.id);
    if (!file) continue;
    if (isImage(file.mime)) {
      notes.push(`[Attached image "${file.name}", image id: ${file.id}]`);
      content.push({
        type: 'input_image',
        detail: 'auto',
        image_url: `data:${file.mime};base64,${await readFileBase64(file)}`,
      });
    } else if (isPdf(file.mime, file.name)) {
      content.push({
        type: 'input_file',
        filename: file.name,
        file_data: `data:application/pdf;base64,${await readFileBase64(file)}`,
      });
    } else if (file.extracted_text) {
      notes.push(`File "${file.name}":\n\`\`\`\n${file.extracted_text.slice(0, MAX_INLINE_TEXT)}\n\`\`\``);
    } else {
      notes.push(`[Attached file "${file.name}" (${file.mime}) — its contents can't be read]`);
    }
  }
  content.unshift({ type: 'input_text', text: [m.content, ...notes].filter(Boolean).join('\n\n') || '(no text)' });
  return content;
}

function assistantText(m: Message): string {
  const notes: string[] = [];
  for (const img of m.meta.images ?? []) notes.push(`[Generated image id: ${img.id} — prompt: ${img.prompt}]`);
  if (m.meta.canvas) notes.push(`[Canvas ${m.meta.canvas.action}: "${m.meta.canvas.title}" (canvas_id: ${m.meta.canvas.id})]`);
  return [m.content, ...notes].filter(Boolean).join('\n\n') || '(no response)';
}

export async function toInput(history: Message[]): Promise<InputItem[]> {
  const items: InputItem[] = [];
  for (const m of history) {
    if (m.role === 'user') items.push({ role: 'user', content: await userContent(m) });
    else if (m.role === 'assistant') items.push({ role: 'assistant', content: assistantText(m) });
  }
  return items;
}

export type AgentEvent = { type: 'delta'; text: string } | { type: 'search'; status: string } | ToolEvent;

interface RunOptions {
  conversationId: string;
  model: string;
  think: boolean;
  instructions: string;
  input: InputItem[];
  webSearch: boolean;
  forceImage: boolean;
  signal: AbortSignal;
  emit: (e: AgentEvent) => void;
}

export interface AgentResult {
  text: string;
  meta: MessageMeta;
}

/**
 * Streams a reply, executing function tools until the model produces a final answer.
 * Progress is written into `out` so a partial reply survives an abort.
 */
export async function runAgent(opts: RunOptions, out: AgentResult): Promise<void> {
  const tools: OpenAI.Responses.Tool[] = [...functionTools];
  if (opts.webSearch) tools.push({ type: 'web_search' });

  const meta = out.meta;
  const sources = new Map<string, string>();
  let input = opts.input;
  let previousResponseId: string | undefined;

  for (let step = 0; step < 6; step++) {
    const stream = await openai().responses.create(
      {
        model: opts.model,
        instructions: opts.instructions,
        input,
        tools,
        tool_choice: step === 0 && opts.forceImage ? { type: 'function', name: 'generate_image' } : 'auto',
        previous_response_id: previousResponseId,
        ...reasoningFor(opts.model, opts.think ? config.reasoningEffortThink : config.reasoningEffortDefault),
        stream: true,
      },
      { signal: opts.signal },
    );

    const calls: OpenAI.Responses.ResponseFunctionToolCall[] = [];
    if (out.text && !out.text.endsWith('\n')) {
      out.text += '\n\n';
      opts.emit({ type: 'delta', text: '\n\n' });
    }

    for await (const event of stream) {
      switch (event.type) {
        case 'response.output_text.delta':
          out.text += event.delta;
          opts.emit({ type: 'delta', text: event.delta });
          break;
        case 'response.web_search_call.in_progress':
        case 'response.web_search_call.searching':
          opts.emit({ type: 'search', status: 'Searching the web' });
          break;
        case 'response.output_item.done':
          if (event.item.type === 'function_call') calls.push(event.item);
          break;
        case 'response.completed': {
          previousResponseId = event.response.id;
          const u = event.response.usage;
          recordUsage({ input_tokens: u?.input_tokens, output_tokens: u?.output_tokens });
          for (const item of event.response.output) {
            if (item.type !== 'message') continue;
            for (const part of item.content) {
              if (part.type !== 'output_text') continue;
              for (const a of part.annotations) {
                if (a.type === 'url_citation') sources.set(a.url, a.title);
              }
            }
          }
          if (sources.size) meta.sources = [...sources].map(([url, title]) => ({ url, title }));
          break;
        }
        case 'response.failed':
          throw new Error(event.response.error?.message ?? 'The response failed.');
        case 'error':
          throw new Error(event.message);
      }
    }

    if (calls.length === 0) break;

    input = [];
    for (const call of calls) {
      let output: unknown;
      try {
        output = await runTool(call.name, JSON.parse(call.arguments || '{}'), {
          conversationId: opts.conversationId,
          emit: (e) => {
            if (e.type === 'image') (meta.images ??= []).push(e.image);
            if (e.type === 'canvas') meta.canvas = { id: e.canvas.id, title: e.canvas.title, action: e.action };
            opts.emit(e);
          },
        });
      } catch (err) {
        output = { error: err instanceof Error ? err.message : String(err) };
      }
      input.push({ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(output) });
    }
  }
}
