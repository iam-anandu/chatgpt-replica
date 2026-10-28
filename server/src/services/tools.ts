import { readFile } from 'node:fs/promises';
import type OpenAI from 'openai';
import { toFile } from 'openai';
import { get, newId, run } from '../db/index.js';
import { checkLimit, recordUsage } from '../db/usage.js';
import { config } from '../config.js';
import { fileUrl, getFile, saveFile } from './files.js';
import { openai } from './openai.js';

export const functionTools: OpenAI.Responses.FunctionTool[] = [
  {
    type: 'function',
    name: 'generate_image',
    description: 'Create a new image, or edit/combine existing images when source_image_ids are given.',
    strict: false,
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Detailed description of the image to produce.' },
        size: { type: 'string', enum: ['1024x1024', '1536x1024', '1024x1536'] },
        source_image_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'IDs of user-attached or previously generated images to edit or use as reference.',
        },
      },
      required: ['prompt'],
    },
  },
  {
    type: 'function',
    name: 'create_canvas',
    description: 'Open a new canvas (side-by-side editor) with a document or code.',
    strict: false,
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        type: { type: 'string', enum: ['document', 'code'] },
        language: { type: 'string', description: 'For code: e.g. javascript, python, html, css, typescript.' },
        content: { type: 'string', description: 'Full content. Markdown for documents.' },
      },
      required: ['title', 'type', 'content'],
    },
  },
  {
    type: 'function',
    name: 'update_canvas',
    description: 'Replace the full content of an existing canvas.',
    strict: false,
    parameters: {
      type: 'object',
      properties: {
        canvas_id: { type: 'string' },
        content: { type: 'string', description: 'The complete new content.' },
      },
      required: ['canvas_id', 'content'],
    },
  },
];

export interface CanvasRow {
  id: string;
  conversation_id: string;
  title: string;
  type: 'document' | 'code';
  language: string | null;
  content: string;
  created_at: number;
  updated_at: number;
}

export const getCanvas = (id: string) => get<CanvasRow>('SELECT * FROM canvases WHERE id = ?', id);

export function saveCanvasVersion(canvasId: string, content: string, source: 'assistant' | 'user') {
  run('UPDATE canvases SET content = ?, updated_at = ? WHERE id = ?', content, Date.now(), canvasId);
  run(
    'INSERT INTO canvas_versions (id, canvas_id, content, source, created_at) VALUES (?, ?, ?, ?, ?)',
    newId(),
    canvasId,
    content,
    source,
    Date.now(),
  );
}

export type ToolEvent =
  | { type: 'status'; text: string }
  | { type: 'image'; image: { id: string; url: string; prompt: string } }
  | { type: 'canvas'; canvas: CanvasRow; action: 'created' | 'updated' };

export async function runTool(
  name: string,
  args: Record<string, unknown>,
  ctx: { conversationId: string; emit: (e: ToolEvent) => void },
): Promise<unknown> {
  switch (name) {
    case 'generate_image': {
      checkLimit('images');
      ctx.emit({ type: 'status', text: 'Creating image' });
      const prompt = String(args.prompt ?? '');
      const size = (args.size as '1024x1024' | '1536x1024' | '1024x1536') ?? '1024x1024';
      const sourceIds = (Array.isArray(args.source_image_ids) ? args.source_image_ids : []).map(String);
      const sources = sourceIds.map(getFile).filter((f) => f && f.mime.startsWith('image/'));

      const common = { model: config.imageModel, prompt, size, n: 1 } as const;
      const quality = config.imageQuality as 'low' | 'medium' | 'high' | 'auto';
      const result = sources.length
        ? await openai().images.edit({
            ...common,
            quality,
            image: await Promise.all(
              sources.map(async (f) => toFile(await readFile(f!.path), f!.name, { type: f!.mime })),
            ),
          })
        : await openai().images.generate({ ...common, quality });

      const b64 = result.data?.[0]?.b64_json;
      if (!b64) throw new Error('The image model returned no image.');
      recordUsage({ images: 1 });
      const file = await saveFile({
        buffer: Buffer.from(b64, 'base64'),
        name: `image-${Date.now()}.png`,
        mime: 'image/png',
        source: 'generated',
        conversationId: ctx.conversationId,
      });
      const image = { id: file.id, url: fileUrl(file.id), prompt };
      ctx.emit({ type: 'image', image });
      return { image_id: file.id, status: 'Image generated and already shown to the user.' };
    }

    case 'create_canvas': {
      const id = newId();
      const now = Date.now();
      const type = args.type === 'code' ? 'code' : 'document';
      run(
        `INSERT INTO canvases (id, conversation_id, title, type, language, content, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        id,
        ctx.conversationId,
        String(args.title ?? 'Untitled'),
        type,
        type === 'code' ? String(args.language ?? 'plaintext') : null,
        '',
        now,
        now,
      );
      saveCanvasVersion(id, String(args.content ?? ''), 'assistant');
      ctx.emit({ type: 'canvas', canvas: getCanvas(id)!, action: 'created' });
      return { canvas_id: id, status: 'Canvas created and shown to the user.' };
    }

    case 'update_canvas': {
      const canvas = getCanvas(String(args.canvas_id));
      if (!canvas || canvas.conversation_id !== ctx.conversationId) return { error: 'Canvas not found.' };
      saveCanvasVersion(canvas.id, String(args.content ?? ''), 'assistant');
      ctx.emit({ type: 'canvas', canvas: getCanvas(canvas.id)!, action: 'updated' });
      return { canvas_id: canvas.id, status: 'Canvas updated.' };
    }

    default:
      return { error: `Unknown tool ${name}` };
  }
}
