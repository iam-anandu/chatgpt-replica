import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Folder, Link2, MessageCircle, Search, SquarePen } from 'lucide-react';
import { api, type SearchResult } from '../api';
import { useApp } from '../store/app';
import { useChat } from '../store/chat';
import { Button, Modal } from './ui';

function groupLabel(ts: number) {
  const days = Math.floor((Date.now() - ts) / 86_400_000);
  if (days < 1) return 'Today';
  if (days < 2) return 'Yesterday';
  if (days < 7) return 'Previous 7 days';
  if (days < 30) return 'Previous 30 days';
  return 'Older';
}

export function SearchModal() {
  const setApp = useApp((s) => s.set);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState(0);
  const navigate = useNavigate();
  const close = () => setApp({ searchOpen: false });

  useEffect(() => {
    const t = setTimeout(() => api.search(q).then((r) => (setResults(r), setSelected(0))), 150);
    return () => clearTimeout(t);
  }, [q]);

  const go = (path: string) => {
    close();
    navigate(path);
  };

  const items = [{ id: '__new', title: 'New chat', updated_at: Date.now(), snippet: null, project_id: null }, ...results];
  let lastGroup = '';

  return (
    <Modal onClose={close} width="max-w-2xl">
      <div className="flex items-center gap-3 border-b border-border-subtle px-5 py-4">
        <Search size={18} className="text-text-tertiary" />
        <input
          autoFocus
          value={q}
          placeholder="Search chats..."
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setSelected((s) => Math.min(items.length - 1, s + 1));
            if (e.key === 'ArrowUp') setSelected((s) => Math.max(0, s - 1));
            if (e.key === 'Enter') {
              const item = items[selected];
              if (item) go(item.id === '__new' ? '/' : `/c/${item.id}`);
            }
          }}
          className="flex-1 bg-transparent outline-none placeholder:text-text-tertiary"
        />
      </div>
      <div className="scrollbar-thin min-h-[320px] overflow-y-auto p-2">
        {items.map((item, i) => {
          const group = item.id === '__new' ? '' : groupLabel(item.updated_at);
          const header = group !== lastGroup ? group : '';
          lastGroup = group;
          return (
            <div key={item.id}>
              {header && <p className="px-3 pt-3 pb-1 text-xs text-text-tertiary">{header}</p>}
              <button
                type="button"
                onMouseEnter={() => setSelected(i)}
                onClick={() => go(item.id === '__new' ? '/' : `/c/${item.id}`)}
                className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left ${i === selected ? 'bg-surface-hover' : ''}`}
              >
                {item.id === '__new' ? (
                  <SquarePen size={18} className="mt-0.5 shrink-0" />
                ) : (
                  <MessageCircle size={18} className="mt-0.5 shrink-0 text-text-secondary" />
                )}
                <span className="min-w-0">
                  <span className="block truncate text-sm">{item.title}</span>
                  {item.snippet && <span className="block truncate text-xs text-text-tertiary">{item.snippet}</span>}
                </span>
              </button>
            </div>
          );
        })}
        {q && results.length === 0 && <p className="px-3 py-6 text-center text-sm text-text-tertiary">No chats found</p>}
      </div>
    </Modal>
  );
}

export function ShareDialog({ conversationId }: { conversationId: string }) {
  const setApp = useApp((s) => s.set);
  const conversation = useApp((s) => s.conversations.find((c) => c.id === conversationId));
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const close = () => setApp({ shareConversationId: null });

  const create = async () => {
    setBusy(true);
    try {
      const leafId = useChat.getState().conversationId === conversationId ? useChat.getState().leafId : null;
      const share = await api.share(conversationId, leafId?.startsWith('tmp-') ? null : leafId);
      const full = `${location.origin}${share.url}`;
      setUrl(full);
      await navigator.clipboard.writeText(full).catch(() => {});
      useApp.getState().toast('Link copied to clipboard');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Share “${conversation?.title ?? 'chat'}”`} onClose={close}>
      <div className="space-y-4 p-5">
        <p className="text-sm text-text-secondary">
          Creates a read-only snapshot of this chat as it is now. Messages you add later won't be included. Anyone who can
          reach this server (your network, or the internet once deployed) can open the link.
        </p>
        <div className="flex items-center gap-2 rounded-full border border-border-subtle p-1.5 pl-4">
          <span className="min-w-0 flex-1 truncate text-sm text-text-secondary">{url ?? `${location.origin}/share/...`}</span>
          <Button variant="primary" onClick={url ? () => navigator.clipboard.writeText(url) : create} disabled={busy}>
            <span className="flex items-center gap-1.5">
              <Link2 size={15} /> {url ? 'Copy link' : 'Create link'}
            </span>
          </Button>
        </div>
      </div>
    </Modal>
  );
}

const projectColors = ['#e5e5e5', '#f87171', '#fb923c', '#facc15', '#4ade80', '#60a5fa', '#a78bfa', '#f472b6'];

export function NewProjectDialog() {
  const setApp = useApp((s) => s.set);
  const [name, setName] = useState('');
  const [color, setColor] = useState(projectColors[0]);
  const navigate = useNavigate();
  const close = () => setApp({ newProjectOpen: false });

  const create = async () => {
    const project = await api.createProject(name, color);
    await useApp.getState().refreshProjects();
    close();
    navigate(`/project/${project.id}`);
  };

  return (
    <Modal title="Create project" onClose={close} width="max-w-md">
      <form
        className="space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) create();
        }}
      >
        <div className="flex items-center gap-3 rounded-xl border border-border-subtle px-3 py-2.5">
          <Folder size={18} style={{ color }} />
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Copenhagen Trip"
            className="flex-1 bg-transparent outline-none"
          />
        </div>
        <div className="flex gap-2">
          {projectColors.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Color ${c}`}
              onClick={() => setColor(c)}
              className={`size-6 rounded-full ${color === c ? 'ring-2 ring-text-primary ring-offset-2 ring-offset-main' : ''}`}
              style={{ background: c }}
            />
          ))}
        </div>
        <p className="text-sm text-text-secondary">
          Projects keep chats, files, and custom instructions in one place. Use them for ongoing work, or just to keep things
          tidy.
        </p>
        <div className="flex justify-end">
          <Button variant="primary" type="submit" disabled={!name.trim()}>
            Create project
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export const shortcuts: [string, string][] = [
  ['Open new chat', 'Ctrl + Shift + O'],
  ['Search chats', 'Ctrl + K'],
  ['Toggle sidebar', 'Ctrl + Shift + S'],
  ['Copy last response', 'Ctrl + Shift + C'],
  ['Focus chat input', 'Shift + Esc'],
  ['Delete chat', 'Ctrl + Shift + Backspace'],
  ['Show shortcuts', 'Ctrl + /'],
];

export function ShortcutsDialog() {
  const setApp = useApp((s) => s.set);
  return (
    <Modal title="Keyboard shortcuts" onClose={() => setApp({ shortcutsOpen: false })} width="max-w-md">
      <ul className="divide-y divide-border-subtle px-5 py-2">
        {shortcuts.map(([label, keys]) => (
          <li key={label} className="flex items-center justify-between py-3 text-sm">
            <span>{label}</span>
            <span className="flex gap-1">
              {keys.split(' + ').map((k) => (
                <kbd key={k} className="rounded-md border border-border-subtle px-2 py-0.5 text-xs text-text-secondary">
                  {k}
                </kbd>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
