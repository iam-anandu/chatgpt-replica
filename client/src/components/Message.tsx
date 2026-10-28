import { useState } from 'react';
import {
  Brain,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileText,
  Globe,
  PanelRight,
  Pencil,
  RefreshCw,
  Share,
  Square,
  ThumbsDown,
  ThumbsUp,
  Volume2,
} from 'lucide-react';
import type { Attachment } from '../api';
import { useApp } from '../store/app';
import { childrenOf, useChat, type ChatMessage } from '../store/chat';
import { speak, stopSpeaking, useSpeakingId } from '../hooks/audio';
import { Markdown } from './Markdown';
import { Button, IconButton, copyText } from './ui';

function BranchNav({ message }: { message: ChatMessage }) {
  const messages = useChat((s) => s.messages);
  const switchBranch = useChat((s) => s.switchBranch);
  const isStreaming = useChat((s) => s.isStreaming);
  const siblings = childrenOf(messages, message.parent_id).filter((m) => m.role === message.role);
  if (siblings.length < 2) return null;
  const index = siblings.findIndex((m) => m.id === message.id);
  return (
    <div className="flex items-center text-sm text-text-secondary">
      <IconButton
        icon={ChevronLeft}
        label="Previous response"
        size={16}
        className="p-1"
        disabled={index <= 0 || isStreaming}
        onClick={() => switchBranch(siblings[index - 1].id)}
      />
      <span className="tabular-nums">
        {index + 1}/{siblings.length}
      </span>
      <IconButton
        icon={ChevronRight}
        label="Next response"
        size={16}
        className="p-1"
        disabled={index >= siblings.length - 1 || isStreaming}
        onClick={() => switchBranch(siblings[index + 1].id)}
      />
    </div>
  );
}

export function AttachmentPreview({ attachment, onRemove }: { attachment: Attachment; onRemove?: () => void }) {
  const isImage = attachment.mime.startsWith('image/');
  return (
    <div className="group relative">
      {isImage ? (
        <a href={attachment.url} target="_blank" rel="noreferrer">
          <img src={attachment.url} alt={attachment.name} className="size-16 rounded-xl border border-border-subtle object-cover" />
        </a>
      ) : (
        <a
          href={`${attachment.url}?download=1`}
          className="flex h-16 w-56 items-center gap-3 rounded-xl border border-border-subtle bg-main px-3"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#ff5588] text-white">
            <FileText size={18} />
          </span>
          <span className="min-w-0 text-left">
            <span className="block truncate text-sm font-medium">{attachment.name}</span>
            <span className="block text-xs text-text-tertiary uppercase">{attachment.name.split('.').pop()}</span>
          </span>
        </a>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove file"
          className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-inverse text-xs text-on-inverse"
        >
          ×
        </button>
      )}
    </div>
  );
}

function UserMessage({ message }: { message: ChatMessage }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const edit = useChat((s) => s.edit);
  const isStreaming = useChat((s) => s.isStreaming);

  if (editing) {
    return (
      <div className="ml-auto w-full max-w-[85%] rounded-3xl bg-user-bubble p-3">
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={Math.min(10, draft.split('\n').length + 1)}
          className="w-full resize-none bg-transparent px-2 py-1 outline-none"
        />
        <div className="flex justify-end gap-2">
          <Button onClick={() => setEditing(false)}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!draft.trim() || isStreaming}
            onClick={() => {
              setEditing(false);
              edit(message.id, draft.trim());
            }}
          >
            Send
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex flex-col items-end gap-1">
      {message.attachments.length > 0 && (
        <div className="flex flex-wrap justify-end gap-2">
          {message.attachments.map((a) => (
            <AttachmentPreview key={a.id} attachment={a} />
          ))}
        </div>
      )}
      {message.content && (
        <div className="max-w-[70%] rounded-3xl bg-user-bubble px-5 py-2.5 whitespace-pre-wrap [overflow-wrap:anywhere]">
          {message.content}
        </div>
      )}
      <div className="flex items-center opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <IconButton icon={Copy} label="Copy" size={16} className="p-1.5" onClick={() => copyText(message.content)} />
        <IconButton
          icon={Pencil}
          label="Edit message"
          size={16}
          className="p-1.5"
          disabled={isStreaming}
          onClick={() => {
            setDraft(message.content);
            setEditing(true);
          }}
        />
        <BranchNav message={message} />
      </div>
    </div>
  );
}

