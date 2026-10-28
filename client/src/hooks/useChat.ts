import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, streamChat, type Message } from '../api';

export function useChat(conversationId: string | undefined, onConversationsChanged: () => void) {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Conversation created by the in-flight request; its URL change must not reload messages.
  const streamingIdRef = useRef<string | null>(null);

  useEffect(() => {
    setLoadError(null);
    if (!conversationId) {
      abortRef.current?.abort();
      setMessages([]);
      return;
    }
    if (conversationId === streamingIdRef.current) return;
    abortRef.current?.abort();
    let cancelled = false;
    api
      .getConversation(conversationId)
      .then((c) => !cancelled && setMessages(c.messages))
      .catch((e: Error) => !cancelled && setLoadError(e.message));
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  const updateLast = (fn: (m: Message) => Message) =>
    setMessages((prev) => [...prev.slice(0, -1), fn(prev[prev.length - 1])]);

  const send = useCallback(
    async (text: string, think: boolean) => {
      const controller = new AbortController();
      abortRef.current = controller;
      streamingIdRef.current = conversationId ?? null;
      setIsStreaming(true);
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'user', content: text },
        { id: crypto.randomUUID(), role: 'assistant', content: '' },
      ]);

      try {
        await streamChat(
          { conversationId, message: text, think },
          (event) => {
            switch (event.type) {
              case 'meta':
                if (!conversationId) {
                  streamingIdRef.current = event.conversationId;
                  navigate(`/c/${event.conversationId}`, { replace: true });
                }
                onConversationsChanged();
                break;
              case 'delta':
                updateLast((m) => ({ ...m, content: m.content + event.text }));
                break;
              case 'done':
                updateLast((m) => ({ ...m, id: event.messageId }));
                break;
              case 'error':
                updateLast((m) => ({ ...m, error: event.message }));
                break;
            }
          },
          controller.signal,
        );
      } catch (e) {
        if (!controller.signal.aborted) {
          updateLast((m) => ({ ...m, error: (e as Error).message }));
        }
      } finally {
        if (abortRef.current === controller) {
          setIsStreaming(false);
          abortRef.current = null;
          streamingIdRef.current = null;
        }
      }
    },
    [conversationId, navigate, onConversationsChanged],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  return { messages, isStreaming, loadError, send, stop };
}
