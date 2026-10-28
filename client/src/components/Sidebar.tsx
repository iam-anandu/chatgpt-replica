import { Link, useNavigate } from 'react-router-dom';
import {
  AtSign,
  BookOpen,
  Clock,
  Ellipsis,
  FolderPlus,
  PanelLeft,
  Search,
  SquarePen,
  Terminal,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import type { Conversation } from '../api';

interface SidebarProps {
  conversations: Conversation[];
  activeId?: string;
  onCollapse: () => void;
  onDelete: (id: string) => void;
}

const comingSoon = 'Coming soon';

function NavItem({
  icon: Icon,
  label,
  to,
  title,
}: {
  icon: LucideIcon;
  label: string;
  to?: string;
  title?: string;
}) {
  const className =
    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm text-text-primary hover:bg-surface-hover';
  const content = (
    <>
      <Icon size={17} strokeWidth={1.75} className="shrink-0" />
      <span className="truncate">{label}</span>
    </>
  );
  return to ? (
    <Link to={to} className={className}>
      {content}
    </Link>
  ) : (
    <button type="button" className={className} title={title}>
      {content}
    </button>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="px-2.5 pt-5 pb-1.5 text-sm text-text-tertiary">{children}</h2>;
}

function ConversationItem({
  conversation,
  active,
  onDelete,
}: {
  conversation: Conversation;
  active: boolean;
  onDelete: (id: string) => void;
}) {
  return (
    <div
      className={`group relative flex items-center rounded-lg ${active ? 'bg-surface' : 'hover:bg-surface-hover'}`}
    >
      <Link to={`/c/${conversation.id}`} className="min-w-0 flex-1 truncate px-2.5 py-1.5 text-sm">
        {conversation.title}
      </Link>
      <button
        type="button"
        title="Delete"
        onClick={() => onDelete(conversation.id)}
        className={`mr-1 rounded-md p-1 text-text-secondary hover:text-text-primary ${active ? 'block' : 'hidden group-hover:block'}`}
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}

export function Sidebar({ conversations, activeId, onCollapse, onDelete }: SidebarProps) {
  const navigate = useNavigate();
  const pinned = conversations.filter((c) => c.pinned);
  const recents = conversations.filter((c) => !c.pinned && !c.project_id);

  return (
    <aside className="flex h-full w-[260px] shrink-0 flex-col bg-sidebar">
      <div className="flex items-center justify-between px-3 pt-3 pb-2">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="rounded-lg px-1.5 py-1 text-lg font-semibold tracking-tight hover:bg-surface-hover"
        >
          ChatGPT
        </button>
        <div className="flex items-center gap-0.5 text-text-secondary">
          <button type="button" title={`Search chats (${comingSoon})`} className="rounded-lg p-2 hover:bg-surface-hover">
            <Search size={18} strokeWidth={1.75} />
          </button>
          <button type="button" title="Close sidebar" onClick={onCollapse} className="rounded-lg p-2 hover:bg-surface-hover">
            <PanelLeft size={18} strokeWidth={1.75} />
          </button>
        </div>
      </div>

      <nav className="scrollbar-thin flex-1 overflow-y-auto px-2 pb-3">
        <div className="space-y-px">
          <NavItem icon={SquarePen} label="New chat" to="/" />
          <NavItem icon={Clock} label="Scheduled" title={comingSoon} />
          <NavItem icon={BookOpen} label="Library" title={comingSoon} />
          <NavItem icon={AtSign} label="Plugins" title={comingSoon} />
          <NavItem icon={Terminal} label="Codex" title={comingSoon} />
          <NavItem icon={Ellipsis} label="Explore" title={comingSoon} />
        </div>

        {pinned.length > 0 && (
          <>
            <SectionTitle>Pinned</SectionTitle>
            {pinned.map((c) => (
              <ConversationItem key={c.id} conversation={c} active={c.id === activeId} onDelete={onDelete} />
            ))}
          </>
        )}

        <SectionTitle>Projects</SectionTitle>
        <NavItem icon={FolderPlus} label="New project" title={comingSoon} />

        {recents.length > 0 && (
          <>
            <SectionTitle>Recents</SectionTitle>
            {recents.map((c) => (
              <ConversationItem key={c.id} conversation={c} active={c.id === activeId} onDelete={onDelete} />
            ))}
          </>
        )}
      </nav>

      <div className="border-t border-border-subtle px-2 py-2">
        <button type="button" className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-surface-hover">
          <span className="flex size-7 items-center justify-center rounded-full bg-accent text-[11px] font-medium text-white">
            IA
          </span>
          <span className="text-left leading-tight">
            <span className="block text-sm">iam-anandu</span>
            <span className="block text-xs text-text-tertiary">Go</span>
          </span>
        </button>
      </div>
    </aside>
  );
}
