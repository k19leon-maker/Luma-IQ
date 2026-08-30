import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { aiApi, type UtpAiResult, type WorkflowResponse } from '../../api/ai';
import {
  projectsApi,
  type UtpFoundation,
  type UtpWorkspaceHistoryEntry,
  type UtpWorkspaceMeta,
} from '../../api/projects.api';
import { useProjectMarketingContext } from '../../hooks/useProjectMarketingContext';
import { useGeneratedStore, type AiResultVersion, type UtpMeta } from '../../store/generated.store';
import { useMaterialsStore } from '../../store/materials.store';
import { useProgressStore } from '../../store/progress.store';
import { makeAiIdempotencyKey } from '../../utils/aiIdempotency';
import { buildUtpMaterial } from '../../utils/projectMaterials';
import { UtpEditorPanel } from './UtpEditorPanel';
import type { UtpAiProposal } from './UtpAiProposalPanel';
import { UtpFoundationPanel } from './UtpFoundationPanel';
import type { UtpMissingDataItem } from './UtpMissingData';
import {
  UtpAutosaveCoordinator,
  type UtpSaveStatus,
  type UtpWorkspaceDraft,
} from './utpAutosave';
import s from './UTP.module.css';

const FOUNDATION_LABELS = {
  niche: 'Уточните нишу или специализацию',
  audience: 'Выберите целевую аудиторию',
  jtbd: 'Опишите главную задачу клиента',
  pains: 'Добавьте боли и проблемы аудитории',
  desiredOutcome: 'Уточните желаемый результат',
  product: 'Опишите продукт или услугу',
  mechanism: 'Опишите механизм работы',
  differentiation: 'Уточните отличие от альтернатив',
  proofs: 'Добавьте реальные доказательства или кейсы',
  constraints: 'Укажите важные ограничения',
} as const;

interface UtpAiActionSnapshot {
  id: string;
  projectId: string;
  mode: 'generate' | 'improve';
  workflow: 'strategy.utp.generate' | 'strategy.utp.improve';
  currentText: string;
  instruction: string;
  inputs: Record<string, unknown>;
  idempotencyKey: string;
}

function aiErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as {
      response?: { data?: { error?: unknown; userMessage?: unknown; aiBalanceStatus?: unknown } };
    }).response;
    const data = response?.data;
    if (data?.aiBalanceStatus === 'insufficient') {
      return 'Недостаточно AI-баллов. Запрос не запускался, баллы не списаны.';
    }
    const message = typeof data?.userMessage === 'string'
      ? data.userMessage
      : typeof data?.error === 'string' ? data.error : '';
    if (message) return message;
  }
  return 'Не удалось получить AI-вариант. AI-баллы не списаны или возвращены на баланс.';
}

function foundationMissingData(foundation: UtpFoundation | null): UtpMissingDataItem[] {
  if (!foundation) return [];
  const sections = [
    ['niche', foundation.niche],
    ['audience', foundation.audience],
    ['jtbd', foundation.jtbd],
    ['pains', foundation.pains],
    ['desiredOutcome', foundation.desiredOutcome],
    ['product', foundation.product],
    ['mechanism', foundation.mechanism],
    ['differentiation', foundation.differentiation],
    ['proofs', foundation.proofs],
    ['constraints', foundation.constraints],
  ] as const;

  return sections
    .filter(([, section]) => section.status === 'missing')
    .map(([key, section]) => ({ key, label: FOUNDATION_LABELS[key], editPath: section.editPath }));
}

function materialWithTimestamp(text: string, updatedAt: string) {
  return { ...buildUtpMaterial(text), updatedAt };
}

