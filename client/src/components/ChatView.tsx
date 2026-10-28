import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Globe, ImagePlus, Loader2, PenLine, type LucideIcon } from 'lucide-react';
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

function MessageList() {
  const messages = useChat((s) => s.messages);
  const leafId = useChat((s) => s.leafId);
  const isStreaming = useChat((s) => s.isStreaming);
  const path = useMemo(() => pathTo(messages, leafId), [messages, leafId]);
  const containerRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  useEffect(() => {
    const el = containerRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [path, isStreaming]);

  useEffect(() => {
    stickToBottom.current = true;
  }, [leafId]);

  return (
    <div
      ref={containerRef}
      onScroll={(e) => {
        const el = e.currentTarget;
        stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
      }}
      className="scrollbar-thin flex-1 overflow-y-auto"
    >
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 pt-4 pb-10">
        {path.map((m, i) => (
          <MessageView key={m.id} message={m} isLast={i === path.length - 1} />
        ))}
      </div>
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
