import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  Copy,
  FilePlus2,
  History,
  Loader2,
  MessageSquareText,
  Pause,
  Play,
  Plus,
  Save,
  Send,
  Trash2,
  Waypoints,
  Sparkles,
  X,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { aiApi, AiActionQuote } from '../../api/ai';
import {
  TelegramScenario,
  TelegramScenarioButton,
  TelegramScenarioDefinition,
  TelegramScenarioEdge,
  TelegramScenarioNode,
  TelegramScenarioSummary,
  TelegramScenarioTestRecipient,
  TelegramScenarioVersion,
  telegramScenarioApiError,
  telegramScenariosApi,
} from '../../api/telegram-scenarios.api';
import { TelegramBot, telegramBotApiError, telegramBotsApi } from '../../api/telegram-bots.api';
import { useProjectsStore } from '../../store/projects.store';
import { appPath } from '../../utils/appRoutes';
import s from './TelegramScenarioBuilder.module.css';
import {
  ChatbotBuilderResult,
  ChatbotBuilderStep,
  parseChatbotBuilderResult,
  scenarioDiff,
} from './chatbotBuilderAi';

const STATUS_LABEL: Record<TelegramScenarioSummary['status'], string> = {
  DRAFT: 'Черновик',
  PUBLISHED: 'Опубликован',
  PAUSED: 'Приостановлен',
  ARCHIVED: 'Архив',
};

const EDITABLE_NODE_TYPES = new Set(['send_message', 'wait', 'end']);

const BUILDER_ACTIONS: Array<{ value: ChatbotBuilderStep; label: string }> = [
  { value: 'generate', label: 'Собрать сценарий' },
  { value: 'edit', label: 'Доработать черновик' },
  { value: 'discover', label: 'Предложить сценарий' },
  { value: 'validate', label: 'Проверить смысл и логику' },
  { value: 'copy', label: 'Создать адаптированную копию' },
  { value: 'explain', label: 'Объяснить сценарий' },
];

interface BuilderMessage {
  role: 'user' | 'assistant';
  text: string;
  createdAt: string;
}

function cloneDefinition(definition: TelegramScenarioDefinition): TelegramScenarioDefinition {
  return JSON.parse(JSON.stringify(definition)) as TelegramScenarioDefinition;
}

function nodeTitle(node: TelegramScenarioNode): string {
  if (node.label) return node.label;
  if (node.type === 'send_message') return 'Сообщение';
  if (node.type === 'wait') return 'Задержка';
  if (node.type === 'end') return 'Завершение';
  return node.type.replace(/_/g, ' ');
}

function durationSeconds(node: TelegramScenarioNode): number {
  return node.schedule?.type === 'duration' ? node.schedule.seconds : 0;
}

function nodeSummary(node: TelegramScenarioNode): string {
  if (node.type === 'send_message') return String(node.text ?? 'Текст не задан').slice(0, 84);
  if (node.type === 'wait') {
    const seconds = durationSeconds(node);
    return seconds ? `Пауза ${seconds} сек.` : 'Время ожидания не задано';
  }
  if (node.type === 'end') return 'Конец сценария';
  return 'Расширенный тип узла';
}

function makeNodeId(prefix: string, nodes: TelegramScenarioNode[]): string {
  const base = prefix.replace(/[^a-z0-9_-]/gi, '').toLowerCase() || 'node';
  let index = 1;
  while (nodes.some((node) => node.id === `${base}_${index}`)) index += 1;
  return `${base}_${index}`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Moscow' })
    .format(new Date(value));
}

function outgoingEdge(definition: TelegramScenarioDefinition, nodeId: string): TelegramScenarioEdge | undefined {
  return definition.edges.find((edge) => edge.fromNodeId === nodeId && !edge.condition);
}

function replaceNode(definition: TelegramScenarioDefinition, id: string, value: TelegramScenarioNode): TelegramScenarioDefinition {
  return { ...definition, nodes: definition.nodes.map((node) => node.id === id ? value : node) };
}

function statusClass(status: TelegramScenarioSummary['status']): string {
  if (status === 'PUBLISHED') return s.statusPublished;
  if (status === 'PAUSED') return s.statusPaused;
  return s.statusDraft;
}

