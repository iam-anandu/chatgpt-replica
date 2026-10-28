import { create } from 'zustand';
import { api, type AppConfig, type Conversation, type Project, type Settings } from '../api';

export type SettingsTab = 'general' | 'personalization' | 'data' | 'usage';

interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'error';
}

interface AppState {
  config: AppConfig | null;
  settings: Settings | null;
  conversations: Conversation[];
  projects: Project[];
  model: string;
  sidebarOpen: boolean;
  settingsTab: SettingsTab | null;
  searchOpen: boolean;
  shortcutsOpen: boolean;
  shareConversationId: string | null;
  newProjectOpen: boolean;
  voiceModeOpen: boolean;
  toasts: Toast[];

  init: () => Promise<void>;
  refreshConversations: () => Promise<void>;
  refreshProjects: () => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  setModel: (model: string) => void;
  set: (patch: Partial<AppState>) => void;
  toast: (text: string, tone?: Toast['tone']) => void;
}

export const useApp = create<AppState>((set, get) => ({
  config: null,
  settings: null,
  conversations: [],
  projects: [],
  model: localStorage.getItem('model') ?? '',
  sidebarOpen: window.innerWidth >= 768 && localStorage.getItem('sidebarOpen') !== 'false',
  settingsTab: null,
  searchOpen: false,
  shortcutsOpen: false,
  shareConversationId: null,
  newProjectOpen: false,
  voiceModeOpen: false,
  toasts: [],

  init: async () => {
    const [config, settings] = await Promise.all([api.config(), api.settings()]);
    const stored = get().model;
    set({ config, settings, model: config.models.includes(stored) ? stored : settings.defaultModel });
    await Promise.all([get().refreshConversations(), get().refreshProjects()]);
  },
  refreshConversations: async () => set({ conversations: await api.listConversations() }),
  refreshProjects: async () => set({ projects: await api.listProjects() }),
  updateSettings: async (patch) => {
    set({ settings: { ...get().settings!, ...patch } });
    set({ settings: await api.updateSettings(patch) });
  },
  setModel: (model) => {
    localStorage.setItem('model', model);
    set({ model });
  },
  set: (patch) => {
    if ('sidebarOpen' in patch && window.innerWidth >= 768) {
      localStorage.setItem('sidebarOpen', String(patch.sidebarOpen));
    }
    set(patch);
  },
  toast: (text, tone = 'info') => {
    const id = Date.now() + Math.random();
    set({ toasts: [...get().toasts, { id, text, tone }] });
    setTimeout(() => set({ toasts: get().toasts.filter((t) => t.id !== id) }), 3500);
  },
}));