function Sources({ sources }: { sources: { url: string; title: string }[] }) {
  const [open, setOpen] = useState(false);
  const host = (url: string) => {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  };
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border border-border-subtle px-3 py-1.5 text-sm text-text-secondary hover:bg-surface-hover"
      >
        <span className="flex -space-x-1.5">
          {sources.slice(0, 3).map((s) => (
            <img
              key={s.url}
              src={`https://www.google.com/s2/favicons?domain=${host(s.url)}&sz=32`}
              alt=""
              className="size-4 rounded-full bg-white ring-2 ring-main"
            />
          ))}
        </span>
        Sources
      </button>
      {open && (
        <ul className="mt-2 space-y-1 rounded-2xl border border-border-subtle p-2">
          {sources.map((s) => (
            <li key={s.url}>
              <a href={s.url} target="_blank" rel="noreferrer" className="block rounded-lg px-2 py-1.5 hover:bg-surface-hover">
                <span className="block text-xs text-text-tertiary">{host(s.url)}</span>
                <span className="block truncate text-sm">{s.title || s.url}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AssistantMessage({ message, isLast }: { message: ChatMessage; isLast: boolean }) {
  const isStreaming = useChat((s) => s.isStreaming && isLast);
  const status = useChat((s) => (isLast ? s.status : null));
  const regenerate = useChat((s) => s.regenerate);
  const setFeedback = useChat((s) => s.setFeedback);
  const openCanvas = useChat((s) => s.openCanvas);
  const conversationId = useChat((s) => s.conversationId);
  const speakingId = useSpeakingId();
  const [copied, setCopied] = useState(false);
  const isTemp = message.id.startsWith('tmp-');
  const error = message.localError ?? message.meta.error;

  return (
    <div className="group flex flex-col gap-3">
      {status && (
        <div className="flex items-center gap-2 text-sm">
          {status.toLowerCase().includes('search') && <Globe size={15} className="text-text-secondary" />}
          <span className="shimmer">{status}…</span>
        </div>
      )}
      {!message.content && !status && isStreaming && !message.meta.images?.length && <span className="streaming-dot" />}

      {message.meta.images?.map((img) => (
        <div key={img.id} className="group/img relative w-fit">
          <img src={img.url} alt={img.prompt} className="max-h-[512px] max-w-full rounded-2xl" />
          <a
            href={`${img.url}?download=1`}
            className="absolute top-3 right-3 rounded-full bg-black/60 p-2 text-white opacity-0 group-hover/img:opacity-100"
            title="Download"
          >
            <Download size={16} />
          </a>
        </div>
      ))}

      {message.meta.canvas && (
        <button
          type="button"
          onClick={() => openCanvas(message.meta.canvas!.id)}
          className="flex w-fit items-center gap-3 rounded-2xl border border-border-subtle px-4 py-3 text-left hover:bg-surface-hover"
        >
          <PanelRight size={18} className="text-text-secondary" />
          <span>
            <span className="block text-sm font-medium">{message.meta.canvas.title}</span>
            <span className="block text-xs text-text-tertiary">
              Canvas {message.meta.canvas.action} · Click to open
            </span>
          </span>
        </button>
      )}

      {message.content && <Markdown>{message.content}</Markdown>}

      {message.meta.sources && message.meta.sources.length > 0 && <Sources sources={message.meta.sources} />}

      {message.meta.memoryUpdated && (
        <button
          type="button"
          onClick={() => useApp.getState().set({ settingsTab: 'personalization' })}
          title={message.meta.memoryUpdated.join('\n')}
          className="flex w-fit items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
        >
          <Brain size={15} /> Memory updated
        </button>
      )}

      {message.meta.stopped && <p className="text-sm text-text-tertiary">You stopped this response.</p>}

      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          <span>{error}</span>
          {!isStreaming && (
            <Button onClick={() => regenerate(message.id)}>
              <span className="flex items-center gap-1.5 text-text-primary">
                <RefreshCw size={14} /> Retry
              </span>
            </Button>
          )}
        </div>
      )}

      {!isStreaming && !isTemp && (
        <div className={`flex items-center ${isLast ? '' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
          <IconButton
            icon={copied ? Check : Copy}
            label="Copy"
            size={16}
            className="p-1.5"
            onClick={() => {
              navigator.clipboard.writeText(message.content);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          />
          <IconButton
            icon={ThumbsUp}
            label="Good response"
            size={16}
            className={`p-1.5 ${message.feedback === 1 ? 'text-text-primary [&_svg]:fill-current' : ''}`}
            onClick={() => setFeedback(message.id, message.feedback === 1 ? 0 : 1)}
          />
          <IconButton
            icon={ThumbsDown}
            label="Bad response"
            size={16}
            className={`p-1.5 ${message.feedback === -1 ? 'text-text-primary [&_svg]:fill-current' : ''}`}
            onClick={() => setFeedback(message.id, message.feedback === -1 ? 0 : -1)}
          />
          <IconButton
            icon={speakingId === message.id ? Square : Volume2}
            label={speakingId === message.id ? 'Stop' : 'Read aloud'}
            size={16}
            className="p-1.5"
            onClick={() => (speakingId === message.id ? stopSpeaking() : speak(message.content, message.id))}
          />
          <IconButton icon={RefreshCw} label="Regenerate" size={16} className="p-1.5" onClick={() => regenerate(message.id)} />
          {conversationId && (
            <IconButton
              icon={Share}
              label="Share"
              size={16}
              className="p-1.5"
              onClick={() => useApp.getState().set({ shareConversationId: conversationId })}
            />
          )}
          <BranchNav message={message} />
          {message.model && <span className="ml-2 text-xs text-text-tertiary">{message.model}</span>}
        </div>
      )}
    </div>
  );
}

export function MessageView({ message, isLast }: { message: ChatMessage; isLast: boolean }) {
  return message.role === 'user' ? <UserMessage message={message} /> : <AssistantMessage message={message} isLast={isLast} />;
}
