import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  Archive,
  AtSign,
  BarChart3,
  BookOpen,
  Clock,
  Ellipsis,
  Folder,
  FolderInput,
  FolderPlus,
  Keyboard,
  PanelLeft,
  Pencil,
  Pin,
  PinOff,
  Search,
  Settings,
  Share,
  SlidersHorizontal,
  SquarePen,
  Terminal,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { api, type Conversation } from '../api';
import { useApp } from '../store/app';
import { useChat } from '../store/chat';
import { Menu, MenuDivider, MenuItem } from './ui';

const closeOnMobile = () => window.innerWidth < 768 && useApp.getState().set({ sidebarOpen: false });

function NavItem({ icon: Icon, label, to, onClick }: { icon: LucideIcon; label: string; to?: string; onClick?: () => void }) {
  const className = (active: boolean) =>
    `flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm hover:bg-surface-hover ${active ? 'bg-surface' : ''}`;
  const content = (
    <>
      <Icon size={17} strokeWidth={1.75} className="shrink-0" />
      <span className="truncate">{label}</span>
    </>
  );
  return to ? (
    <NavLink to={to} end onClick={closeOnMobile} className={({ isActive }) => className(isActive && to !== '/')}>
      {content}
    </NavLink>
  ) : (
    <button type="button" onClick={onClick} className={className(false)}>
      {content}
    </button>
  );
}

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <h2 className="px-2.5 pt-5 pb-1.5 text-sm text-text-tertiary">{children}</h2>
);

export function ConversationItem({ conversation, active }: { conversation: Conversation; active: boolean }) {
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(conversation.title);
  const projects = useApp((s) => s.projects);
  const refresh = useApp((s) => s.refreshConversations);
  const navigate = useNavigate();

  const update = async (patch: Parameters<typeof api.updateConversation>[1]) => {
    await api.updateConversation(conversation.id, patch);
    await refresh();
  };

  const remove = async () => {
    if (!confirm(`Delete "${conversation.title}"?`)) return;
    await api.deleteConversation(conversation.id);
    if (active) navigate('/');
    refresh();
  };

  if (renaming) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setRenaming(false);
          if (title.trim() && title !== conversation.title) update({ title });
        }}
      >
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={(e) => e.currentTarget.form?.requestSubmit()}
          onKeyDown={(e) => e.key === 'Escape' && setRenaming(false)}
          className="w-full rounded-lg border border-accent bg-main px-2.5 py-1.5 text-sm outline-none"
        />
      </form>
    );
  }

  return (
    <div className={`group relative flex items-center rounded-lg ${active ? 'bg-surface' : 'hover:bg-surface-hover'}`}>
      <Link to={`/c/${conversation.id}`} onClick={closeOnMobile} className="min-w-0 flex-1 truncate px-2.5 py-1.5 text-sm">
        {conversation.title}
      </Link>
      <Menu
        trigger={({ toggle, open }) => (
          <button
            type="button"
            title="Options"
            onClick={toggle}
            className={`mr-1 rounded-md p-1 text-text-secondary hover:text-text-primary ${
              active || open ? 'block' : 'hidden group-hover:block'
            }`}
          >
            <Ellipsis size={16} />
          </button>
        )}
      >
        {(close) => (
          <>
            <MenuItem icon={Share} onClick={() => (close(), useApp.getState().set({ shareConversationId: conversation.id }))}>
              Share
            </MenuItem>
            <MenuItem
              icon={Pencil}
              onClick={() => {
                close();
                setTitle(conversation.title);
                setRenaming(true);
              }}
            >
              Rename
            </MenuItem>
            <MenuItem icon={conversation.pinned ? PinOff : Pin} onClick={() => (close(), update({ pinned: !conversation.pinned }))}>
              {conversation.pinned ? 'Unpin chat' : 'Pin chat'}
            </MenuItem>
            {projects.length > 0 && (
              <>
                <MenuDivider />
                <p className="flex items-center gap-2 px-2.5 py-1 text-xs text-text-tertiary">
                  <FolderInput size={14} /> Move to project
                </p>
                {conversation.project_id && (
                  <MenuItem onClick={() => (close(), update({ project_id: null }))}>Remove from project</MenuItem>
                )}
                {projects
                  .filter((p) => p.id !== conversation.project_id)
                  .map((p) => (
                    <MenuItem key={p.id} icon={Folder} onClick={() => (close(), update({ project_id: p.id }))}>
                      {p.name}
                    </MenuItem>
                  ))}
              </>
            )}
            <MenuDivider />
            <MenuItem
              icon={Archive}
              onClick={async () => {
                close();
                await update({ archived: true });
                if (active) navigate('/');
              }}
            >
              Archive
            </MenuItem>
            <MenuItem icon={Trash2} danger onClick={() => (close(), remove())}>
              Delete
            </MenuItem>
          </>
        )}
      </Menu>
    </div>
  );
}

