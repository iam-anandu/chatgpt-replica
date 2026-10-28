import { create } from 'zustand';
import { api, streamChat, type Attachment, type Canvas, type ChatRequest, type Message, type ToolHint } from '../api';
import { useApp } from './app';

export interface ChatMessage extends Message {
  localError?: string;
}

export interface SendInput {
  text: string;
  attachments: Attachment[];
  tool: ToolHint;
  think: boolean;
  projectId?: string | null;
}

interface ChatState {
  conversationId: string | null;
  messages: Record<string, ChatMessage>;
  leafId: string | null;
  canvases: Record<string, Canvas>;
  openCanvasId: string | null;
  isStreaming: boolean;
  status: string | null;
  temporary: boolean;
  loading: boolean;
  loadError: string | null;

  load: (id: string) => Promise<void>;
  reset: () => void;
  send: (input: SendInput) => Promise<string>;
  edit: (messageId: string, text: string) => Promise<string>;
  regenerate: (assistantOrUserId: string) => Promise<string>;
  stop: () => void;
  switchBranch: (messageId: string) => void;
  setFeedback: (messageId: string, feedback: number) => void;
  setTemporary: (on: boolean) => void;
  openCanvas: (id: string | null) => void;
  upsertCanvas: (canvas: Canvas) => void;
}

const TMP_USER = 'tmp-user';
const TMP_ASSISTANT = 'tmp-assistant';

let controller: AbortController | null = null;
let navigateTo: (path: string, replace?: boolean) => void = () => {};
export const setChatNavigator = (fn: typeof navigateTo) => {
  navigateTo = fn;
};

export function childrenOf(messages: Record<string, ChatMessage>, parentId: string | null) {
  return Object.values(messages)
    .filter((m) => m.parent_id === parentId)
    .sort((a, b) => a.created_at - b.created_at);
}

/** Follows the most recent child at each level down to a leaf. */
function latestLeaf(messages: Record<string, ChatMessage>, fromId: string): string {
  let id = fromId;
  for (;;) {
    const kids = childrenOf(messages, id);
    if (kids.length === 0) return id;
    id = kids[kids.length - 1].id;
  }
}

export function pathTo(messages: Record<string, ChatMessage>, leafId: string | null): ChatMessage[] {
  const path: ChatMessage[] = [];
  for (let m = leafId ? messages[leafId] : undefined; m; m = m.parent_id ? messages[m.parent_id] : undefined) {
    path.push(m);
  }
  return path.reverse();
}

