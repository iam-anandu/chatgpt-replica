import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Download, ExternalLink, X, type LucideIcon } from 'lucide-react';
import { api, type LibraryItem, type Message, type SharedConversation } from '../api';
import { pathTo, type ChatMessage } from '../store/chat';
import { Markdown } from '../components/Markdown';
import { TopBar } from '../components/TopBar';
import { AttachmentPreview } from '../components/Message';

export function LibraryPage() {
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [open, setOpen] = useState<LibraryItem | null>(null);
  useEffect(() => void api.library().then(setItems), []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TopBar showModelPicker={false} />
      <div className="scrollbar-thin flex-1 overflow-y-auto px-6 pb-10">
        <h1 className="mx-auto mb-6 max-w-5xl text-2xl">Library</h1>
        <div className="mx-auto grid max-w-5xl grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {items?.map((item) => (
            <button key={item.id} type="button" onClick={() => setOpen(item)} className="aspect-square overflow-hidden rounded-xl bg-surface">
              <img src={item.url} alt={item.name} loading="lazy" className="size-full object-cover transition-transform hover:scale-105" />
            </button>
          ))}
        </div>
        {items?.length === 0 && (
          <p className="mt-20 text-center text-text-secondary">Images you create or upload will show up here.</p>
        )}
      </div>
      {open && (
        <div className="fixed inset-0 z-40 flex flex-col bg-black/90" onClick={() => setOpen(null)}>
          <div className="flex justify-end gap-2 p-4 text-white" onClick={(e) => e.stopPropagation()}>
            {open.conversation_id && (
              <Link to={`/c/${open.conversation_id}`} className="flex items-center gap-1.5 rounded-full px-3 py-2 text-sm hover:bg-white/10">
                <ExternalLink size={16} /> Go to chat
              </Link>
            )}
            <a href={`${open.url}?download=1`} className="rounded-full p-2 hover:bg-white/10" title="Download">
              <Download size={18} />
            </a>
            <button type="button" onClick={() => setOpen(null)} className="rounded-full p-2 hover:bg-white/10" title="Close">
              <X size={18} />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center p-6">
            <img src={open.url} alt={open.name} className="max-h-full max-w-full rounded-lg" onClick={(e) => e.stopPropagation()} />
          </div>
        </div>
      )}
    </div>
  );
}

type ReadOnlyMessage = Pick<Message, 'role' | 'content' | 'attachments' | 'meta'>;

