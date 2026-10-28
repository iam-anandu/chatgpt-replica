import { useRef } from 'react';
import { Globe, ImagePlus, PenLine, type LucideIcon } from 'lucide-react';
import { useChat } from '../hooks/useChat';
import { Composer, type ComposerHandle } from './Composer';
import { MessageList } from './MessageList';

interface ChatViewProps {
  conversationId?: string;
  onConversationsChanged: () => void;
}

const suggestions: { icon: LucideIcon; label: string; prompt: string }[] = [
  { icon: ImagePlus, label: 'Create an image or sticker', prompt: 'Create an image of ' },
  { icon: PenLine, label: 'Write or edit', prompt: 'Help me write ' },
  { icon: Globe, label: 'Search the web', prompt: 'Search the web for ' },
];

export function ChatView({ conversationId, onConversationsChanged }: ChatViewProps) {
  const { messages, isStreaming, loadError, send, stop } = useChat(conversationId, onConversationsChanged);
  const composerRef = useRef<ComposerHandle>(null);

  const composer = <Composer ref={composerRef} isStreaming={isStreaming} onSend={send} onStop={stop} />;

  if (loadError) {
    return <div className="flex flex-1 items-center justify-center text-text-secondary">{loadError}</div>;
  }

  if (messages.length === 0 && !conversationId) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-4 pb-[12vh]">
        <h1 className="mb-7 text-center text-[28px] font-normal tracking-tight">What’s on your mind today?</h1>
        <div className="w-full max-w-3xl">
          {composer}
          <ul className="mt-5 space-y-1 px-2">
            {suggestions.map(({ icon: Icon, label, prompt }) => (
              <li key={label}>
                <button
                  type="button"
                  onClick={() => composerRef.current?.setText(prompt)}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 text-[15px] text-text-secondary hover:bg-surface-hover hover:text-text-primary"
                >
                  <Icon size={17} strokeWidth={1.5} />
                  {label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <MessageList messages={messages} isStreaming={isStreaming} />
      <div className="mx-auto w-full max-w-3xl px-4">
        {composer}
        <p className="py-2.5 text-center text-xs text-text-tertiary">
          ChatGPT can make mistakes. Check important info.
        </p>
      </div>
    </div>
  );
}