export default function UTP() {
  const { activeProjectId } = useProjectMarketingContext();
  const savedData = useGeneratedStore((state) => state.getProject(activeProjectId));
  const hydrateUtpWorkspace = useGeneratedStore((state) => state.hydrateUtpWorkspace);
  const hydrateMaterial = useMaterialsStore((state) => state.hydrateMaterial);
  const completeUtp = useProgressStore((state) => state.completeUtp);

  const [utpText, setUtpText] = useState('');
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [aiError, setAiError] = useState('');
  const [proposal, setProposal] = useState<UtpAiProposal | null>(null);
  const [applyingProposal, setApplyingProposal] = useState(false);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);
  const [workspaceError, setWorkspaceError] = useState('');
  const [workspaceReloadKey, setWorkspaceReloadKey] = useState(0);
  const [saveStatus, setSaveStatus] = useState<UtpSaveStatus>('idle');
  const [saveError, setSaveError] = useState('');
  const [foundation, setFoundation] = useState<UtpFoundation | null>(null);
  const [foundationLoading, setFoundationLoading] = useState(false);
  const [foundationError, setFoundationError] = useState('');
  const [foundationReloadKey, setFoundationReloadKey] = useState(0);

  const mountedRef = useRef(true);
  const activeProjectRef = useRef(activeProjectId);
  const draftTextRef = useRef('');
  const lastSavedTextRef = useRef('');
  const historyRef = useRef<UtpWorkspaceHistoryEntry[]>([]);
  const metaRef = useRef<UtpWorkspaceMeta | null>(null);
  const manualSessionStartedRef = useRef(false);
  const activeAiActionRef = useRef('');
  const retryAiActionRef = useRef<UtpAiActionSnapshot | null>(null);
  activeProjectRef.current = activeProjectId;

  const autosaveRef = useRef<UtpAutosaveCoordinator | null>(null);
  if (!autosaveRef.current) {
    autosaveRef.current = new UtpAutosaveCoordinator({
      save: (draft, expectedRevision) => projectsApi.saveUtpWorkspace(draft.projectId, {
        text: draft.text,
        history: draft.history,
        meta: draft.meta,
        expectedRevision,
        reason: draft.reason,
      }),
      onStatus: (projectId, status, error) => {
        if (!mountedRef.current || projectId !== activeProjectRef.current) return;
        setSaveStatus(status);
        setSaveError(error ?? '');
      },
      onSaved: (draft, workspace) => {
        const isCurrentDraft = draft.projectId === activeProjectRef.current
          && draft.text === draftTextRef.current;
        if (draft.projectId !== activeProjectRef.current || isCurrentDraft) {
          hydrateUtpWorkspace(draft.projectId, workspace.text, workspace.history, workspace.meta);
          hydrateMaterial(draft.projectId, materialWithTimestamp(workspace.text, workspace.savedAt));
        }
        if (!mountedRef.current || !isCurrentDraft) return;
        lastSavedTextRef.current = workspace.text;
        historyRef.current = workspace.history;
        metaRef.current = workspace.meta;
        completeUtp();
      },
    });
  }
  const autosave = autosaveRef.current;
  const workspaceUnavailable = workspaceLoading
    || Boolean(workspaceError)
    || !activeProjectId
    || activeProjectId === 'default';

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      autosave.dispose();
    };
  }, [autosave]);

  useEffect(() => {
    let active = true;
    const projectId = activeProjectId;
    autosave.activate(projectId, 0);
    manualSessionStartedRef.current = false;
    activeAiActionRef.current = '';
    retryAiActionRef.current = null;
    setInputText('');
    setLoading(false);
    setVoiceBusy(false);
    setAiError('');
    setProposal(null);
    setApplyingProposal(false);
    setWorkspaceError('');
    setSaveError('');

    if (!projectId || projectId === 'default') {
      setUtpText('');
      draftTextRef.current = '';
      lastSavedTextRef.current = '';
      historyRef.current = [];
      metaRef.current = null;
      setWorkspaceLoading(false);
      return () => { active = false; };
    }

    setWorkspaceLoading(true);
    setUtpText('');
    draftTextRef.current = '';
    lastSavedTextRef.current = '';
    historyRef.current = [];
    metaRef.current = null;
    hydrateUtpWorkspace(projectId, '', [], null);

    void (async () => {
      try {
        await autosave.flush(projectId).catch(() => null);
        const workspace = await projectsApi.getUtpWorkspace(projectId);
        if (!active || activeProjectRef.current !== projectId) return;
        autosave.setRevision(projectId, workspace.revision);
        setUtpText(workspace.text);
        draftTextRef.current = workspace.text;
        lastSavedTextRef.current = workspace.text;
        historyRef.current = workspace.history;
        metaRef.current = workspace.meta;
        hydrateUtpWorkspace(projectId, workspace.text, workspace.history, workspace.meta);
        hydrateMaterial(projectId, materialWithTimestamp(workspace.text, workspace.savedAt));
        setSaveStatus('saved');
      } catch {
        if (!active || activeProjectRef.current !== projectId) return;
        setWorkspaceError('Не удалось загрузить сохранённое УТП. Повторите попытку.');
        setSaveStatus('error');
      } finally {
        if (active && activeProjectRef.current === projectId) setWorkspaceLoading(false);
      }
    })();

    return () => { active = false; };
  }, [activeProjectId, autosave, hydrateMaterial, hydrateUtpWorkspace, workspaceReloadKey]);

  useEffect(() => {
    let active = true;
    setFoundation(null);
    setFoundationError('');

    if (!activeProjectId || activeProjectId === 'default') {
      setFoundationLoading(false);
      return () => { active = false; };
    }

    setFoundationLoading(true);
    projectsApi.getUtpFoundation(activeProjectId)
      .then((result) => {
        if (!active) return;
        setFoundation(result);
      })
      .catch(() => {
        if (!active) return;
        setFoundationError('Не удалось загрузить контекст проекта. Текст УТП остаётся доступен.');
      })
      .finally(() => {
        if (active) setFoundationLoading(false);
      });

    return () => { active = false; };
  }, [activeProjectId, foundationReloadKey]);

  const missingData = useMemo(() => {
    const aiMissing = savedData.utpMeta?.missingData ?? [];
    const foundationMissing = foundationMissingData(foundation);
    const byKey = new Map<string, UtpMissingDataItem>();
    for (const item of [...aiMissing, ...foundationMissing]) {
      if (!byKey.has(item.key)) byKey.set(item.key, item);
    }
    return [...byKey.values()];
  }, [foundation, savedData.utpMeta?.missingData]);

  function buildVersion(
    value: string,
    title: string,
    source: AiResultVersion<string>['source'],
    meta?: Partial<AiResultVersion<string>>,
  ): AiResultVersion<string> {
    return {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title,
      createdAt: new Date().toISOString(),
      source,
      workflowRunId: meta?.workflowRunId,
      workflowStepId: meta?.workflowStepId,
      artifactId: meta?.artifactId,
      generationId: meta?.generationId,
      value,
    };
  }

  function updateLocalDraft(
    projectId: string,
    text: string,
    history: UtpWorkspaceHistoryEntry[],
    meta: UtpWorkspaceMeta | null,
  ) {
    setUtpText(text);
    draftTextRef.current = text;
    historyRef.current = history;
    metaRef.current = meta;
    hydrateUtpWorkspace(projectId, text, history, meta);
    hydrateMaterial(projectId, materialWithTimestamp(text, new Date().toISOString()));
  }

  function handleManualChange(value: string) {
    const projectId = activeProjectRef.current;
    if (!projectId || projectId === 'default' || workspaceUnavailable) return;

    retryAiActionRef.current = null;
    setAiError('');

    let history = historyRef.current;
    if (!manualSessionStartedRef.current && lastSavedTextRef.current.trim()) {
      history = [
        buildVersion(lastSavedTextRef.current, 'До ручной правки', 'manual'),
        ...history,
      ].slice(0, 20);
      manualSessionStartedRef.current = true;
    }
    updateLocalDraft(projectId, value, history, null);
    autosave.schedule({ projectId, text: value, history, meta: null, reason: 'manual' });
  }

  async function handleEditorBlur() {
    const projectId = activeProjectRef.current;
    if (!projectId || projectId === 'default') return;
    try {
      await autosave.flush(projectId);
      manualSessionStartedRef.current = false;
    } catch {
      // Retry stays available in the editor; do not hide a failed save.
    }
  }

  async function persistUtp(
    projectId: string,
    value: string,
    version?: AiResultVersion<string>,
    meta?: UtpMeta | null,
    reason: UtpWorkspaceDraft['reason'] = 'ai',
  ) {
    if (!projectId || projectId === 'default') throw new Error('Project is required');
    if (projectId !== activeProjectRef.current) throw new Error('Active project changed');
    const history = version ? [version, ...historyRef.current].slice(0, 20) : historyRef.current;
    const nextMeta = meta ?? null;
    manualSessionStartedRef.current = false;
    updateLocalDraft(projectId, value, history, nextMeta);
    await autosave.saveNow({ projectId, text: value, history, meta: nextMeta, reason });
  }

  async function restoreVersion(version: AiResultVersion<string>) {
    const projectId = activeProjectRef.current;
    const beforeRestore = utpText.trim()
      ? buildVersion(utpText, 'До восстановления версии', 'restore')
      : undefined;
    try {
      await persistUtp(projectId, version.value, beforeRestore, null, 'restore');
      toast.success('Версия УТП восстановлена');
    } catch {
      toast.error('Не удалось сохранить восстановленную версию');
    }
  }

  function requireUtpResult(response: WorkflowResponse<UtpAiResult>): UtpAiResult {
    const result = response.structured;
    if (!result || typeof result.usp !== 'string' || !Array.isArray(result.usedEvidence) || !Array.isArray(result.missingData)) {
      throw new Error('Сервер вернул некорректный формат УТП');
    }
    return result;
  }

  function resultMeta(result: UtpAiResult): UtpMeta {
    return {
      version: 1,
      usedEvidence: result.usedEvidence,
      missingData: result.missingData,
      updatedAt: new Date().toISOString(),
    };
  }

  function chargeMessage(prefix: string, charged?: number): string {
    return typeof charged === 'number' ? `${prefix}. Списано ${charged} AI-баллов.` : prefix;
  }

  function createAiAction(mode: UtpAiActionSnapshot['mode']): UtpAiActionSnapshot | null {
    const projectId = activeProjectRef.current;
    if (!projectId || projectId === 'default') return null;
    const currentText = draftTextRef.current;
    const workflow = mode === 'generate' ? 'strategy.utp.generate' : 'strategy.utp.improve';
    const instruction = inputText.trim();
    const inputs = mode === 'generate'
      ? { inputText: instruction }
      : { currentUtp: currentText, inputText: instruction };
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    return {
      id,
      projectId,
      mode,
      workflow,
      currentText,
      instruction,
      inputs,
      idempotencyKey: makeAiIdempotencyKey({ projectId, workflow, inputs, scope: id }),
    };
  }

  async function runAiAction(action: UtpAiActionSnapshot) {
    if (loading || voiceBusy || workspaceUnavailable || proposal) return;
    if (action.projectId !== activeProjectRef.current || action.currentText !== draftTextRef.current) {
      setAiError('Текст или активный проект изменились. Запустите AI-действие заново.');
      retryAiActionRef.current = null;
      return;
    }

    activeAiActionRef.current = action.id;
    retryAiActionRef.current = action;
    setLoading(true);
    setAiError('');
    try {
      try {
        await autosave.flush(action.projectId);
      } catch {
        setAiError('Сначала не удалось сохранить текущий текст. AI-запрос не запускался и баллы не списаны.');
        return;
      }
      if (action.id !== activeAiActionRef.current
        || action.projectId !== activeProjectRef.current
        || action.currentText !== draftTextRef.current) return;

      const response = await aiApi.startWorkflow<UtpAiResult>(action.workflow, {
        projectId: action.projectId,
        provider: 'chatgpt',
        inputs: action.inputs,
        idempotencyKey: action.idempotencyKey,
      });
      if (action.id !== activeAiActionRef.current
        || action.projectId !== activeProjectRef.current
        || action.currentText !== draftTextRef.current) return;

      const result = requireUtpResult(response);
      const proposedText = result.usp.trim();
      retryAiActionRef.current = null;

      if (!action.currentText.trim()) {
        try {
          await persistUtp(
            action.projectId,
            proposedText,
            buildVersion(proposedText, 'Первая AI-формулировка УТП', 'ai', response),
            resultMeta(result),
          );
          setInputText('');
          toast.success(chargeMessage('УТП готово', response.aiPointsCharged));
        } catch {
          setAiError('AI сформировал УТП, но сохранить его не удалось. Используйте «Повторить» у статуса сохранения.');
          toast.error('УТП сформировано, но ещё не сохранено');
        }
        return;
      }

      setProposal({
        projectId: action.projectId,
        mode: action.mode,
        currentText: action.currentText,
        proposedText,
        instruction: action.instruction,
        result,
        response,
      });
      toast.success(chargeMessage('AI-вариант готов', response.aiPointsCharged));
    } catch (error) {
      if (action.id !== activeAiActionRef.current || action.projectId !== activeProjectRef.current) return;
      const message = aiErrorMessage(error);
      setAiError(message);
      toast.error(message);
    } finally {
      if (action.id === activeAiActionRef.current) {
        activeAiActionRef.current = '';
        setLoading(false);
      }
    }
  }

  async function handleGenerate() {
    if (loading || voiceBusy || workspaceUnavailable) return;
    const action = createAiAction('generate');
    if (!action) {
      toast.error('Сначала выберите проект');
      return;
    }
    await runAiAction(action);
  }

  async function handleImprove() {
    if (!utpText.trim() || loading || voiceBusy || workspaceUnavailable) return;
    const action = createAiAction('improve');
    if (!action) {
      toast.error('Сначала выберите проект');
      return;
    }
    await runAiAction(action);
  }

  async function handleRetryAi() {
    const action = retryAiActionRef.current;
    if (!action) return;
    await runAiAction(action);
  }

  async function handleApplyProposal() {
    const current = proposal;
    if (!current || applyingProposal) return;
    if (current.projectId !== activeProjectRef.current || current.currentText !== draftTextRef.current) {
      setAiError('Текущее УТП изменилось после генерации. Оставьте этот вариант и запросите новый.');
      return;
    }
    setApplyingProposal(true);
    setAiError('');
    const previous = buildVersion(
      current.currentText,
      current.mode === 'improve' ? 'До AI-доработки' : 'До нового AI-варианта',
      'ai',
      current.response,
    );
    try {
      await persistUtp(current.projectId, current.proposedText, previous, resultMeta(current.result));
      setProposal(null);
      setInputText('');
      toast.success('AI-вариант применён. Дополнительные баллы не списывались.');
    } catch {
      setProposal(null);
      setAiError('Вариант применён локально, но ещё не сохранён. Используйте «Повторить» у статуса сохранения.');
      toast.error('Не удалось сохранить применённый вариант');
    } finally {
      setApplyingProposal(false);
    }
  }

  function handleDismissProposal() {
    if (applyingProposal) return;
    setProposal(null);
    setInputText('');
    setAiError('');
    toast.success('Текущая версия оставлена без изменений');
  }

  function handleClarifyProposal() {
    if (!proposal || applyingProposal) return;
    setInputText(proposal.instruction);
    setProposal(null);
    setAiError('');
  }

  async function handleCopy() {
    if (!utpText.trim()) return;
    try {
      await navigator.clipboard.writeText(utpText);
      toast.success('УТП скопировано');
    } catch {
      toast.error('Не удалось скопировать УТП');
    }
  }

  async function handleRetrySave() {
    if (workspaceError) {
      setWorkspaceReloadKey((value) => value + 1);
      return;
    }
    try {
      await autosave.retry(activeProjectRef.current);
    } catch {
      // The coordinator keeps the snapshot and visible error for another retry.
    }
  }

  return (
    <div className={s.page}>
      <header className={s.pageHeader}>
        <span className={s.eyebrow}>Стратегия</span>
        <h1>Создание УТП</h1>
        <p>
          Сформулируйте, кому вы помогаете, какой результат создаёте и почему клиенту стоит выбрать именно ваш подход.
        </p>
      </header>

      <div className={s.workspace}>
        <UtpFoundationPanel
          foundation={foundation}
          loading={foundationLoading}
          error={foundationError}
          onRetry={() => setFoundationReloadKey((value) => value + 1)}
        />
        <UtpEditorPanel
          key={activeProjectId}
          activeProjectId={activeProjectId}
          utpText={utpText}
          instruction={inputText}
          loading={loading}
          voiceBusy={voiceBusy}
          workspaceLoading={workspaceLoading}
          editorDisabled={workspaceUnavailable}
          saveStatus={saveStatus}
          saveError={workspaceError || saveError}
          aiError={aiError}
          proposal={proposal}
          applyingProposal={applyingProposal}
          history={savedData.utpHistory ?? []}
          missingData={missingData}
          onUtpChange={handleManualChange}
          onEditorBlur={() => void handleEditorBlur()}
          onInstructionChange={setInputText}
          onVoiceBusyChange={setVoiceBusy}
          onGenerate={() => void handleGenerate()}
          onImprove={() => void handleImprove()}
          onCopy={() => void handleCopy()}
          onRetrySave={() => void handleRetrySave()}
          onRetryAi={() => void handleRetryAi()}
          onApplyProposal={() => void handleApplyProposal()}
          onDismissProposal={handleDismissProposal}
          onClarifyProposal={handleClarifyProposal}
          onRestoreVersion={(version) => void restoreVersion(version)}
        />
      </div>
    </div>
  );
}