export function Sidebar() {
  const conversations = useApp((s) => s.conversations);
  const projects = useApp((s) => s.projects);
  const nickname = useApp((s) => s.settings?.nickname);
  const setApp = useApp((s) => s.set);
  const activeId = useChat((s) => s.conversationId);
  const navigate = useNavigate();
  const pinned = conversations.filter((c) => c.pinned);
  const recents = conversations.filter((c) => !c.pinned && !c.project_id);
  const name = nickname || 'iam-anandu';

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
          <button type="button" title="Search chats (Ctrl+K)" onClick={() => setApp({ searchOpen: true })} className="rounded-lg p-2 hover:bg-surface-hover">
            <Search size={18} strokeWidth={1.75} />
          </button>
          <button type="button" title="Close sidebar (Ctrl+Shift+S)" onClick={() => setApp({ sidebarOpen: false })} className="rounded-lg p-2 hover:bg-surface-hover">
            <PanelLeft size={18} strokeWidth={1.75} />
          </button>
        </div>
      </div>

      <nav className="scrollbar-thin flex-1 overflow-y-auto px-2 pb-3">
        <div className="space-y-px">
          <NavItem icon={SquarePen} label="New chat" to="/" />
          <NavItem icon={Clock} label="Scheduled" to="/scheduled" />
          <NavItem icon={BookOpen} label="Library" to="/library" />
          <NavItem icon={AtSign} label="Plugins" to="/plugins" />
          <NavItem icon={Terminal} label="Codex" to="/codex" />
          <NavItem icon={Ellipsis} label="Explore" to="/explore" />
        </div>

        {pinned.length > 0 && (
          <>
            <SectionTitle>Pinned</SectionTitle>
            {pinned.map((c) => (
              <ConversationItem key={c.id} conversation={c} active={c.id === activeId} />
            ))}
          </>
        )}

        <SectionTitle>Projects</SectionTitle>
        <NavItem icon={FolderPlus} label="New project" onClick={() => setApp({ newProjectOpen: true })} />
        {projects.map((p) => (
          <NavLink
            key={p.id}
            to={`/project/${p.id}`}
            onClick={closeOnMobile}
            className={({ isActive }) =>
              `flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm hover:bg-surface-hover ${isActive ? 'bg-surface' : ''}`
            }
          >
            <Folder size={17} strokeWidth={1.75} style={{ color: p.color ?? undefined }} className="shrink-0" />
            <span className="truncate">{p.name}</span>
          </NavLink>
        ))}

        {recents.length > 0 && (
          <>
            <SectionTitle>Recents</SectionTitle>
            {recents.map((c) => (
              <ConversationItem key={c.id} conversation={c} active={c.id === activeId} />
            ))}
          </>
        )}
      </nav>

      <div className="border-t border-border-subtle px-2 py-2">
        <Menu
          placement="top"
          trigger={({ toggle }) => (
            <button type="button" onClick={toggle} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-surface-hover">
              <span className="flex size-7 items-center justify-center rounded-full bg-accent text-[11px] font-medium text-white uppercase">
                {name.slice(0, 2)}
              </span>
              <span className="text-left leading-tight">
                <span className="block text-sm">{name}</span>
                <span className="block text-xs text-text-tertiary">Go</span>
              </span>
            </button>
          )}
        >
          {(close) => (
            <>
              <MenuItem icon={SlidersHorizontal} onClick={() => (close(), setApp({ settingsTab: 'personalization' }))}>
                Personalization
              </MenuItem>
              <MenuItem icon={Settings} onClick={() => (close(), setApp({ settingsTab: 'general' }))}>
                Settings
              </MenuItem>
              <MenuItem icon={BarChart3} onClick={() => (close(), setApp({ settingsTab: 'usage' }))}>
                Usage
              </MenuItem>
              <MenuDivider />
              <MenuItem icon={Keyboard} onClick={() => (close(), setApp({ shortcutsOpen: true }))}>
                Keyboard shortcuts
              </MenuItem>
            </>
          )}
        </Menu>
      </div>
    </aside>
  );
}
