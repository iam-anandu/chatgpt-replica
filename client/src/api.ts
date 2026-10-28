export interface Conversation {
  id: string;
  title: string;
  project_id: string | null;
  pinned: number;
  archived: number;
  temporary: number;
  current_node_id: string | null;
  created_at: number;
  updated_at: number;
}

export interface Attachment {
  id: string;
  name: string;
  mime: string;
  size: number;
  url: string;
}

export interface GeneratedImage {
  id: string;
  url: string;
  prompt: string;
}

export interface MessageMeta {
  sources?: { url: string; title: string }[];
  images?: GeneratedImage[];
  canvas?: { id: string; title: string; action: 'created' | 'updated' };
  memoryUpdated?: string[];
  error?: string;
  stopped?: boolean;
}

export interface Message {
  id: string;
  conversation_id?: string;
  parent_id: string | null;
  role: 'user' | 'assistant';
  content: string;
  attachments: Attachment[];
  meta: MessageMeta;
  model: string | null;
  feedback: number;
  created_at: number;
}

export interface Canvas {
  id: string;
  conversation_id: string;
  title: string;
  type: 'document' | 'code';
  language: string | null;
  content: string;
  updated_at: number;
  versions?: { id: string; source: 'assistant' | 'user'; created_at: number; content: string }[];
}

export interface Project {
  id: string;
  name: string;
  color: string | null;
  instructions: string | null;
  created_at: number;
}

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

export interface AppConfig {
  models: string[];
  defaultModel: string;
  apiKeyConfigured: boolean;
  maxUploadMb: number;
}

export interface Memory {
  id: string;
  content: string;
  created_at: number;
}

export interface UsageDay {
  date: string;
  input_tokens: number;
  output_tokens: number;
  images: number;
  audio_seconds: number;
  cost: number;
}

export interface UsageReport {
  today: UsageDay;
  days: UsageDay[];
  limits: { dailyTokens: number; dailyImages: number; dailyVoiceSeconds: number; maxMemories: number };
}

export interface SearchResult {
  id: string;
  title: string;
  updated_at: number;
  project_id: string | null;
  snippet: string | null;
}

export interface LibraryItem {
  id: string;
  name: string;
  url: string;
  source: 'upload' | 'generated';
  conversation_id: string | null;
  created_at: number;
}

export interface SharedConversation {
  title: string;
  created_at: number;
  messages: Pick<Message, 'role' | 'content' | 'attachments' | 'meta' | 'created_at'>[];
}

export type ToolHint = 'image' | 'search' | 'canvas' | null;

