import { useEffect } from 'react';
import { Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { AtSign, Clock, Ellipsis, Terminal } from 'lucide-react';
import { api } from './api';
import { useApp } from './store/app';
import { pathTo, setChatNavigator, useChat } from './store/chat';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { ChatView } from './components/ChatView';
import { SettingsModal } from './components/SettingsModal';
import { NewProjectDialog, SearchModal, ShareDialog, ShortcutsDialog } from './components/dialogs';
import { VoiceMode } from './components/VoiceMode';
import { Toasts, copyText } from './components/ui';
import { ProjectPage } from './pages/ProjectPage';
import { LibraryPage, PlaceholderPage, PrintPage, SharePage } from './pages/pages';

function ChatPage() {
  const { id } = useParams<{ id: string }>();
  useEffect(() => {
    if (id) useChat.getState().load(id);
    else useChat.getState().reset();
  }, [id]);
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TopBar />
      <ChatView />
    </div>
  );
}

function useTheme(enabled: boolean) {
  const theme = useApp((s) => s.settings?.theme ?? 'dark');
  useEffect(() => {
    if (!enabled) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const resolved = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
      document.documentElement.className = resolved;
    };
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme, enabled]);
}

function useShortcuts() {
  const navigate = useNavigate();
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const app = useApp.getState();
      if (mod && e.shiftKey && key === 'o') {
        e.preventDefault();
        navigate('/');
      } else if (mod && !e.shiftKey && key === 'k') {
        e.preventDefault();
        app.set({ searchOpen: !app.searchOpen });
      } else if (mod && e.shiftKey && key === 's') {
        e.preventDefault();
        app.set({ sidebarOpen: !app.sidebarOpen });
      } else if (mod && e.shiftKey && key === 'c') {
        e.preventDefault();
        const { messages, leafId } = useChat.getState();
        const last = pathTo(messages, leafId).filter((m) => m.role === 'assistant').at(-1);
        if (last) copyText(last.content);
      } else if (e.shiftKey && key === 'escape') {
        e.preventDefault();
        document.querySelector<HTMLTextAreaElement>('form textarea')?.focus();
      } else if (mod && e.shiftKey && key === 'backspace') {
        const id = useChat.getState().conversationId;
        if (id && confirm('Delete this chat?')) {
          e.preventDefault();
          await api.deleteConversation(id);
          app.refreshConversations();
          navigate('/');
        }
      } else if (mod && key === '/') {
        e.preventDefault();
        app.set({ shortcutsOpen: !app.shortcutsOpen });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);
}

function Shell() {
  const sidebarOpen = useApp((s) => s.sidebarOpen);
  const settingsTab = useApp((s) => s.settingsTab);
  const searchOpen = useApp((s) => s.searchOpen);
  const shortcutsOpen = useApp((s) => s.shortcutsOpen);
  const shareId = useApp((s) => s.shareConversationId);
  const newProjectOpen = useApp((s) => s.newProjectOpen);
  const voiceModeOpen = useApp((s) => s.voiceModeOpen);
  const ready = useApp((s) => !!s.settings);
  const setApp = useApp((s) => s.set);
  useShortcuts();

  if (!ready) return null;

  return (
    <div className="flex h-full overflow-hidden">
      {sidebarOpen && (
        <>
          <div className="fixed inset-0 z-10 bg-black/50 md:hidden" onClick={() => setApp({ sidebarOpen: false })} />
          <div className="fixed inset-y-0 left-0 z-20 md:static">
            <Sidebar />
          </div>
        </>
      )}
      <main className="flex min-w-0 flex-1 flex-col">
        <Routes>
          <Route path="/" element={<ChatPage />} />
          <Route path="/c/:id" element={<ChatPage />} />
          <Route path="/project/:id" element={<ProjectPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/scheduled" element={<PlaceholderPage page="scheduled" icon={Clock} />} />
          <Route path="/plugins" element={<PlaceholderPage page="plugins" icon={AtSign} />} />
          <Route path="/codex" element={<PlaceholderPage page="codex" icon={Terminal} />} />
          <Route path="/explore" element={<PlaceholderPage page="explore" icon={Ellipsis} />} />
          <Route path="*" element={<ChatPage />} />
        </Routes>
      </main>
      {settingsTab && <SettingsModal tab={settingsTab} />}
      {searchOpen && <SearchModal />}
      {shortcutsOpen && <ShortcutsDialog />}
      {shareId && <ShareDialog conversationId={shareId} />}
      {newProjectOpen && <NewProjectDialog />}
      {voiceModeOpen && <VoiceMode />}
    </div>
  );
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const standalone = /^\/(share|print)\//.test(location.pathname);
  useTheme(!location.pathname.startsWith('/print/'));

  useEffect(() => {
    setChatNavigator((path, replace) => navigate(path, { replace }));
  }, [navigate]);

  useEffect(() => {
    if (!standalone) useApp.getState().init().catch((err) => useApp.getState().toast(err.message, 'error'));
  }, [standalone]);

  return (
    <>
      {standalone ? (
        <Routes>
          <Route path="/share/:id" element={<SharePage />} />
          <Route path="/print/:id" element={<PrintPage />} />
        </Routes>
      ) : (
        <Shell />
      )}
      <Toasts />
    </>
  );
}
