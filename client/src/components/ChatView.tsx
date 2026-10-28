import { lazy, Suspense, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, Globe, ImagePlus, Loader2, PenLine, type LucideIcon } from 'lucide-react';
import type { ToolHint } from '../api';
import { useApp } from '../store/app';
import { pathTo, useChat } from '../store/chat';
import { Composer, type ComposerHandle, type ComposerSubmit } from './Composer';
import { MessageView } from './Message';

const CanvasPanel = lazy(() => import('./CanvasPanel'));

const suggestions: { icon: LucideIcon; label: string; prompt: string; tool: ToolHint }[] = [
  { icon: ImagePlus, label: 'Create an image or sticker', prompt: '', tool: 'image' },
  { icon: PenLine, label: 'Write or edit', prompt: 'Help me write ', tool: null },
  { icon: Globe, label: 'Search the web', prompt: '', tool: 'search' },
];

const BOTTOM_THRESHOLD = 40;

function MessageList() {
  const messages = useChat((s) => s.messages);
  const leafId = useChat((s) => s.leafId);
  const isStreaming = useChat((s) => s.isStreaming);
  const conversationId = useChat((s) => s.conversationId);
  const path = useMemo(() => pathTo(messages, leafId), [messages, leafId]);
  const containerRef = useRef<HTMLDivElement>(null);
  // Follow new content only while the user hasn't scrolled away from the bottom.
  const followRef = useRef(true);
  // Where our own last auto-scroll landed, to tell it apart from the user scrolling up.
  const autoScrollTopRef = useRef(0);
  const [atBottom, setAtBottom] = useState(true);

  const scrollToBottom = (behavior: ScrollBehavior = 'auto') => {
    const el = containerRef.current;
    if (!el) return;
    autoScrollTopRef.current = el.scrollHeight - el.clientHeight;
    el.scrollTo({ top: el.scrollHeight, behavior });
  };

  useLayoutEffect(() => {
    if (followRef.current) scrollToBottom();
  }, [path]);

  // Re-attach when opening a chat or sending a new message.
  useLayoutEffect(() => {
    followRef.current = true;
    setAtBottom(true);
    scrollToBottom();
  }, [conversationId]);

  useLayoutEffect(() => {
    if (!isStreaming) return;
    followRef.current = true;
    setAtBottom(true);
    scrollToBottom();
  }, [isStreaming]);

  const detach = () => {
    followRef.current = false;
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={containerRef}
        onWheel={(e) => e.deltaY < 0 && detach()}
        onTouchMove={detach}
        onKeyDown={(e) => ['ArrowUp', 'PageUp', 'Home'].includes(e.key) && detach()}
        onScroll={(e) => {
          const el = e.currentTarget;
          const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD;
          setAtBottom(bottom);
          if (bottom) followRef.current = true;
          else if (el.scrollTop < autoScrollTopRef.current - 4) detach();
        }}
        className="scrollbar-thin flex-1 overflow-y-auto"
      >
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 pt-4 pb-10">
          {path.map((m, i) => (
            <MessageView key={m.id} message={m} isLast={i === path.length - 1} />
          ))}
        </div>
      </div>
      {!atBottom && (
        <button
          type="button"
          aria-label="Scroll to bottom"
          onClick={() => {
            followRef.current = true;
            scrollToBottom('smooth');
          }}
          className="absolute bottom-4 left-1/2 flex size-9 -translate-x-1/2 items-center justify-center rounded-full border border-border-subtle bg-main text-text-primary shadow-lg hover:bg-surface-hover"
        >
          <ArrowDown size={18} />
        </button>
      )}
    </div>
  );
}

interface ChatViewProps {
  projectId?: string | null;
  emptyState?: React.ReactNode;
}

export function ChatView({ projectId, emptyState }: ChatViewProps) {
  const isStreaming = useChat((s) => s.isStreaming);
  const hasMessages = useChat((s) => Object.keys(s.messages).length > 0);
  const conversationId = useChat((s) => s.conversationId);
  const loading = useChat((s) => s.loading);
  const loadError = useChat((s) => s.loadError);
  const temporary = useChat((s) => s.temporary);
  const openCanvasId = useChat((s) => s.openCanvasId);
  const send = useChat((s) => s.send);
  const stop = useChat((s) => s.stop);
  const nickname = useApp((s) => s.settings?.nickname);
  const composerRef = useRef<ComposerHandle>(null);
  const [dragging, setDragging] = useState(false);

  const onSubmit = (input: ComposerSubmit) => send({ ...input, projectId });

  const composer = <Composer ref={composerRef} isStreaming={isStreaming} onSubmit={onSubmit} onStop={stop} />;

  const dropHandlers = {
    onDragOver: (e: React.DragEvent) => {
      if (e.dataTransfer.types.includes('Files')) {
        e.preventDefault();
        setDragging(true);
      }
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      composerRef.current?.addFiles([...e.dataTransfer.files]);
    },
  };

  if (loadError) {
    return <div className="flex flex-1 items-center justify-center text-text-secondary">{loadError}</div>;
  }
  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-text-tertiary">
        <Loader2 className="animate-spin" />
      </div>
    );
  }

  const isEmpty = !hasMessages && !conversationId;

  const chatColumn = isEmpty ? (
    <div className="flex flex-1 flex-col items-center justify-center px-4 pb-[12vh]">
      {emptyState ??
        (temporary ? (
          <div className="mb-7 text-center">
            <h1 className="text-[28px] font-normal tracking-tight">Temporary Chat</h1>
            <p className="mx-auto mt-2 max-w-md text-sm text-text-secondary">
              This chat won't appear in your chat history, and won't use or update ChatGPT's memory.
            </p>
          </div>
        ) : (
          <h1 className="mb-7 text-center text-[28px] font-normal tracking-tight">
            {nickname ? `What’s on your mind today, ${nickname}?` : 'What’s on your mind today?'}
          </h1>
        ))}
      <div className="w-full max-w-3xl">
        {composer}
        {!projectId && (
          <ul className="mt-5 space-y-1 px-2">
            {suggestions.map(({ icon: Icon, label, prompt, tool }) => (
              <li key={label}>
                <button
                  type="button"
                  onClick={() => {
                    composerRef.current?.setText(prompt);
                    composerRef.current?.setTool(tool);
                  }}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 text-[15px] text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                >
                  <Icon size={17} strokeWidth={1.5} />
                  {label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  ) : (
    <div className="flex min-h-0 flex-1 flex-col">
      <MessageList />
      <div className="mx-auto w-full max-w-3xl px-4">
        {composer}
        <p className="py-2.5 text-center text-xs text-text-tertiary">ChatGPT can make mistakes. Check important info.</p>
      </div>
    </div>
  );

  return (
    <div className="relative flex min-h-0 flex-1" {...dropHandlers}>
      <div className={`flex min-h-0 min-w-0 flex-col ${openCanvasId ? 'hidden w-[40%] max-w-[480px] lg:flex' : 'flex-1'}`}>
        {chatColumn}
      </div>
      {openCanvasId && (
        <Suspense fallback={<div className="flex-1" />}>
          <CanvasPanel canvasId={openCanvasId} />
        </Suspense>
      )}
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center bg-main/80">
          <div className="rounded-2xl border-2 border-dashed border-text-tertiary px-10 py-8 text-center">
            <p className="text-lg font-medium">Add anything</p>
            <p className="text-sm text-text-secondary">Drop any file here to add it to the conversation</p>
          </div>
        </div>
      )}
    </div>
  );
}