export default function TelegramScenarioBuilder() {
  const projects = useProjectsStore((state) => state.projects);
  const activeProjectId = useProjectsStore((state) => state.activeProjectId);
  const [bots, setBots] = useState<TelegramBot[]>([]);
  const [botId, setBotId] = useState('');
  const [scenarios, setScenarios] = useState<TelegramScenarioSummary[]>([]);
  const [selected, setSelected] = useState<TelegramScenario | null>(null);
  const [draft, setDraft] = useState<TelegramScenarioDefinition | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<'saved' | 'unsaved' | 'error'>('saved');
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [newScenarioName, setNewScenarioName] = useState('');
  const [testRecipient, setTestRecipient] = useState<TelegramScenarioTestRecipient | null>(null);
  const [verificationLink, setVerificationLink] = useState('');
  const [builderStep, setBuilderStep] = useState<ChatbotBuilderStep>('generate');
  const [builderInstruction, setBuilderInstruction] = useState('');
  const [builderResult, setBuilderResult] = useState<ChatbotBuilderResult | null>(null);
  const [builderQuote, setBuilderQuote] = useState<AiActionQuote | null>(null);
  const [builderMessages, setBuilderMessages] = useState<BuilderMessage[]>([]);
  const saveTimer = useRef<number | null>(null);

  const selectedBot = useMemo(() => bots.find((bot) => bot.id === botId) ?? null, [botId, bots]);
  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId && project.status !== 'ARCHIVED') ?? null,
    [activeProjectId, projects],
  );
  const selectedNode = useMemo(
    () => draft?.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [draft, selectedNodeId],
  );
  const draftVersion = selected?.draftVersion ?? null;
  const canEdit = Boolean(draftVersion && !draftVersion.publishedAt);
  const builderDiff = useMemo(
    () => draft && builderResult?.kind === 'proposal'
      ? scenarioDiff(draft, builderResult.proposedDefinition)
      : null,
    [builderResult, draft],
  );

  const loadBots = useCallback(async () => {
    try {
      const result = await telegramBotsApi.list();
      const usable = result.filter((bot) => bot.status !== 'ARCHIVED');
      setBots(usable);
      setBotId((current) => usable.some((bot) => bot.id === current) ? current : usable[0]?.id ?? '');
    } catch (requestError) {
      setError(telegramBotApiError(requestError, 'Не удалось загрузить ботов').message);
    }
  }, []);

  const loadScenarios = useCallback(async () => {
    if (!botId || !activeProjectId) {
      setScenarios([]);
      setSelected(null);
      setDraft(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const result = await telegramScenariosApi.list(botId, activeProjectId);
      setScenarios(result);
      setError('');
      if (!result.some((scenario) => scenario.id === selected?.id)) {
        setSelected(null);
        setDraft(null);
        setSelectedNodeId(null);
      }
    } catch (requestError) {
      setError(telegramScenarioApiError(requestError, 'Не удалось загрузить сценарии').message);
    } finally {
      setLoading(false);
    }
  }, [activeProjectId, botId, selected?.id]);

  const loadTestRecipient = useCallback(async () => {
    if (!botId) return;
    try {
      setTestRecipient(await telegramScenariosApi.testRecipient(botId));
    } catch {
      setTestRecipient(null);
    }
  }, [botId]);

  const openScenario = useCallback(async (scenarioId: string) => {
    if (!botId) return;
    setDetailLoading(true);
    setError('');
    try {
      const scenario = await telegramScenariosApi.get(botId, scenarioId);
      const version = scenario.draftVersion ?? scenario.publishedVersion;
      setSelected(scenario);
      setDraft(version ? cloneDefinition(version.definition) : null);
      setSelectedNodeId(version?.definition.nodes[0]?.id ?? null);
      setSaveState('saved');
    } catch (requestError) {
      setError(telegramScenarioApiError(requestError, 'Не удалось открыть сценарий').message);
    } finally {
      setDetailLoading(false);
    }
  }, [botId]);

  useEffect(() => {
    document.title = 'Конструктор чатботов — Luma IQ';
    void loadBots().finally(() => setLoading(false));
  }, [loadBots]);

  useEffect(() => {
    void loadScenarios();
    void loadTestRecipient();
  }, [loadScenarios, loadTestRecipient]);

  useEffect(() => () => {
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
  }, []);

  useEffect(() => {
    setBuilderResult(null);
    setBuilderInstruction('');
    if (!selected?.id) {
      setBuilderMessages([]);
      return;
    }
    try {
      const stored = localStorage.getItem(`lumaiq:chatbot-builder:${selected.id}`);
      const parsed = stored ? JSON.parse(stored) as unknown : [];
      setBuilderMessages(Array.isArray(parsed) ? parsed as BuilderMessage[] : []);
    } catch {
      setBuilderMessages([]);
    }
  }, [selected?.id]);

  useEffect(() => {
    if (!activeProjectId || !selected?.id) {
      setBuilderQuote(null);
      return;
    }
    let active = true;
    void aiApi.quoteWorkflow(`chatbot.builder.${builderStep}`, {
      projectId: activeProjectId,
      inputs: { operation: builderStep },
    }).then((quote) => {
      if (active) setBuilderQuote(quote);
    }).catch(() => {
      if (active) setBuilderQuote(null);
    });
    return () => { active = false; };
  }, [activeProjectId, builderStep, selected?.id]);

  const saveDraft = useCallback(async (definition: TelegramScenarioDefinition) => {
    if (!botId || !selected || !draftVersion || draftVersion.publishedAt || saving) return false;
    setSaving(true);
    try {
      const updated = await telegramScenariosApi.updateDraft(botId, selected.id, {
        expectedDraftVersionId: draftVersion.id,
        expectedUpdatedAt: draftVersion.updatedAt,
        definition,
      });
      const version = updated.draftVersion;
      setSelected(updated);
      setScenarios((current) => current.map((item) => item.id === updated.id ? {
        ...item,
        name: updated.name,
        description: updated.description,
        status: updated.status,
        draftVersionId: updated.draftVersionId,
        publishedVersionId: updated.publishedVersionId,
        updatedAt: updated.updatedAt,
      } : item));
      if (version) setDraft(cloneDefinition(version.definition));
      setSaveState('saved');
      return true;
    } catch (requestError) {
      setSaveState('error');
      const apiError = telegramScenarioApiError(requestError, 'Не удалось сохранить черновик');
      setError(apiError.message);
      if (apiError.code?.includes('CONFLICT')) toast.error('Черновик изменился в другой вкладке. Обновите сценарий.');
      return false;
    } finally {
      setSaving(false);
    }
  }, [botId, draftVersion, saving, selected]);

  function rememberBuilderMessages(messages: BuilderMessage[]) {
    const trimmed = messages.slice(-20);
    setBuilderMessages(trimmed);
    if (selected?.id) localStorage.setItem(`lumaiq:chatbot-builder:${selected.id}`, JSON.stringify(trimmed));
  }

  async function runBuilder() {
    if (!activeProjectId || !selected || !draft || !builderInstruction.trim()) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    setActionBusy('ai-builder');
    setError('');
    try {
      const response = await aiApi.startWorkflow(`chatbot.builder.${builderStep}`, {
        projectId: activeProjectId,
        idempotencyKey: `chatbot-builder:${selected.id}:${builderStep}:${Date.now()}`,
        inputs: {
          operation: builderStep,
          scenarioId: selected.id,
          instruction: builderInstruction.trim(),
          currentDefinition: draft,
        },
      });
      const result = parseChatbotBuilderResult(response);
      setBuilderResult(result);
      rememberBuilderMessages([
        ...builderMessages,
        { role: 'user', text: builderInstruction.trim(), createdAt: new Date().toISOString() },
        { role: 'assistant', text: result.summary, createdAt: new Date().toISOString() },
      ]);
      toast.success(result.kind === 'proposal' ? 'Предложение готово — проверьте изменения' : 'Проверка завершена');
    } catch (requestError) {
      setError(telegramScenarioApiError(requestError, 'AI Builder не завершил задачу. Черновик не изменён.').message);
    } finally {
      setActionBusy(null);
    }
  }

  async function applyBuilderProposal() {
    if (!selected || !builderResult || builderResult.kind !== 'proposal' || !canEdit) return;
    setActionBusy('ai-apply');
    try {
      const proposed = cloneDefinition(builderResult.proposedDefinition);
      const saved = await saveDraft(proposed);
      if (saved) {
        if (proposed.name !== selected.name) {
          await telegramScenariosApi.updateMetadata(botId, selected.id, {
            name: proposed.name,
            description: proposed.description || null,
          });
        }
        setDraft(proposed);
        setSelectedNodeId(proposed.nodes[0]?.id ?? null);
        setBuilderResult(null);
        setBuilderInstruction('');
        await openScenario(selected.id);
        await loadScenarios();
        toast.success('Предложение применено к черновику');
      }
    } catch (requestError) {
      setError(telegramScenarioApiError(requestError, 'Не удалось применить предложение. Черновик сохранён без изменений.').message);
    } finally {
      setActionBusy(null);
    }
  }

  function updateDraft(next: TelegramScenarioDefinition) {
    setDraft(next);
    setSaveState('unsaved');
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    if (canEdit) {
      saveTimer.current = window.setTimeout(() => void saveDraft(next), 900);
    }
  }

  async function createScenario() {
    if (!botId || !activeProjectId || !newScenarioName.trim()) return;
    setActionBusy('create');
    try {
      const scenario = await telegramScenariosApi.create(botId, { projectId: activeProjectId, name: newScenarioName.trim() });
      setNewScenarioName('');
      await loadScenarios();
      await openScenario(scenario.id);
      toast.success('Черновик сценария создан');
    } catch (requestError) {
      setError(telegramScenarioApiError(requestError, 'Не удалось создать сценарий').message);
    } finally {
      setActionBusy(null);
    }
  }

  async function saveMetadata() {
    if (!botId || !selected || !draft || !canEdit) return;
    setActionBusy('metadata');
    try {
      const updated = await telegramScenariosApi.updateMetadata(botId, selected.id, {
        name: draft.name,
        description: draft.description || null,
      });
      setSelected((current) => current ? { ...current, ...updated } : current);
      setScenarios((current) => current.map((item) => item.id === updated.id ? { ...item, ...updated } : item));
    } catch (requestError) {
      setError(telegramScenarioApiError(requestError, 'Не удалось сохранить название').message);
    } finally {
      setActionBusy(null);
    }
  }

  async function newDraftVersion() {
    if (!botId || !selected) return;
    setActionBusy('version');
    try {
      await telegramScenariosApi.createDraftVersion(botId, selected.id);
      await openScenario(selected.id);
      await loadScenarios();
      toast.success('Создан новый черновик версии');
    } catch (requestError) {
      setError(telegramScenarioApiError(requestError, 'Не удалось создать новую версию').message);
    } finally {
      setActionBusy(null);
    }
  }

  async function publish() {
    if (!botId || !selected || !draftVersion) return;
    if (!window.confirm('Опубликовать текущую версию? Она станет активной для новых запусков сценария.')) return;
    setActionBusy('publish');
    try {
      const updated = await telegramScenariosApi.publish(botId, selected.id, draftVersion.id);
      setSelected(updated);
      await loadScenarios();
      toast.success('Сценарий опубликован');
    } catch (requestError) {
      setError(telegramScenarioApiError(requestError, 'Не удалось опубликовать сценарий').message);
    } finally {
      setActionBusy(null);
    }
  }

  async function pause() {
    if (!botId || !selected) return;
    if (!window.confirm('Приостановить опубликованный сценарий?')) return;
    setActionBusy('pause');
    try {
      const updated = await telegramScenariosApi.pause(botId, selected.id);
      setSelected(updated);
      await loadScenarios();
      toast.success('Сценарий приостановлен');
    } catch (requestError) {
      setError(telegramScenarioApiError(requestError, 'Не удалось приостановить сценарий').message);
    } finally {
      setActionBusy(null);
    }
  }

  async function rollback(version: TelegramScenarioVersion) {
    if (!botId || !selected || !window.confirm(`Вернуть опубликованную версию ${version.version}?`)) return;
    setActionBusy(`rollback-${version.id}`);
    try {
      const updated = await telegramScenariosApi.rollback(botId, selected.id, version.id);
      setSelected(updated);
      await loadScenarios();
      toast.success(`Версия ${version.version} снова активна`);
    } catch (requestError) {
      setError(telegramScenarioApiError(requestError, 'Не удалось откатить сценарий').message);
    } finally {
      setActionBusy(null);
    }
  }

  async function archive() {
    if (!botId || !selected || !window.confirm('Архивировать сценарий? Активных запусков у него быть не должно.')) return;
    setActionBusy('archive');
    try {
      await telegramScenariosApi.archive(botId, selected.id);
      setSelected(null);
      setDraft(null);
      await loadScenarios();
      toast.success('Сценарий перенесён в архив');
    } catch (requestError) {
      setError(telegramScenarioApiError(requestError, 'Не удалось архивировать сценарий').message);
    } finally {
      setActionBusy(null);
    }
  }

  async function generateTestLink() {
    if (!botId) return;
    setActionBusy('test-link');
    try {
      const verification = await telegramScenariosApi.createTestVerification(botId);
      setVerificationLink(verification.deepLink);
      await navigator.clipboard?.writeText(verification.deepLink);
      toast.success('Ссылка подтверждения скопирована');
    } catch (requestError) {
      setError(telegramScenarioApiError(requestError, 'Не удалось создать тестовую ссылку').message);
    } finally {
      setActionBusy(null);
    }
  }

  async function runTest() {
    if (!botId || !selected || !draftVersion || !testRecipient?.verified) return;
    setActionBusy('test-run');
    try {
      await telegramScenariosApi.testRun(botId, selected.id, draftVersion.id);
      toast.success('Тестовый запуск поставлен в очередь');
    } catch (requestError) {
      setError(telegramScenarioApiError(requestError, 'Не удалось запустить тест').message);
    } finally {
      setActionBusy(null);
    }
  }

  function updateSelectedNode(nextNode: TelegramScenarioNode) {
    if (!draft || !selectedNode || !canEdit) return;
    updateDraft(replaceNode(draft, selectedNode.id, nextNode));
  }

  function addNode(type: 'send_message' | 'wait' | 'end') {
    if (!draft || !canEdit) return;
    if (type === 'end' && draft.nodes.some((existing) => existing.type === 'end')) return;
    const id = makeNodeId(type === 'send_message' ? 'message' : type, draft.nodes);
    const node: TelegramScenarioNode = type === 'send_message'
      ? { id, type, label: 'Новое сообщение', text: 'Введите текст сообщения', parseMode: 'plain', disableWebPreview: false, buttons: [] }
      : type === 'wait'
        ? { id, type, label: 'Пауза', schedule: { type: 'duration', seconds: 3600 } }
        : { id, type, label: 'Завершение' };
    const terminal = draft.nodes.find((existing) => existing.type === 'end');
    const incomingTerminalEdges = terminal
      ? draft.edges.filter((edge) => edge.toNodeId === terminal.id && !edge.condition)
      : [];
    const nodes = terminal
      ? [...draft.nodes.filter((existing) => existing.id !== terminal.id), node, terminal]
      : [...draft.nodes, node];
    const edgesWithoutTerminalEntries = terminal
      ? draft.edges.filter((edge) => !incomingTerminalEdges.some((incoming) => incoming.id === edge.id))
      : draft.edges;
    const redirectedEdges = incomingTerminalEdges.map((edge) => ({ ...edge, toNodeId: id }));
    const terminalEdge = terminal ? [{ id: `${id}_to_${terminal.id}`, fromNodeId: id, toNodeId: terminal.id }] : [];
    const next = { ...draft, nodes, edges: [...edgesWithoutTerminalEntries, ...redirectedEdges, ...terminalEdge] };
    updateDraft(next);
    setSelectedNodeId(id);
  }

  function deleteSelectedNode() {
    if (!draft || !selectedNode || !canEdit || draft.nodes.length <= 1 || selectedNode.type === 'end') return;
    const nodeId = selectedNode.id;
    const incoming = draft.edges.filter((edge) => edge.toNodeId === nodeId);
    const outgoing = draft.edges.filter((edge) => edge.fromNodeId === nodeId);
    const remainingEdges = draft.edges.filter((edge) => edge.toNodeId !== nodeId && edge.fromNodeId !== nodeId);
    const bridge = incoming.length === 1 && outgoing.length === 1
      ? [{ id: `${incoming[0].fromNodeId}_to_${outgoing[0].toNodeId}`, fromNodeId: incoming[0].fromNodeId, toNodeId: outgoing[0].toNodeId }]
      : [];
    const fallbackTarget = draft.nodes.find((node) => node.id !== nodeId)?.id ?? '';
    updateDraft({
      ...draft,
      nodes: draft.nodes.filter((node) => node.id !== nodeId),
      edges: [...remainingEdges, ...bridge],
      entrypoints: draft.entrypoints.map((entrypoint) => entrypoint.targetNodeId === nodeId
        ? { ...entrypoint, targetNodeId: fallbackTarget }
        : entrypoint),
    });
    setSelectedNodeId(fallbackTarget || null);
  }

  function setNextTarget(targetNodeId: string) {
    if (!draft || !selectedNode || !canEdit) return;
    const existing = outgoingEdge(draft, selectedNode.id);
    const edges = existing
      ? draft.edges.map((edge) => edge.id === existing.id ? { ...edge, toNodeId: targetNodeId } : edge)
      : [...draft.edges, { id: `${selectedNode.id}_to_${targetNodeId}`, fromNodeId: selectedNode.id, toNodeId: targetNodeId }];
    updateDraft({ ...draft, edges });
  }

  function addButton() {
    if (!selectedNode || selectedNode.type !== 'send_message') return;
    const buttons = Array.isArray(selectedNode.buttons) ? selectedNode.buttons : [];
    updateSelectedNode({ ...selectedNode, buttons: [...buttons, { type: 'url', label: 'Открыть ссылку', url: 'https://' }] });
  }

  function updateButton(index: number, patch: Partial<TelegramScenarioButton>) {
    if (!selectedNode || selectedNode.type !== 'send_message') return;
    const buttons = (selectedNode.buttons ?? []).map((button, buttonIndex) => buttonIndex === index ? { ...button, ...patch } : button);
    updateSelectedNode({ ...selectedNode, buttons });
  }

  function removeButton(index: number) {
    if (!selectedNode || selectedNode.type !== 'send_message') return;
    updateSelectedNode({ ...selectedNode, buttons: (selectedNode.buttons ?? []).filter((_, buttonIndex) => buttonIndex !== index) });
  }

  return (
    <main className={s.root}>
      <header className={s.pageHeader}>
        <div>
          <p className={s.eyebrow}>Telegram · рабочее пространство</p>
          <h1>Конструктор чатботов</h1>
          <p>Соберите сценарий вручную, проверьте его на тестовом получателе и публикуйте только готовую версию.</p>
        </div>
        <Link className={s.backLink} to={appPath('/chatbots')}><ArrowLeft size={16} />Мои боты</Link>
      </header>

      {error ? <div className={s.errorBanner} role="alert"><CircleAlert size={17} /><span>{error}</span><button type="button" onClick={() => setError('')}>Закрыть</button></div> : null}

      {!activeProject ? (
        <section className={s.emptyState}><Waypoints size={28} /><h2>Выберите активный проект</h2><p>Сценарии всегда принадлежат конкретному проекту, чтобы контекст и доступы не смешивались.</p></section>
      ) : (
        <>
          <section className={s.controls} aria-label="Контекст конструктора">
            <label><span>Проект</span><strong>{activeProject.name}</strong></label>
            <label><span>Telegram-бот</span>
              <select value={botId} onChange={(event) => setBotId(event.target.value)} disabled={bots.length === 0}>
                {bots.length === 0 ? <option value="">Нет подключённых ботов</option> : null}
                {bots.map((bot) => <option key={bot.id} value={bot.id}>@{bot.username} · {bot.displayName}</option>)}
              </select>
            </label>
            {selectedBot ? <span className={s.botState}>{selectedBot.status === 'ACTIVE' ? 'Webhook подключён' : 'Webhook не подключён'}</span> : null}
          </section>

          {!botId ? (
            <section className={s.emptyState}><MessageSquareText size={28} /><h2>Сначала подключите Telegram-бота</h2><p>После подключения можно создавать сценарии для активного проекта.</p><Link className={s.primaryButton} to={appPath('/chatbots')}>Открыть «Мои боты»</Link></section>
          ) : (
            <div className={s.workspace}>
              <aside className={s.listPanel} aria-label="Сценарии проекта">
                <div className={s.listHeader}><div><h2>Сценарии</h2><span>{scenarios.length} в проекте</span></div></div>
                <div className={s.createScenario}>
                  <input value={newScenarioName} maxLength={120} onChange={(event) => setNewScenarioName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void createScenario(); }} placeholder="Например, стартовая воронка" aria-label="Название нового сценария" />
                  <button type="button" className={s.iconButton} onClick={() => void createScenario()} disabled={!newScenarioName.trim() || actionBusy === 'create'} aria-label="Создать сценарий"><Plus size={18} /></button>
                </div>
                {loading ? <div className={s.panelState}><Loader2 className={s.spinning} size={19} />Загружаю…</div> : scenarios.length === 0 ? <div className={s.panelState}>Пока нет сценариев. Создайте первый черновик.</div> : (
                  <div className={s.scenarioList}>{scenarios.map((scenario) => <button key={scenario.id} type="button" onClick={() => void openScenario(scenario.id)} className={`${s.scenarioItem}${selected?.id === scenario.id ? ` ${s.scenarioItemActive}` : ''}`}><span className={`${s.statusBadge} ${statusClass(scenario.status)}`}>{STATUS_LABEL[scenario.status]}</span><strong>{scenario.name}</strong><small>Изменён {formatDate(scenario.updatedAt)}</small><ChevronRight size={16} /></button>)}</div>
                )}
              </aside>

              <section className={s.editorPanel} aria-live="polite">
                {detailLoading ? <div className={s.panelState}><Loader2 className={s.spinning} size={20} />Открываю сценарий…</div> : !selected || !draft ? (
                  <div className={s.emptyEditor}><MessageSquareText size={30} /><h2>Выберите сценарий</h2><p>Справа появится структура черновика, проверка и история версий.</p></div>
                ) : (
                  <>
                    <div className={s.editorHeader}>
                      <div><span className={`${s.statusBadge} ${statusClass(selected.status)}`}>{STATUS_LABEL[selected.status]}</span><h2>{selected.name}</h2><p>{canEdit ? (saveState === 'saved' ? 'Сохранено автоматически' : saveState === 'error' ? 'Не удалось сохранить' : 'Есть несохранённые изменения') : 'Опубликованная версия защищена от изменений'}</p></div>
                      <div className={s.editorActions}>
                        {canEdit ? <button type="button" className={s.secondaryButton} onClick={() => void saveDraft(draft)} disabled={saving}><Save size={15} />{saving ? 'Сохраняю…' : 'Сохранить'}</button> : <button type="button" className={s.secondaryButton} onClick={() => void newDraftVersion()} disabled={actionBusy === 'version'}><FilePlus2 size={15} />Новая версия</button>}
                        {canEdit ? <button type="button" className={s.primaryButton} onClick={() => void publish()} disabled={actionBusy === 'publish' || saving}><Play size={15} />Опубликовать</button> : null}
                        {selected.status === 'PUBLISHED' ? <button type="button" className={s.secondaryButton} onClick={() => void pause()} disabled={actionBusy === 'pause'}><Pause size={15} />Пауза</button> : null}
                      </div>
                    </div>

                    <div className={s.scenarioMeta}>
                      <label><span>Название сценария</span><input value={draft.name} maxLength={120} disabled={!canEdit} onChange={(event) => updateDraft({ ...draft, name: event.target.value })} onBlur={() => void saveMetadata()} /></label>
                      <label><span>Короткое описание</span><input value={draft.description ?? ''} maxLength={1000} disabled={!canEdit} onChange={(event) => updateDraft({ ...draft, description: event.target.value })} onBlur={() => void saveMetadata()} placeholder="Для какой задачи этот сценарий" /></label>
                    </div>

                    <section className={s.entrypoints}><div><h3>Точка входа</h3><p>Пользователь попадёт в первый узел после команды /start.</p></div>
                      <select value={draft.entrypoints[0]?.targetNodeId ?? ''} disabled={!canEdit} onChange={(event) => updateDraft({ ...draft, entrypoints: draft.entrypoints.map((entrypoint, index) => index === 0 ? { ...entrypoint, targetNodeId: event.target.value } : entrypoint) })}>
                        {draft.nodes.map((node) => <option key={node.id} value={node.id}>{nodeTitle(node)}</option>)}
                      </select>
                    </section>

                    <section className={s.aiBuilder} aria-labelledby="chatbot-ai-builder-title">
                      <div className={s.aiBuilderHeader}>
                        <div><span><Sparkles size={15} />AI Builder</span><h3 id="chatbot-ai-builder-title">Соберите или доработайте сценарий с AI</h3><p>AI видит контекст проекта, но меняет черновик только после вашего подтверждения.</p></div>
                        {builderResult ? <button type="button" className={s.closeProposal} onClick={() => setBuilderResult(null)} aria-label="Закрыть предложение"><X size={17} /></button> : null}
                      </div>
                      <div className={s.aiBuilderControls}>
                        <select value={builderStep} onChange={(event) => { setBuilderStep(event.target.value as ChatbotBuilderStep); setBuilderResult(null); }} aria-label="Действие AI Builder">
                          {BUILDER_ACTIONS.map((action) => <option key={action.value} value={action.value}>{action.label}</option>)}
                        </select>
                        <textarea value={builderInstruction} maxLength={4000} onChange={(event) => setBuilderInstruction(event.target.value)} placeholder="Например: собери стартовую цепочку для нового подписчика и мягко подведи к консультации" />
                        <button type="button" className={s.primaryButton} onClick={() => void runBuilder()} disabled={!builderInstruction.trim() || actionBusy === 'ai-builder'}>
                          {actionBusy === 'ai-builder' ? <Loader2 className={s.spinning} size={16} /> : <Sparkles size={16} />}
                          {actionBusy === 'ai-builder' ? 'AI работает…' : 'Запустить AI Builder'}
                        </button>
                        {builderQuote ? <small>{builderQuote.aiPoints} AI-баллов · после действия останется {builderQuote.aiBalanceAfter}</small> : null}
                      </div>
                      {builderMessages.length > 0 && !builderResult ? <div className={s.builderHistory}><strong>Последние сообщения</strong>{builderMessages.slice(-4).map((message, index) => <p key={`${message.createdAt}-${index}`}><span>{message.role === 'user' ? 'Вы' : 'AI'}</span>{message.text}</p>)}</div> : null}
                      {builderResult?.kind === 'analysis' ? <div className={s.aiResult} role="status"><h4>{builderResult.summary}</h4>{builderResult.suggestions.length > 0 ? <ul>{builderResult.suggestions.map((item) => <li key={`${item.priority}-${item.title}`}><strong>{item.title}</strong><span>{item.description}</span></li>)}</ul> : <p>Критичных замечаний нет.</p>}{builderResult.warnings.map((warning) => <p className={s.aiWarning} key={warning}>{warning}</p>)}</div> : null}
                      {builderResult?.kind === 'proposal' && builderDiff ? <div className={s.aiResult} role="status">
                        <h4>{builderResult.summary}</h4>
                        <div className={s.diffSummary}><span>Добавлено: <strong>{builderDiff.added.length}</strong></span><span>Изменено: <strong>{builderDiff.changed.length}</strong></span><span>Удалено: <strong>{builderDiff.removed.length}</strong></span>{builderDiff.structureChanged ? <span>Связи изменены</span> : null}</div>
                        {(builderDiff.added.length + builderDiff.changed.length + builderDiff.removed.length) > 0 ? <div className={s.diffDetails}>{builderDiff.added.length ? <p><strong>Новые:</strong> {builderDiff.added.join(', ')}</p> : null}{builderDiff.changed.length ? <p><strong>Изменены:</strong> {builderDiff.changed.join(', ')}</p> : null}{builderDiff.removed.length ? <p><strong>Удалены:</strong> {builderDiff.removed.join(', ')}</p> : null}</div> : <p>Состав узлов не изменился.</p>}
                        {builderResult.warnings.map((warning) => <p className={s.aiWarning} key={warning}>{warning}</p>)}
                        <div className={s.proposalActions}><button type="button" className={s.secondaryButton} onClick={() => setBuilderResult(null)}>Оставить текущую</button><button type="button" className={s.primaryButton} onClick={() => void applyBuilderProposal()} disabled={!canEdit || actionBusy === 'ai-apply'}>{actionBusy === 'ai-apply' ? 'Сохраняю…' : canEdit ? 'Применить к черновику' : 'Создайте новую версию'}</button></div>
                      </div> : null}
                    </section>

                    <div className={s.editorBody}>
                      <nav className={s.nodeRail} aria-label="Узлы сценария">
                        <div className={s.nodeRailTitle}><h3>Структура</h3>{canEdit ? <div><button type="button" onClick={() => addNode('send_message')} title="Добавить сообщение"><MessageSquareText size={15} /></button><button type="button" onClick={() => addNode('wait')} title="Добавить задержку"><Clock3 size={15} /></button><button type="button" onClick={() => addNode('end')} disabled={draft.nodes.some((node) => node.type === 'end')} title="Добавить завершение"><CheckCircle2 size={15} /></button></div> : null}</div>
                        {draft.nodes.map((node, index) => <button key={node.id} type="button" className={`${s.nodeItem}${selectedNodeId === node.id ? ` ${s.nodeItemActive}` : ''}`} onClick={() => setSelectedNodeId(node.id)}><span>{index + 1}</span><div><strong>{nodeTitle(node)}</strong><small>{nodeSummary(node)}</small></div></button>)}
                      </nav>
                      <section className={s.nodeEditor}>
                        {!selectedNode ? <div className={s.panelState}>Выберите узел в структуре.</div> : <>
                          <div className={s.nodeEditorHeading}><div><p>{selectedNode.type.replace(/_/g, ' ')}</p><h3>{nodeTitle(selectedNode)}</h3></div>{canEdit && draft.nodes.length > 1 && selectedNode.type !== 'end' ? <button type="button" className={s.dangerIcon} onClick={deleteSelectedNode} aria-label="Удалить узел"><Trash2 size={16} /></button> : null}</div>
                          {!EDITABLE_NODE_TYPES.has(selectedNode.type) ? <div className={s.readOnlyNotice}><CircleAlert size={17} /><div><strong>Этот узел пока доступен в режиме просмотра</strong><p>Его данные сохранены без изменений. Редактор сообщений, задержек и переходов уже работает; расширенные типы добавим следующим пакетом.</p></div></div> : null}
                          {selectedNode.type === 'send_message' ? <>
                            <label className={s.field}><span>Подпись узла</span><input value={selectedNode.label ?? ''} disabled={!canEdit} onChange={(event) => updateSelectedNode({ ...selectedNode, label: event.target.value })} /></label>
                            <label className={s.field}><span>Текст сообщения</span><textarea value={String(selectedNode.text ?? '')} maxLength={4096} disabled={!canEdit} onChange={(event) => updateSelectedNode({ ...selectedNode, text: event.target.value })} /></label>
                            <div className={s.buttonsBlock}><div><h4>Кнопки Telegram</h4><button type="button" onClick={addButton} disabled={!canEdit || (selectedNode.buttons?.length ?? 0) >= 10}><Plus size={14} />Добавить</button></div>{(selectedNode.buttons ?? []).map((button, index) => <div className={s.buttonRow} key={`${button.label}-${index}`}><select value={button.type} disabled={!canEdit} onChange={(event) => updateButton(index, event.target.value === 'callback' ? { type: 'callback', url: undefined, callbackData: 'next' } : { type: 'url', callbackData: undefined, url: 'https://' })}><option value="url">Ссылка</option><option value="callback">Действие</option></select><input value={button.label} disabled={!canEdit} onChange={(event) => updateButton(index, { label: event.target.value })} placeholder="Текст кнопки" />{button.type === 'url' ? <input value={button.url ?? ''} disabled={!canEdit} onChange={(event) => updateButton(index, { url: event.target.value })} placeholder="https://…" /> : <input value={button.callbackData ?? ''} disabled={!canEdit} onChange={(event) => updateButton(index, { callbackData: event.target.value })} placeholder="Код действия" />}<button type="button" className={s.removeButton} onClick={() => removeButton(index)} disabled={!canEdit} aria-label="Удалить кнопку"><Trash2 size={14} /></button></div>)}</div>
                          </> : null}
                          {selectedNode.type === 'wait' ? <><label className={s.field}><span>Подпись узла</span><input value={selectedNode.label ?? ''} disabled={!canEdit} onChange={(event) => updateSelectedNode({ ...selectedNode, label: event.target.value })} /></label><label className={s.field}><span>Пауза, секунд</span><input type="number" min="1" max="2592000" value={durationSeconds(selectedNode) || 3600} disabled={!canEdit} onChange={(event) => updateSelectedNode({ ...selectedNode, schedule: { type: 'duration', seconds: Math.max(1, Number(event.target.value) || 1) } })} /></label></> : null}
                          {selectedNode.type === 'end' ? <label className={s.field}><span>Подпись узла</span><input value={selectedNode.label ?? ''} disabled={!canEdit} onChange={(event) => updateSelectedNode({ ...selectedNode, label: event.target.value })} /></label> : null}
                          {selectedNode.type !== 'end' ? <label className={s.field}><span>Следующий шаг</span><select value={outgoingEdge(draft, selectedNode.id)?.toNodeId ?? ''} disabled={!canEdit} onChange={(event) => setNextTarget(event.target.value)}><option value="">Не выбран</option>{draft.nodes.filter((node) => node.id !== selectedNode.id).map((node) => <option key={node.id} value={node.id}>{nodeTitle(node)}</option>)}</select></label> : null}
                        </>}
                      </section>
                    </div>

                    <div className={s.bottomGrid}>
                      <section className={s.validationCard}><div><CheckCircle2 size={18} /><h3>Проверка</h3></div>{draftVersion?.validationReport?.valid === false ? <ul>{draftVersion.validationReport.issues.map((issue) => <li key={`${issue.path}-${issue.code}`}>{issue.message}</li>)}</ul> : <p>Текущая сохранённая версия прошла проверку структуры.</p>}</section>
                      <section className={s.testCard}><div><Send size={18} /><h3>Тестовый режим</h3></div>{testRecipient?.verified ? <><p>Тестовый получатель подтверждён. Сообщение уйдёт только ему.</p><button type="button" className={s.secondaryButton} onClick={() => void runTest()} disabled={!draftVersion || actionBusy === 'test-run'}><Send size={15} />Запустить тест</button></> : <><p>Подтвердите свой Telegram-аккаунт, прежде чем отправлять тестовые сообщения.</p><button type="button" className={s.secondaryButton} onClick={() => void generateTestLink()} disabled={actionBusy === 'test-link'}><Copy size={15} />Создать тестовую ссылку</button>{verificationLink ? <a href={verificationLink} target="_blank" rel="noreferrer" className={s.testLink}>Открыть ссылку подтверждения</a> : null}</>}</section>
                      <section className={s.historyCard}><div><History size={18} /><h3>Версии</h3></div><div className={s.versionList}>{selected.versions.filter((version) => version.publishedAt).map((version) => <div key={version.id}><span>v{version.version} · {formatDate(version.publishedAt ?? version.createdAt)}</span>{selected.publishedVersionId === version.id ? <strong>Активна</strong> : <button type="button" onClick={() => void rollback(version)} disabled={Boolean(actionBusy)}>Вернуть</button>}</div>)}{selected.versions.filter((version) => version.publishedAt).length === 0 ? <p>Опубликованных версий пока нет.</p> : null}</div></section>
                    </div>
                    <div className={s.dangerZone}><button type="button" onClick={() => void archive()} disabled={actionBusy === 'archive'}><Trash2 size={15} />Архивировать сценарий</button></div>
                  </>
                )}
              </section>
            </div>
          )}
        </>
      )}
    </main>
  );
}
