export interface Conversation {
  id: string;
  title: string;
  project_id: string | null;
  pinned: number;
  archived: number;
  created_at: number;
  updated_at: number;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  error?: string;
}

export type StreamEvent =
  | { type: 'meta'; conversationId: string; userMessageId: string; title: string }
  | { type: 'delta'; text: string }
  | { type: 'done'; messageId: string }
  | { type: 'error'; message: string };

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? res.statusText);
  return res.json() as Promise<T>;
}

export const api = {
  listConversations: () => fetch('/api/conversations').then((r) => json<Conversation[]>(r)),
  getConversation: (id: string) =>
    fetch(`/api/conversations/${id}`).then((r) => json<Conversation & { messages: Message[] }>(r)),
  deleteConversation: (id: string) => fetch(`/api/conversations/${id}`, { method: 'DELETE' }),
};

export async function streamChat(
  body: { conversationId?: string; message: string; think: boolean },
  onEvent: (event: StreamEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
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
