import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from '../config.js';

mkdirSync(dirname(config.dbPath), { recursive: true });
mkdirSync(config.uploadsDir, { recursive: true });

export const db = new DatabaseSync(config.dbPath);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));

function addColumn(table: string, column: string, definition: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

addColumn('conversations', 'current_node_id', 'TEXT');
addColumn('conversations', 'temporary', 'INTEGER NOT NULL DEFAULT 0');
addColumn('messages', 'meta', 'TEXT');
addColumn('messages', 'feedback', 'INTEGER NOT NULL DEFAULT 0');
addColumn('files', 'conversation_id', 'TEXT REFERENCES conversations(id) ON DELETE SET NULL');
addColumn('files', 'source', "TEXT NOT NULL DEFAULT 'upload'");
addColumn('files', 'size', 'INTEGER NOT NULL DEFAULT 0');

// Temporary chats never outlive a server session.
db.exec('DELETE FROM conversations WHERE temporary = 1');

export const all = <T>(sql: string, ...params: SQLInputValue[]) =>
  db.prepare(sql).all(...params) as unknown as T[];

export const get = <T>(sql: string, ...params: SQLInputValue[]) =>
  db.prepare(sql).get(...params) as unknown as T | undefined;

export const run = (sql: string, ...params: SQLInputValue[]) => db.prepare(sql).run(...params);

export const newId = () => crypto.randomUUID();

export function toBlob(vector: number[]): Uint8Array {
  return new Uint8Array(new Float32Array(vector).buffer);
}

export function fromBlob(blob: Uint8Array | null): Float32Array | null {
  if (!blob) return null;
  const copy = new Uint8Array(blob);
  return new Float32Array(copy.buffer, 0, copy.byteLength / 4);
}

export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}
