import { useCallback, useEffect, useRef, useState } from 'react';
import { contentApi, ContentItem } from '../../api/content.api';
import { isDemoContentText } from '../../utils/demoDataCleanup';
import {
  parseTgChannelWorkspaceContent,
  selectLatestTgChannelRecord,
  serializeTgChannelWorkspace,
  TgChannelWorkspaceV2,
} from './tgChannelWorkspace';

export type TgWorkspaceSaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

interface SaveRequest {
  revision: number;
  workspace: TgChannelWorkspaceV2;
  metadata: Record<string, unknown>;
  createNew: boolean;
}

const AUTOSAVE_DELAY_MS = 800;

function errorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { data?: { error?: unknown } } }).response;
    if (typeof response?.data?.error === 'string') return response.data.error;
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
    || Boolean(error && typeof error === 'object' && 'code' in error && (error as { code?: unknown }).code === 'ERR_CANCELED');
}

export function useTgChannelWorkspaceStorage(projectId: string) {
  const [workspace, setWorkspace] = useState<TgChannelWorkspaceV2 | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saveStatus, setSaveStatus] = useState<TgWorkspaceSaveStatus>('idle');
  const [saveError, setSaveError] = useState('');
  const [loadRevision, setLoadRevision] = useState(0);
  const [scopeProjectId, setScopeProjectId] = useState('');

  const generationRef = useRef(0);
  const revisionRef = useRef(0);
  const savedIdRef = useRef<string | null>(null);
  const metadataRef = useRef<Record<string, unknown> | null>(null);
  const workspaceRef = useRef<TgChannelWorkspaceV2 | null>(null);
  const pendingRef = useRef<SaveRequest | null>(null);
  const timerRef = useRef<number | null>(null);
  const activeRequestRef = useRef<AbortController | null>(null);
  const saveChainRef = useRef<Promise<ContentItem | null>>(Promise.resolve(null));

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    generationRef.current += 1;
    const generation = generationRef.current;
    setScopeProjectId(projectId);
    clearTimer();
    activeRequestRef.current?.abort();
    activeRequestRef.current = null;
    pendingRef.current = null;
    saveChainRef.current = Promise.resolve(null);
    savedIdRef.current = null;
    metadataRef.current = null;
    workspaceRef.current = null;
    setWorkspace(null);
    setSavedId(null);
    setMetadata(null);
    setLoadError('');
    setSaveError('');
    setSaveStatus('idle');
    setLoaded(false);

    if (!projectId) {
      setLoading(false);
      setLoaded(true);
      return undefined;
    }

    const controller = new AbortController();
    activeRequestRef.current = controller;
    setLoading(true);
    contentApi.list(projectId, 'TG_CHANNEL', controller.signal)
      .then((items) => {
        if (generationRef.current !== generation) return;
        const eligible = items.filter((item) => !isDemoContentText(item));
        const latest = selectLatestTgChannelRecord(eligible, projectId);
        if (!latest) return;
        const parsed = parseTgChannelWorkspaceContent(latest.content);
        workspaceRef.current = parsed;
        savedIdRef.current = latest.id;
        metadataRef.current = latest.metadata;
        setWorkspace(parsed);
        setSavedId(latest.id);
        setMetadata(latest.metadata);
      })
      .catch((error) => {
        if (generationRef.current !== generation || isAbortError(error)) return;
        setLoadError(errorMessage(error, 'Не удалось загрузить данные ТГ-канала.'));
      })
      .finally(() => {
        if (generationRef.current !== generation) return;
        if (activeRequestRef.current === controller) activeRequestRef.current = null;
        setLoading(false);
        setLoaded(true);
      });

    return () => {
      controller.abort();
    };
  }, [clearTimer, loadRevision, projectId]);

  const enqueueSave = useCallback((request: SaveRequest): Promise<ContentItem | null> => {
    const generation = generationRef.current;
    const targetProjectId = projectId;
    const operation = saveChainRef.current
      .catch(() => null)
      .then(async () => {
        if (!targetProjectId || generationRef.current !== generation) return null;
        setSaveStatus('saving');
        setSaveError('');
        const controller = new AbortController();
        activeRequestRef.current = controller;
        try {
          const envelope = serializeTgChannelWorkspace(request.workspace);
          const content = JSON.stringify(envelope, null, 2);
          const currentId = request.createNew ? null : savedIdRef.current;
          const item = currentId
            ? await contentApi.update(currentId, {
              title: envelope.title,
              content,
              metadata: request.metadata,
            }, controller.signal)
            : await contentApi.create({
              projectId: targetProjectId,
              type: 'TG_CHANNEL',
              title: envelope.title,
              content,
              platform: 'Telegram',
              metadata: request.metadata,
            }, controller.signal);

          if (generationRef.current !== generation) return item;
          savedIdRef.current = item.id;
          metadataRef.current = item.metadata;
          workspaceRef.current = request.workspace;
          setSavedId(item.id);
          setMetadata(item.metadata);
          setWorkspace(request.workspace);
          if (!pendingRef.current || pendingRef.current.revision <= request.revision) {
            pendingRef.current = null;
          }
          setSaveStatus('saved');
          return item;
        } catch (error) {
          if (generationRef.current !== generation || isAbortError(error)) return null;
          pendingRef.current = request;
          setSaveStatus('error');
          setSaveError(errorMessage(error, 'Не удалось сохранить изменения.'));
          return null;
        } finally {
          if (activeRequestRef.current === controller) activeRequestRef.current = null;
        }
      });
    saveChainRef.current = operation;
    return operation;
  }, [projectId]);

  const makeRequest = useCallback((
    nextWorkspace: TgChannelWorkspaceV2,
    nextMetadata: Record<string, unknown>,
    createNew: boolean,
  ): SaveRequest => {
    revisionRef.current += 1;
    const request = {
      revision: revisionRef.current,
      workspace: nextWorkspace,
      metadata: nextMetadata,
      createNew,
    };
    pendingRef.current = request;
    workspaceRef.current = nextWorkspace;
    metadataRef.current = nextMetadata;
    setWorkspace(nextWorkspace);
    setMetadata(nextMetadata);
    return request;
  }, []);

  const scheduleSave = useCallback((
    nextWorkspace: TgChannelWorkspaceV2,
    nextMetadata: Record<string, unknown>,
  ) => {
    clearTimer();
    const request = makeRequest(nextWorkspace, nextMetadata, false);
    setSaveStatus('pending');
    setSaveError('');
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      if (pendingRef.current?.revision === request.revision) {
        void enqueueSave(request);
      }
    }, AUTOSAVE_DELAY_MS);
  }, [clearTimer, enqueueSave, makeRequest]);

  const saveNow = useCallback((
    nextWorkspace: TgChannelWorkspaceV2,
    nextMetadata: Record<string, unknown>,
    options: { createNew?: boolean } = {},
  ) => {
    clearTimer();
    const request = makeRequest(nextWorkspace, nextMetadata, Boolean(options.createNew));
    return enqueueSave(request);
  }, [clearTimer, enqueueSave, makeRequest]);

  const retrySave = useCallback(() => {
    clearTimer();
    const request = pendingRef.current;
    if (request) void enqueueSave(request);
  }, [clearTimer, enqueueSave]);

  const retryLoad = useCallback(() => {
    setLoadRevision((current) => current + 1);
  }, []);

  useEffect(() => () => {
    clearTimer();
    activeRequestRef.current?.abort();
  }, [clearTimer]);

  const scopeMatches = scopeProjectId === projectId;

  return {
    workspace: scopeMatches ? workspace : null,
    workspaceRef,
    savedId: scopeMatches ? savedId : null,
    metadata: scopeMatches ? metadata : null,
    loading: scopeMatches ? loading : true,
    loaded: scopeMatches ? loaded : false,
    loadError: scopeMatches ? loadError : '',
    saveStatus: scopeMatches ? saveStatus : 'idle',
    saveError: scopeMatches ? saveError : '',
    scheduleSave,
    saveNow,
    retrySave,
    retryLoad,
  };
}
