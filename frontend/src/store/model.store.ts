import { create } from 'zustand';

// ── Claude ────────────────────────────────────────────────────────────────────

export const CLAUDE_MODELS = [
  { id: 'claude-opus-4-6',           label: 'Claude Opus 4.6',   badge: 'Мощный'    },
  { id: 'claude-sonnet-4-6',         label: 'Claude Sonnet 4.6', badge: 'Быстрый'   },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5',  badge: 'Экономный' },
] as const;

export type ClaudeModelId = typeof CLAUDE_MODELS[number]['id'];

// ── OpenAI ────────────────────────────────────────────────────────────────────

export const OPENAI_MODELS = [
  { id: 'gpt-5.5',     label: 'GPT-5.5',     badge: 'Максимум' },
  { id: 'gpt-5.4',     label: 'GPT-5.4',     badge: 'Основной' },
  { id: 'gpt-5.4-mini', label: 'GPT-5.4 mini', badge: 'Быстрый' },
  { id: 'gpt-4o',      label: 'GPT-4o',      badge: 'Legacy'   },
] as const;

export type OpenAIModelId = typeof OPENAI_MODELS[number]['id'];

// ── Provider ──────────────────────────────────────────────────────────────────

export type AIProvider = 'claude' | 'chatgpt';

export interface SectionSettings {
  provider:    AIProvider;
  claudeModel: ClaudeModelId;
  openaiModel: OpenAIModelId;
}

// ── Defaults ──────────────────────────────────────────────────────────────────

const SECTION_DEFAULTS: Record<string, ClaudeModelId> = {
  unpacking:       'claude-opus-4-6',
  audience:        'claude-sonnet-4-6',
  utp:             'claude-sonnet-4-6',
  social:          'claude-sonnet-4-6',
  'product-main':  'claude-sonnet-4-6',
  'product-mini':  'claude-sonnet-4-6',
  'lead-magnet':   'claude-sonnet-4-6',
  posts:           'claude-haiku-4-5-20251001',
  reels:           'claude-haiku-4-5-20251001',
  articles:        'claude-haiku-4-5-20251001',
  'video-scripts': 'claude-haiku-4-5-20251001',
  'chatbot-chains':'claude-haiku-4-5-20251001',
  'content-plan':  'claude-haiku-4-5-20251001',
};

const OPENAI_SECTION_DEFAULTS: Record<string, OpenAIModelId> = {
  'ai-dialog':     'gpt-5.4',
  unpacking:       'gpt-5.5',
  audience:        'gpt-5.5',
  strategy:        'gpt-5.5',
  utp:             'gpt-5.5',
  'product-main':  'gpt-5.5',
  'product-mini':  'gpt-5.5',
  'lead-magnet':   'gpt-5.5',
  posts:           'gpt-5.4',
  reels:           'gpt-5.4',
  'video-scripts': 'gpt-5.4',
};

const SELECTOR_SECTIONS = new Set(Object.keys(SECTION_DEFAULTS));

export function getSectionFromPath(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean);
  return parts[parts.length - 1] ?? '';
}

// Sections that now have MessageInput (inline model selector) or no AI text input
const INLINE_SELECTOR_SECTIONS = new Set([
  'unpacking',      // own inline selector
  'utp',            // MessageInput
  'posts',          // ModelBar below textarea
  'reels',          // ModelBar below textarea
  'articles',       // ModelBar below textarea
  'video-scripts',  // ModelBar below textarea
  'chatbot-chains', // ModelBar near generate
  'lead-magnet',    // MessageInput
  'content-plan',   // no AI text input
]);

export function isSelectorSection(pathname: string): boolean {
  const section = getSectionFromPath(pathname);
  if (INLINE_SELECTOR_SECTIONS.has(section)) return false;
  return SELECTOR_SECTIONS.has(section);
}

// ── Storage helpers ───────────────────────────────────────────────────────────

function readClaudeModel(section: string): ClaudeModelId | null {
  try {
    const v = localStorage.getItem(`selectedModel_${section}`);
    if (v && CLAUDE_MODELS.some((m) => m.id === v)) return v as ClaudeModelId;
  } catch { /* ignore */ }
  return null;
}

function readSettings(section: string): SectionSettings | null {
  try {
    const raw = localStorage.getItem(`sectionSettings_${section}`);
    if (raw) return JSON.parse(raw) as SectionSettings;
  } catch { /* ignore */ }
  return null;
}

function writeSettings(section: string, settings: SectionSettings): void {
  try {
    localStorage.setItem(`sectionSettings_${section}`, JSON.stringify(settings));
    // Keep backward-compat key for other components that read selectedModel_*
    localStorage.setItem(`selectedModel_${section}`, settings.claudeModel);
  } catch { /* ignore */ }
}

// ── Store ─────────────────────────────────────────────────────────────────────

interface ModelState {
  cache: Record<string, ClaudeModelId>;
  settingsCache: Record<string, SectionSettings>;

  // Legacy helpers (used by other sections)
  getModel:  (section: string) => ClaudeModelId;
  setModel:  (section: string, model: ClaudeModelId) => void;

  // Full section settings (provider + model)
  getSettings:    (section: string) => SectionSettings;
  setProvider:    (section: string, provider: AIProvider) => void;
  setClaudeModel: (section: string, model: ClaudeModelId) => void;
  setOpenAIModel: (section: string, model: OpenAIModelId) => void;
}

const DEFAULT_SETTINGS: SectionSettings = {
  provider:    'chatgpt',
  claudeModel: 'claude-sonnet-4-6',
  openaiModel: 'gpt-5.4',
};

export const useModelStore = create<ModelState>()((set, get) => ({
  cache:         {},
  settingsCache: {},

  getModel: (section) => {
    const cached = get().cache[section];
    if (cached) return cached;
    const stored = readClaudeModel(section);
    if (stored) return stored;
    return SECTION_DEFAULTS[section] ?? 'claude-haiku-4-5-20251001';
  },

  setModel: (section, model) => {
    try { localStorage.setItem(`selectedModel_${section}`, model); } catch { /* ignore */ }
    set((s) => ({ cache: { ...s.cache, [section]: model } }));
  },

  getSettings: (section) => {
    const cached = get().settingsCache[section];
    if (cached) return cached;
    const stored = readSettings(section);
    if (stored) return stored;
    return {
      ...DEFAULT_SETTINGS,
      claudeModel: SECTION_DEFAULTS[section] ?? DEFAULT_SETTINGS.claudeModel,
      openaiModel: OPENAI_SECTION_DEFAULTS[section] ?? DEFAULT_SETTINGS.openaiModel,
    };
  },

  setProvider: (section, provider) => {
    const current = get().getSettings(section);
    const next: SectionSettings = { ...current, provider };
    writeSettings(section, next);
    set((s) => ({ settingsCache: { ...s.settingsCache, [section]: next } }));
  },

  setClaudeModel: (section, model) => {
    const current = get().getSettings(section);
    const next: SectionSettings = { ...current, claudeModel: model };
    writeSettings(section, next);
    set((s) => ({
      cache: { ...s.cache, [section]: model },
      settingsCache: { ...s.settingsCache, [section]: next },
    }));
  },

  setOpenAIModel: (section, model) => {
    const current = get().getSettings(section);
    const next: SectionSettings = { ...current, openaiModel: model };
    writeSettings(section, next);
    set((s) => ({ settingsCache: { ...s.settingsCache, [section]: next } }));
  },
}));