export const useChat = create<ChatState>((set, get) => {
  const patchMessage = (id: string, fn: (m: ChatMessage) => ChatMessage) =>
    set((s) => (s.messages[id] ? { messages: { ...s.messages, [id]: fn(s.messages[id]) } } : s));

  const discardTemporary = () => {
    const { conversationId, temporary } = get();
    if (conversationId && temporary) api.deleteConversation(conversationId).catch(() => {});
  };

  /** Runs one chat request, rendering it optimistically under `parentId`. Resolves with the reply text. */
  async function run(req: ChatRequest, optimisticUser: ChatMessage | null, answerTo: string | null): Promise<string> {
    controller?.abort();
    const ctrl = new AbortController();
    controller = ctrl;
    const app = useApp.getState();
    const isNew = !get().conversationId;

    const assistant: ChatMessage = {
      id: TMP_ASSISTANT,
      parent_id: optimisticUser ? TMP_USER : answerTo,
      role: 'assistant',
      content: '',
      attachments: [],
      meta: {},
      model: req.model ?? null,
      feedback: 0,
      created_at: Date.now() + 1,
    };
    set((s) => {
      const messages = { ...s.messages };
      delete messages[TMP_USER];
      delete messages[TMP_ASSISTANT];
      if (optimisticUser) messages[TMP_USER] = optimisticUser;
      messages[TMP_ASSISTANT] = assistant;
      return { messages, leafId: TMP_ASSISTANT, isStreaming: true, status: null };
    });

    let text = '';
    let finished = false;
    try {
      await streamChat(
        { ...req, conversationId: get().conversationId ?? undefined, temporary: get().temporary },
        (event) => {
          if (controller !== ctrl) return;
          switch (event.type) {
            case 'meta': {
              set((s) => {
                const messages = { ...s.messages };
                delete messages[TMP_USER];
                messages[event.userMessage.id] = event.userMessage;
                messages[TMP_ASSISTANT] = { ...messages[TMP_ASSISTANT], parent_id: event.userMessage.id };
                return { messages, conversationId: event.conversationId };
              });
              if (isNew) {
                navigateTo(`/c/${event.conversationId}`, true);
                if (!get().temporary) app.refreshConversations();
              }
              break;
            }
            case 'delta':
              text += event.text;
              set({ status: null });
              patchMessage(TMP_ASSISTANT, (m) => ({ ...m, content: m.content + event.text }));
              break;
            case 'status':
              set({ status: event.text });
              break;
            case 'search':
              set({ status: event.status });
              break;
            case 'image':
              set({ status: null });
              patchMessage(TMP_ASSISTANT, (m) => ({
                ...m,
                meta: { ...m.meta, images: [...(m.meta.images ?? []), event.image] },
              }));
              break;
            case 'canvas':
              get().upsertCanvas(event.canvas);
              set({ openCanvasId: event.canvas.id });
              patchMessage(TMP_ASSISTANT, (m) => ({
                ...m,
                meta: { ...m.meta, canvas: { id: event.canvas.id, title: event.canvas.title, action: event.action } },
              }));
              break;
            case 'done':
              finished = true;
              set((s) => {
                const messages = { ...s.messages };
                delete messages[TMP_ASSISTANT];
                messages[event.message.id] = event.message;
                return { messages, leafId: event.message.id, isStreaming: false, status: null };
              });
              break;
            case 'title':
              app.refreshConversations();
              break;
            case 'memory':
              patchMessage(event.messageId, (m) => ({ ...m, meta: { ...m.meta, memoryUpdated: event.memories } }));
              break;
            case 'error':
              finished = true;
              patchMessage(TMP_ASSISTANT, (m) => ({ ...m, localError: event.message }));
              set({ isStreaming: false, status: null });
              break;
          }
        },
        ctrl.signal,
      );
    } catch (err) {
      if (!ctrl.signal.aborted) {
        patchMessage(TMP_ASSISTANT, (m) => ({ ...m, localError: (err as Error).message }));
      }
    } finally {
      if (controller === ctrl) {
        controller = null;
        set({ isStreaming: false, status: null });
        if (!finished && ctrl.signal.aborted && get().conversationId) {
          // The server saved the partial reply; sync ids with it.
          const id = get().conversationId!;
          setTimeout(() => get().conversationId === id && reload(id), 400);
        }
      }
    }
    return text;
  }

  async function reload(id: string) {
    const data = await api.getConversation(id);
    const messages = Object.fromEntries(data.messages.map((m) => [m.id, m]));
    const fallbackLeaf = data.messages.length ? latestLeaf(messages, childrenOf(messages, null).at(-1)!.id) : null;
    const leafId = data.current_node_id && messages[data.current_node_id] ? data.current_node_id : fallbackLeaf;
    set({
      messages,
      leafId,
      canvases: Object.fromEntries(data.canvases.map((c) => [c.id, c])),
      temporary: !!data.temporary,
    });
  }

  return {
    conversationId: null,
    messages: {},
    leafId: null,
    canvases: {},
    openCanvasId: null,
    isStreaming: false,
    status: null,
    temporary: false,
    loading: false,
    loadError: null,

    load: async (id) => {
      if (get().conversationId === id) return;
      controller?.abort();
      controller = null;
      discardTemporary();
      set({ conversationId: id, messages: {}, leafId: null, canvases: {}, openCanvasId: null, loading: true, loadError: null, isStreaming: false });
      try {
        await reload(id);
      } catch (err) {
        if (get().conversationId === id) set({ loadError: (err as Error).message });
      } finally {
        if (get().conversationId === id) set({ loading: false });
      }
    },

    reset: () => {
      controller?.abort();
      controller = null;
      discardTemporary();
      set({ conversationId: null, messages: {}, leafId: null, canvases: {}, openCanvasId: null, isStreaming: false, status: null, temporary: false, loadError: null });
    },

    send: ({ text, attachments, tool, think, projectId }) => {
      const parentId = get().leafId && get().leafId !== TMP_ASSISTANT ? get().leafId : null;
      const user: ChatMessage = {
        id: TMP_USER,
        parent_id: parentId,
        role: 'user',
        content: text,
        attachments,
        meta: {},
        model: null,
        feedback: 0,
        created_at: Date.now(),
      };
      return run(
        {
          parentId,
          message: text,
          attachmentIds: attachments.map((a) => a.id),
          model: useApp.getState().model,
          think,
          tool,
          projectId,
        },
        user,
        null,
      );
    },

    edit: (messageId, text) => {
      const original = get().messages[messageId];
      const user: ChatMessage = { ...original, id: TMP_USER, content: text, created_at: Date.now() };
      return run(
        {
          parentId: original.parent_id,
          message: text,
          attachmentIds: original.attachments.map((a) => a.id),
          model: useApp.getState().model,
        },
        user,
        null,
      );
    },

    regenerate: (id) => {
      const m = get().messages[id];
      const userId = m.role === 'user' ? m.id : m.parent_id;
      if (!userId) return Promise.resolve('');
      if (userId === TMP_USER) {
        // The request failed before the server saved the user message: send it again.
        const u = get().messages[TMP_USER];
        return run(
          { parentId: u.parent_id, message: u.content, attachmentIds: u.attachments.map((a) => a.id), model: useApp.getState().model },
          u,
          null,
        );
      }
      return run({ parentId: userId, regenerate: true, model: useApp.getState().model }, null, userId);
    },

    stop: () => controller?.abort(),

    switchBranch: (messageId) => {
      const leafId = latestLeaf(get().messages, messageId);
      set({ leafId });
      const id = get().conversationId;
      if (id) api.updateConversation(id, { current_node_id: leafId }).catch(() => {});
    },

    setFeedback: (messageId, feedback) => {
      patchMessage(messageId, (m) => ({ ...m, feedback }));
      api.setFeedback(messageId, feedback).catch(() => {});
    },

    setTemporary: (on) => set({ temporary: on }),
    openCanvas: (id) => set({ openCanvasId: id }),
    upsertCanvas: (canvas) => set((s) => ({ canvases: { ...s.canvases, [canvas.id]: canvas } })),
  };
});