export type StreamEvent =
  | { type: 'meta'; conversationId: string; userMessage: Message; title: string; model: string }
  | { type: 'delta'; text: string }
  | { type: 'status'; text: string }
  | { type: 'search'; status: string }
  | { type: 'image'; image: GeneratedImage }
  | { type: 'canvas'; canvas: Canvas; action: 'created' | 'updated' }
  | { type: 'done'; message: Message }
  | { type: 'title'; title: string }
  | { type: 'memory'; messageId: string; memories: string[] }
  | { type: 'error'; message: string };

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const jsonBody = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const api = {
  config: () => request<AppConfig>('/api/config'),
  settings: () => request<Settings>('/api/settings'),
  updateSettings: (patch: Partial<Settings>) => request<Settings>('/api/settings', jsonBody('PATCH', patch)),
  usage: () => request<UsageReport>('/api/usage'),

  listConversations: (archived = false) =>
    request<Conversation[]>(`/api/conversations${archived ? '?archived=1' : ''}`),
  getConversation: (id: string) =>
    request<Conversation & { messages: Message[]; canvases: Canvas[] }>(`/api/conversations/${id}`),
  updateConversation: (id: string, patch: Partial<Omit<Conversation, 'pinned' | 'archived'>> & { pinned?: boolean; archived?: boolean }) =>
    request<Conversation>(`/api/conversations/${id}`, jsonBody('PATCH', patch)),
  deleteConversation: (id: string) => request<void>(`/api/conversations/${id}`, { method: 'DELETE' }),
  deleteAllConversations: () => request<void>('/api/conversations', { method: 'DELETE' }),
  archiveAll: () => request<void>('/api/conversations/archive-all', { method: 'POST' }),
  share: (id: string, leafId?: string | null) =>
    request<{ id: string; url: string }>(`/api/conversations/${id}/share`, jsonBody('POST', { leafId })),
  getShare: (id: string) => request<SharedConversation>(`/api/shares/${id}`),

  setFeedback: (id: string, feedback: number) => request<void>(`/api/messages/${id}`, jsonBody('PATCH', { feedback })),

  uploadFile: async (file: File, projectId?: string) => {
    const form = new FormData();
    form.append('file', file);
    if (projectId) form.append('projectId', projectId);
    return request<Attachment & { warning?: string }>('/api/files', { method: 'POST', body: form });
  },
  deleteFile: (id: string) => request<void>(`/api/files/${id}`, { method: 'DELETE' }),

  listProjects: () => request<Project[]>('/api/projects'),
  createProject: (name: string, color?: string) => request<Project>('/api/projects', jsonBody('POST', { name, color })),
  getProject: (id: string) =>
    request<Project & { conversations: Conversation[]; files: Attachment[] }>(`/api/projects/${id}`),
  updateProject: (id: string, patch: Partial<Project>) => request<Project>(`/api/projects/${id}`, jsonBody('PATCH', patch)),
  deleteProject: (id: string) => request<void>(`/api/projects/${id}`, { method: 'DELETE' }),

  memories: () => request<{ memories: Memory[]; max: number }>('/api/memories'),
  addMemory: (content: string) => request<{ id: string }>('/api/memories', jsonBody('POST', { content })),
  deleteMemory: (id: string) => request<void>(`/api/memories/${id}`, { method: 'DELETE' }),
  clearMemories: () => request<void>('/api/memories', { method: 'DELETE' }),

  search: (q: string) => request<SearchResult[]>(`/api/search?q=${encodeURIComponent(q)}`),
  library: () => request<LibraryItem[]>('/api/library'),

  getCanvas: (id: string) => request<Canvas>(`/api/canvases/${id}`),
  saveCanvas: (id: string, content: string) => request<Canvas>(`/api/canvases/${id}`, jsonBody('PUT', { content })),
  restoreCanvas: (id: string, versionId: string) =>
    request<Canvas>(`/api/canvases/${id}/restore`, jsonBody('POST', { versionId })),

  transcribe: async (audio: Blob, durationSeconds: number) => {
    const form = new FormData();
    form.append('audio', audio, 'audio.webm');
    form.append('duration', String(Math.round(durationSeconds)));
    return request<{ text: string }>('/api/audio/transcribe', { method: 'POST', body: form });
  },
  speech: async (text: string, signal?: AbortSignal) => {
    const res = await fetch('/api/audio/speech', { ...jsonBody('POST', { text }), signal });
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? 'Speech failed');
    return res.blob();
  },
};

export interface ChatRequest {
  conversationId?: string;
  parentId?: string | null;
  message?: string;
  attachmentIds?: string[];
  regenerate?: boolean;
  model?: string;
  think?: boolean;
  tool?: ToolHint;
  projectId?: string | null;
  temporary?: boolean;
}

export async function streamChat(body: ChatRequest, onEvent: (event: StreamEvent) => void, signal: AbortSignal) {
  const res = await fetch('/api/chat', { ...jsonBody('POST', body), signal });
  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error ?? `Request failed (${res.status})`);
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let sep: number;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const chunk = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      if (chunk.startsWith('data: ')) onEvent(JSON.parse(chunk.slice(6)) as StreamEvent);
    }
  }
}
