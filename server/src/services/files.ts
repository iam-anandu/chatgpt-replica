import { readFile, unlink, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { extractText, getDocumentProxy } from 'unpdf';
import { all, get, newId, run, toBlob } from '../db/index.js';
import type { Attachment } from '../db/conversations.js';
import { embed } from './openai.js';
import { config } from '../config.js';

export interface FileRow {
  id: string;
  project_id: string | null;
  conversation_id: string | null;
  name: string;
  mime: string;
  path: string;
  size: number;
  source: 'upload' | 'generated';
  extracted_text: string | null;
  created_at: number;
}

const textExtensions = new Set([
  '.txt', '.md', '.csv', '.json', '.xml', '.yaml', '.yml', '.html', '.css', '.js', '.jsx', '.ts', '.tsx',
  '.py', '.java', '.c', '.cpp', '.h', '.cs', '.go', '.rs', '.rb', '.php', '.sh', '.sql', '.log', '.ini', '.toml',
]);

export const isImage = (mime: string) => mime.startsWith('image/');
export const isPdf = (mime: string, name: string) => mime === 'application/pdf' || name.toLowerCase().endsWith('.pdf');
export const isText = (mime: string, name: string) =>
  mime.startsWith('text/') || textExtensions.has(extname(name).toLowerCase());

export const fileUrl = (id: string) => `/api/files/${id}/content`;

export const toAttachment = (f: FileRow): Attachment => ({
  id: f.id,
  name: f.name,
  mime: f.mime,
  size: f.size,
  url: fileUrl(f.id),
});

export const getFile = (id: string) => get<FileRow>('SELECT * FROM files WHERE id = ?', id);

export async function extractFileText(buffer: Buffer, mime: string, name: string): Promise<string | null> {
  if (isText(mime, name)) return buffer.toString('utf8');
  if (isPdf(mime, name)) {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    const { text } = await extractText(pdf, { mergePages: true });
    return text;
  }
  return null;
}

export async function saveFile(opts: {
  buffer: Buffer;
  name: string;
  mime: string;
  source?: 'upload' | 'generated';
  projectId?: string | null;
  conversationId?: string | null;
}): Promise<FileRow> {
  const id = newId();
  const path = join(config.uploadsDir, `${id}${extname(opts.name) || ''}`);
  await writeFile(path, opts.buffer);
  const text = await extractFileText(opts.buffer, opts.mime, opts.name).catch(() => null);
  run(
    `INSERT INTO files (id, project_id, conversation_id, name, mime, path, size, source, extracted_text, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    opts.projectId ?? null,
    opts.conversationId ?? null,
    opts.name,
    opts.mime,
    path,
    opts.buffer.length,
    opts.source ?? 'upload',
    text,
    Date.now(),
  );
  return getFile(id)!;
}

export async function deleteFile(id: string) {
  const file = getFile(id);
  if (!file) return;
  run('DELETE FROM files WHERE id = ?', id);
  await unlink(file.path).catch(() => {});
}

export const readFileBase64 = async (f: FileRow) => (await readFile(f.path)).toString('base64');

function chunkText(text: string, size = 1200, overlap = 200): string[] {
  const clean = text.replace(/\s+\n/g, '\n').trim();
  const chunks: string[] = [];
  for (let i = 0; i < clean.length; i += size - overlap) {
    chunks.push(clean.slice(i, i + size));
    if (i + size >= clean.length) break;
  }
  return chunks;
}

/** Splits a project file into embedded chunks for retrieval. */
export async function indexProjectFile(file: FileRow) {
  if (!file.project_id || !file.extracted_text) return;
  const chunks = chunkText(file.extracted_text).slice(0, 500);
  for (let i = 0; i < chunks.length; i += 100) {
    const batch = chunks.slice(i, i + 100);
    const vectors = await embed(batch);
    batch.forEach((content, j) =>
      run(
        'INSERT INTO file_chunks (id, file_id, project_id, content, embedding) VALUES (?, ?, ?, ?, ?)',
        newId(),
        file.id,
        file.project_id,
        content,
        toBlob(vectors[j]),
      ),
    );
  }
}

export const listProjectFiles = (projectId: string) =>
  all<FileRow>('SELECT * FROM files WHERE project_id = ? ORDER BY created_at DESC', projectId);