function ReadOnlyThread({ messages }: { messages: ReadOnlyMessage[] }) {
  return (
    <div className="flex flex-col gap-8">
      {messages.map((m, i) =>
        m.role === 'user' ? (
          <div key={i} className="flex flex-col items-end gap-2">
            {m.attachments.length > 0 && (
              <div className="flex flex-wrap justify-end gap-2">
                {m.attachments.map((a) => (
                  <AttachmentPreview key={a.id} attachment={a} />
                ))}
              </div>
            )}
            {m.content && (
              <div className="max-w-[70%] rounded-3xl bg-user-bubble px-5 py-2.5 whitespace-pre-wrap">{m.content}</div>
            )}
          </div>
        ) : (
          <div key={i} className="flex flex-col gap-3">
            {m.meta.images?.map((img) => (
              <img key={img.id} src={img.url} alt={img.prompt} className="max-h-[512px] max-w-full rounded-2xl" />
            ))}
            {m.content && <Markdown>{m.content}</Markdown>}
            {m.meta.sources && m.meta.sources.length > 0 && (
              <ul className="text-sm text-text-secondary">
                {m.meta.sources.map((s) => (
                  <li key={s.url}>
                    <a href={s.url} target="_blank" rel="noreferrer" className="underline">
                      {s.title || s.url}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ),
      )}
    </div>
  );
}

export function SharePage() {
  const { id } = useParams<{ id: string }>();
  const [share, setShare] = useState<SharedConversation | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (id) api.getShare(id).then(setShare).catch((e: Error) => setError(e.message));
  }, [id]);

  return (
    <div className="scrollbar-thin h-full overflow-y-auto bg-main">
      <header className="sticky top-0 flex items-center justify-between bg-main/90 px-5 py-3 backdrop-blur">
        <Link to="/" className="text-lg font-semibold">
          ChatGPT
        </Link>
        <Link to="/" className="rounded-full bg-inverse px-4 py-2 text-sm font-medium text-on-inverse">
          Start a new chat
        </Link>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">
        {error && <p className="mt-20 text-center text-text-secondary">{error}</p>}
        {share && (
          <>
            <h1 className="mb-1 text-3xl font-semibold">{share.title}</h1>
            <p className="mb-10 border-b border-border-subtle pb-6 text-sm text-text-tertiary">
              Shared {new Date(share.created_at).toLocaleDateString()} · This is a copy of a conversation between ChatGPT &
              an anonymous user.
            </p>
            <ReadOnlyThread messages={share.messages} />
          </>
        )}
      </main>
    </div>
  );
}

export function PrintPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<{ title: string; messages: ChatMessage[] } | null>(null);

  useEffect(() => {
    if (!id) return;
    document.documentElement.className = 'light';
    api.getConversation(id).then((c) => {
      const map = Object.fromEntries(c.messages.map((m) => [m.id, m]));
      const leaf = c.current_node_id ?? c.messages.at(-1)?.id ?? null;
      setData({ title: c.title, messages: pathTo(map, leaf) });
      document.title = c.title;
      setTimeout(() => window.print(), 600);
    });
  }, [id]);

  if (!data) return null;
  return (
    <div className="mx-auto max-w-3xl bg-white px-6 py-8 text-black">
      <h1 className="mb-8 text-2xl font-semibold">{data.title}</h1>
      <ReadOnlyThread messages={data.messages} />
    </div>
  );
}

const placeholderContent: Record<string, { title: string; description: string; cards: [string, string][] }> = {
  scheduled: {
    title: 'Scheduled',
    description: 'Ask ChatGPT to run tasks later or on a schedule — reminders, daily briefings, recurring summaries.',
    cards: [
      ['Daily news briefing', 'Every morning at 8:00'],
      ['Weekly project recap', 'Every Friday at 17:00'],
      ['Reminder', 'Once, tomorrow at 10:00'],
    ],
  },
  plugins: {
    title: 'Plugins',
    description: 'Connect ChatGPT to your apps and data sources such as Gmail, Google Drive, GitHub, Slack and Notion.',
    cards: [
      ['GitHub', 'Search code, issues and pull requests'],
      ['Google Drive', 'Find and reference your documents'],
      ['Gmail', 'Search and summarize email'],
      ['Notion', 'Read and write pages'],
    ],
  },
  codex: {
    title: 'Codex',
    description: 'A cloud coding agent that works on your repositories in parallel and proposes pull requests.',
    cards: [
      ['Connect a repository', 'Give Codex access to a GitHub repo'],
      ['Ask a question', 'Explain how a codebase works'],
      ['Write code', 'Implement a feature and open a PR'],
    ],
  },
  explore: {
    title: 'GPTs',
    description: 'Discover and create custom versions of ChatGPT that combine instructions, extra knowledge, and skills.',
    cards: [
      ['Writing coach', 'Improve clarity and tone'],
      ['Code tutor', 'Learn programming step by step'],
      ['Travel planner', 'Plan itineraries and budgets'],
      ['Research assistant', 'Find and summarize sources'],
    ],
  },
};

export function PlaceholderPage({ page, icon: Icon }: { page: keyof typeof placeholderContent; icon: LucideIcon }) {
  const content = placeholderContent[page];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TopBar showModelPicker={false} />
      <div className="scrollbar-thin flex-1 overflow-y-auto px-6 pb-10">
        <div className="mx-auto max-w-3xl pt-6 text-center">
          <Icon size={36} strokeWidth={1.5} className="mx-auto mb-4 text-text-secondary" />
          <h1 className="text-3xl font-semibold">{content.title}</h1>
          <p className="mx-auto mt-3 max-w-xl text-text-secondary">{content.description}</p>
          <span className="mt-4 inline-block rounded-full bg-surface px-3 py-1 text-xs text-text-secondary">Coming soon</span>
          <div className="mt-10 grid gap-3 text-left sm:grid-cols-2">
            {content.cards.map(([title, sub]) => (
              <div key={title} className="cursor-not-allowed rounded-2xl border border-border-subtle p-4 opacity-70">
                <p className="font-medium">{title}</p>
                <p className="text-sm text-text-tertiary">{sub}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
