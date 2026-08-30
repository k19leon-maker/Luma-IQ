import type {
  UtpWorkspaceHistoryEntry,
  UtpWorkspaceMeta,
  UtpWorkspaceState,
} from '../../api/projects.api';

export type UtpSaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export interface UtpWorkspaceDraft {
  projectId: string;
  text: string;
  history: UtpWorkspaceHistoryEntry[];
  meta: UtpWorkspaceMeta | null;
  reason: 'manual' | 'ai' | 'restore';
}

interface Session {
  revision: number;
  timer: ReturnType<typeof setTimeout> | null;
  queued: UtpWorkspaceDraft | null;
  retry: UtpWorkspaceDraft | null;
  draining: Promise<UtpWorkspaceState | null> | null;
}

interface Options {
  delayMs?: number;
  save: (draft: UtpWorkspaceDraft, expectedRevision: number) => Promise<UtpWorkspaceState>;
  onStatus: (projectId: string, status: UtpSaveStatus, error?: string) => void;
  onSaved: (draft: UtpWorkspaceDraft, workspace: UtpWorkspaceState) => void;
}

function messageFromError(error: unknown): string {
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { status?: number } }).response;
    if (response?.status === 409) return 'УТП изменилось в другой вкладке. Обновите страницу и повторите правку.';
  }
  return 'Не удалось сохранить изменения. Проверьте соединение и повторите попытку.';
}

export class UtpAutosaveCoordinator {
  private readonly delayMs: number;
  private readonly saveRequest: Options['save'];
  private readonly onStatus: Options['onStatus'];
  private readonly onSaved: Options['onSaved'];
  private readonly sessions = new Map<string, Session>();
  private activeProjectId = '';

  constructor(options: Options) {
    this.delayMs = options.delayMs ?? 700;
    this.saveRequest = options.save;
    this.onStatus = options.onStatus;
    this.onSaved = options.onSaved;
  }

  private session(projectId: string): Session {
    const existing = this.sessions.get(projectId);
    if (existing) return existing;
    const created: Session = { revision: 0, timer: null, queued: null, retry: null, draining: null };
    this.sessions.set(projectId, created);
    return created;
  }

  activate(projectId: string, revision = 0) {
    const previous = this.activeProjectId;
    if (previous && previous !== projectId) {
      const previousSession = this.session(previous);
      if (previousSession.timer) clearTimeout(previousSession.timer);
      previousSession.timer = null;
      if (previousSession.queued) void this.flush(previous).catch(() => {});
    }
    this.activeProjectId = projectId;
    if (projectId) this.setRevision(projectId, revision);
    if (projectId) this.onStatus(projectId, 'idle');
  }

  setRevision(projectId: string, revision: number) {
    const session = this.session(projectId);
    if (!session.draining && !session.queued) session.revision = revision;
  }

  schedule(draft: UtpWorkspaceDraft) {
    if (!draft.projectId || draft.projectId !== this.activeProjectId) return;
    const session = this.session(draft.projectId);
    session.queued = draft;
    session.retry = null;
    if (session.timer) clearTimeout(session.timer);
    this.onStatus(draft.projectId, 'pending');
    session.timer = setTimeout(() => {
      session.timer = null;
      void this.flush(draft.projectId).catch(() => {});
    }, this.delayMs);
  }

  async saveNow(draft: UtpWorkspaceDraft): Promise<UtpWorkspaceState> {
    if (!draft.projectId) throw new Error('Project is required');
    const session = this.session(draft.projectId);
    if (session.timer) clearTimeout(session.timer);
    session.timer = null;
    session.queued = draft;
    session.retry = null;
    const result = await this.flush(draft.projectId);
    if (!result) throw new Error('UTP save did not run');
    return result;
  }

  async retry(projectId = this.activeProjectId): Promise<UtpWorkspaceState | null> {
    const session = this.session(projectId);
    if (session.retry) {
      session.queued = session.retry;
      session.retry = null;
    }
    return this.flush(projectId);
  }

  private async drain(projectId: string, session: Session): Promise<UtpWorkspaceState | null> {
    let lastSaved: UtpWorkspaceState | null = null;
    while (session.queued || session.retry) {
      const draft = session.queued ?? session.retry;
      if (!draft) break;
      session.queued = null;
      session.retry = null;
      if (projectId === this.activeProjectId) this.onStatus(projectId, 'saving');

      try {
        const workspace = await this.saveRequest(draft, session.revision);
        session.revision = workspace.revision;
        lastSaved = workspace;
        this.onSaved(draft, workspace);
        if (session.queued && projectId === this.activeProjectId) {
          this.onStatus(projectId, 'pending');
        }
      } catch (error) {
        session.retry = session.queued ?? draft;
        session.queued = null;
        if (projectId === this.activeProjectId) {
          this.onStatus(projectId, 'error', messageFromError(error));
        }
        throw error;
      }
    }
    if (lastSaved && projectId === this.activeProjectId) this.onStatus(projectId, 'saved');
    return lastSaved;
  }

  async flush(projectId = this.activeProjectId): Promise<UtpWorkspaceState | null> {
    if (!projectId) return null;
    const session = this.session(projectId);
    if (session.timer) clearTimeout(session.timer);
    session.timer = null;

    if (session.draining) {
      const result = await session.draining;
      if (session.queued || session.retry) return this.flush(projectId);
      return result;
    }

    if (!session.queued && !session.retry) return null;
    const draining = this.drain(projectId, session);
    session.draining = draining;
    try {
      return await draining;
    } finally {
      if (session.draining === draining) session.draining = null;
    }
  }

  dispose() {
    this.activeProjectId = '';
    for (const [projectId, session] of this.sessions) {
      if (session.timer) clearTimeout(session.timer);
      session.timer = null;
      if (session.queued) void this.flush(projectId).catch(() => {});
    }
  }
}
