import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  KeyRound,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Unplug,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
  TelegramBot,
  TelegramBotDiagnostics,
  TelegramBotStatus,
  telegramBotApiError,
  telegramBotsApi,
} from '../../api/telegram-bots.api';
import { useProjectsStore } from '../../store/projects.store';
import s from './Chatbots.module.css';

const STATUS: Record<TelegramBotStatus, { label: string; tone: string }> = {
  ACTIVE: { label: 'Подключён', tone: s.statusActive },
  DRAFT: { label: 'Ожидает подключения', tone: s.statusDraft },
  DISCONNECTED: { label: 'Отключён', tone: s.statusMuted },
  ERROR: { label: 'Требует внимания', tone: s.statusError },
  ARCHIVED: { label: 'В архиве', tone: s.statusMuted },
};

type Confirmation =
  | { kind: 'replaceWebhook'; bot: TelegramBot; existingHost: string | null }
  | { kind: 'disconnect'; bot: TelegramBot }
  | { kind: 'archive'; bot: TelegramBot };

interface ModalProps {
  labelledBy: string;
  children: ReactNode;
  onClose: () => void;
  closeDisabled?: boolean;
  wide?: boolean;
}

function Modal({ labelledBy, children, onClose, closeDisabled = false, wide = false }: ModalProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !closeDisabled) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeDisabled, onClose]);

  return (
    <div
      className={s.modalOverlay}
      role="presentation"
      onMouseDown={() => {
        if (!closeDisabled) onClose();
      }}
    >
      <section
        className={`${s.modal}${wide ? ` ${s.modalWide}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onMouseDown={(event) => event.stopPropagation()}
      >
        {children}
      </section>
    </div>
  );
}

function ModalHeader({ id, title, description, onClose, closeDisabled = false }: {
  id: string;
  title: string;
  description?: string;
  onClose: () => void;
  closeDisabled?: boolean;
}) {
  return (
    <header className={s.modalHeader}>
      <div>
        <h2 className={s.modalTitle} id={id}>{title}</h2>
        {description ? <p className={s.modalDescription}>{description}</p> : null}
      </div>
      <button
        type="button"
        className={s.iconButton}
        onClick={onClose}
        disabled={closeDisabled}
        aria-label="Закрыть"
      >
        <X size={18} aria-hidden="true" />
      </button>
    </header>
  );
}

function BotAvatar({ bot }: { bot: TelegramBot }) {
  const letter = (bot.displayName || bot.username || 'T').trim().charAt(0).toUpperCase();
  return <div className={s.botAvatar} aria-hidden="true">{letter || <Bot size={22} />}</div>;
}

function StatusBadge({ status }: { status: TelegramBotStatus }) {
  const details = STATUS[status];
  return <span className={`${s.statusBadge} ${details.tone}`}>{details.label}</span>;
}

function formatDate(value: string | null): string {
  if (!value) return 'ещё не проверялся';
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function diagnosticsConflict(bot: TelegramBot, diagnostics: TelegramBotDiagnostics): boolean {
  return Boolean(
    diagnostics.webhook.configured
      && diagnostics.webhook.url
      && diagnostics.webhook.url !== bot.webhookUrl,
  );
}

export default function Chatbots() {
  const projects = useProjectsStore((state) => state.projects);
  const activeProjectId = useProjectsStore((state) => state.activeProjectId);

  const [bots, setBots] = useState<TelegramBot[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [busyBotId, setBusyBotId] = useState<string | null>(null);

  const [connectOpen, setConnectOpen] = useState(false);
  const [connectStep, setConnectStep] = useState<'token' | 'preview'>('token');
  const [connectToken, setConnectToken] = useState('');
  const [connectProjectId, setConnectProjectId] = useState('');
  const [connectResult, setConnectResult] = useState<{
    bot: TelegramBot;
    diagnostics: TelegramBotDiagnostics;
  } | null>(null);
  const [connectLoading, setConnectLoading] = useState(false);
  const [connectError, setConnectError] = useState('');

  const [diagnosticsBot, setDiagnosticsBot] = useState<TelegramBot | null>(null);
  const [diagnostics, setDiagnostics] = useState<TelegramBotDiagnostics | null>(null);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [diagnosticsError, setDiagnosticsError] = useState('');

  const [tokenBot, setTokenBot] = useState<TelegramBot | null>(null);
  const [newToken, setNewToken] = useState('');
  const [tokenLoading, setTokenLoading] = useState(false);
  const [tokenError, setTokenError] = useState('');

  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [confirmationLoading, setConfirmationLoading] = useState(false);

  const loadBots = useCallback(async (signal?: AbortSignal) => {
    try {
      const items = await telegramBotsApi.list(signal);
      setBots(items);
      setListError('');
    } catch (error) {
      if (signal?.aborted) return;
      setListError(telegramBotApiError(error, 'Не удалось загрузить Telegram-ботов').message);
    } finally {
      if (!signal?.aborted) {
        setListLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    document.title = 'Telegram-боты — Luma IQ';
    const controller = new AbortController();
    void loadBots(controller.signal);
    return () => controller.abort();
  }, [loadBots]);

  const projectNames = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name])),
    [projects],
  );

  const summary = useMemo(() => {
    let active = 0;
    let attention = 0;
    for (const bot of bots) {
      if (bot.status === 'ACTIVE') active += 1;
      if (bot.status === 'ERROR' || bot.lastError) attention += 1;
    }
    return { active, attention, total: bots.length };
  }, [bots]);

  function openConnect() {
    setConnectOpen(true);
    setConnectStep('token');
    setConnectToken('');
    setConnectProjectId(activeProjectId || '');
    setConnectResult(null);
    setConnectError('');
  }

  function closeConnect() {
    if (connectLoading) return;
    setConnectOpen(false);
    setConnectToken('');
    setConnectResult(null);
    setConnectError('');
  }

  async function handleCreateBot(event: FormEvent) {
    event.preventDefault();
    if (!connectToken.trim() || connectLoading) return;
    setConnectLoading(true);
    setConnectError('');
    try {
      const result = await telegramBotsApi.create({
        token: connectToken.trim(),
        ...(connectProjectId ? { defaultProjectId: connectProjectId } : {}),
      });
      setConnectToken('');
      setConnectResult(result);
      setConnectStep('preview');
      await loadBots();
    } catch (error) {
      setConnectError(telegramBotApiError(error, 'Не удалось проверить токен').message);
    } finally {
      setConnectLoading(false);
    }
  }

  async function finishConnection() {
    if (!connectResult || connectLoading) return;
    const replaceExistingWebhook = diagnosticsConflict(connectResult.bot, connectResult.diagnostics);
    setConnectLoading(true);
    setConnectError('');
    try {
      await telegramBotsApi.connectWebhook(connectResult.bot.id, { replaceExistingWebhook });
      toast.success(`@${connectResult.bot.username} подключён к Luma IQ`);
      await loadBots();
      setConnectOpen(false);
      setConnectResult(null);
    } catch (error) {
      setConnectError(telegramBotApiError(error, 'Не удалось подключить webhook').message);
    } finally {
      setConnectLoading(false);
    }
  }

  async function openDiagnostics(bot: TelegramBot) {
    setDiagnosticsBot(bot);
    setDiagnostics(null);
    setDiagnosticsError('');
    setDiagnosticsLoading(true);
    try {
      const result = await telegramBotsApi.diagnostics(bot.id);
      setDiagnostics(result);
      await loadBots();
    } catch (error) {
      setDiagnosticsError(telegramBotApiError(error, 'Не удалось проверить бота').message);
    } finally {
      setDiagnosticsLoading(false);
    }
  }

  async function connectBot(bot: TelegramBot) {
    if (busyBotId) return;
    setBusyBotId(bot.id);
    try {
      await telegramBotsApi.connectWebhook(bot.id);
      toast.success(`@${bot.username} подключён`);
      await loadBots();
    } catch (error) {
      const details = telegramBotApiError(error, 'Не удалось подключить webhook');
      if (details.code === 'TELEGRAM_WEBHOOK_CONFLICT') {
        setConfirmation({ kind: 'replaceWebhook', bot, existingHost: details.existingHost });
      } else {
        toast.error(details.message);
      }
    } finally {
      setBusyBotId(null);
    }
  }

  async function updateBotProject(bot: TelegramBot, projectId: string) {
    if (busyBotId) return;
    setBusyBotId(bot.id);
    try {
      const updated = await telegramBotsApi.update(bot.id, {
        defaultProjectId: projectId || null,
      });
      setBots((current) => current.map((item) => item.id === updated.id ? updated : item));
      toast.success('Проект бота обновлён');
    } catch (error) {
      toast.error(telegramBotApiError(error, 'Не удалось изменить проект').message);
    } finally {
      setBusyBotId(null);
    }
  }

  function openTokenDialog(bot: TelegramBot) {
    setTokenBot(bot);
    setNewToken('');
    setTokenError('');
  }

  function closeTokenDialog() {
    if (tokenLoading) return;
    setTokenBot(null);
    setNewToken('');
    setTokenError('');
  }

  async function replaceToken(event: FormEvent) {
    event.preventDefault();
    if (!tokenBot || !newToken.trim() || tokenLoading) return;
    setTokenLoading(true);
    setTokenError('');
    try {
      await telegramBotsApi.replaceToken(tokenBot.id, newToken.trim());
      setNewToken('');
      toast.success(`Токен @${tokenBot.username} обновлён`);
      await loadBots();
      setTokenBot(null);
    } catch (error) {
      setTokenError(telegramBotApiError(error, 'Не удалось заменить токен').message);
    } finally {
      setTokenLoading(false);
    }
  }

  async function executeConfirmation() {
    if (!confirmation || confirmationLoading) return;
    setConfirmationLoading(true);
    try {
      if (confirmation.kind === 'replaceWebhook') {
        await telegramBotsApi.connectWebhook(confirmation.bot.id, { replaceExistingWebhook: true });
        toast.success(`@${confirmation.bot.username} переключён на Luma IQ`);
      } else if (confirmation.kind === 'disconnect') {
        await telegramBotsApi.disconnectWebhook(confirmation.bot.id);
        toast.success(`@${confirmation.bot.username} отключён`);
      } else {
        await telegramBotsApi.archive(confirmation.bot.id);
        toast.success(`@${confirmation.bot.username} удалён из Luma IQ`);
      }
      await loadBots();
      setConfirmation(null);
    } catch (error) {
      toast.error(telegramBotApiError(error, 'Операция не выполнена').message);
    } finally {
      setConfirmationLoading(false);
    }
  }

  const confirmationCopy = confirmation?.kind === 'replaceWebhook'
    ? {
        title: 'Заменить webhook другого сервиса?',
        body: `Сейчас бот получает сообщения через ${confirmation.existingHost ?? 'другой сервис'}. После замены прежняя автоматизация перестанет получать новые сообщения.`,
        action: 'Отключить прежний сервис и подключить Luma IQ',
        destructive: true,
      }
    : confirmation?.kind === 'disconnect'
      ? {
          title: 'Отключить бота?',
          body: 'Luma IQ удалит webhook. Цепочки и рассылки этого бота перестанут запускаться, но настройки останутся.',
          action: 'Отключить webhook',
          destructive: false,
        }
      : {
          title: 'Удалить бота из Luma IQ?',
          body: 'Webhook будет отключён, а сохранённый токен — безвозвратно удалён. Исторические данные останутся в базе для аудита.',
          action: 'Удалить бота',
          destructive: true,
        };

  return (
    <div className={s.root}>
      <header className={s.pageHeader}>
        <div>
          <p className={s.eyebrow}>Vibe botting · Telegram</p>
          <h1 className={s.title}>Мои Telegram-боты</h1>
          <p className={s.subtitle}>Подключите бота, а затем создавайте сценарии через диалог с ИИ.</p>
        </div>
        <div className={s.headerActions}>
          <button
            type="button"
            className={s.secondaryButton}
            onClick={() => {
              setRefreshing(true);
              void loadBots();
            }}
            disabled={refreshing || listLoading}
          >
            <RefreshCw className={refreshing ? s.spinning : ''} size={16} aria-hidden="true" />
            Обновить
          </button>
          <button type="button" className={s.primaryButton} onClick={openConnect}>
            <Plus size={17} aria-hidden="true" />
            Подключить бота
          </button>
        </div>
      </header>

      <section className={s.summaryGrid} aria-label="Сводка по ботам">
        <article className={s.summaryCard}>
          <span className={s.summaryIcon}><Link2 size={18} aria-hidden="true" /></span>
          <div><strong>{summary.active}</strong><span>подключено</span></div>
        </article>
        <article className={s.summaryCard}>
          <span className={`${s.summaryIcon} ${summary.attention ? s.summaryWarning : ''}`}>
            <CircleAlert size={18} aria-hidden="true" />
          </span>
          <div><strong>{summary.attention}</strong><span>требуют внимания</span></div>
        </article>
        <article className={s.summaryCard}>
          <span className={s.summaryIcon}><Bot size={18} aria-hidden="true" /></span>
          <div><strong>{summary.total}</strong><span>всего ботов</span></div>
        </article>
      </section>

      {listError ? (
        <div className={s.errorBanner} role="alert">
          <CircleAlert size={17} aria-hidden="true" />
          <span>{listError}</span>
          <button type="button" onClick={() => void loadBots()}>Повторить</button>
        </div>
      ) : null}

      {listLoading ? (
        <div className={s.loadingState} aria-live="polite">
          <Loader2 className={s.spinning} size={22} aria-hidden="true" />
          Загружаю ботов…
        </div>
      ) : bots.length === 0 ? (
        <section className={s.emptyState}>
          <div className={s.emptyIcon}><Bot size={30} aria-hidden="true" /></div>
          <h2>Подключите первого Telegram-бота</h2>
          <p>Возьмите токен у @BotFather. Luma IQ проверит бота и покажет, подключён ли он сейчас к другому сервису.</p>
          <button type="button" className={s.primaryButton} onClick={openConnect}>
            <Plus size={17} aria-hidden="true" />
            Подключить бота
          </button>
        </section>
      ) : (
        <section className={s.botList} aria-label="Список Telegram-ботов">
          {bots.map((bot) => {
            const isBusy = busyBotId === bot.id;
            return (
              <article className={s.botCard} key={bot.id}>
                <div className={s.botIdentity}>
                  <BotAvatar bot={bot} />
                  <div className={s.botNames}>
                    <div className={s.botTitleRow}>
                      <h2>{bot.displayName}</h2>
                      <StatusBadge status={bot.status} />
                    </div>
                    <a href={`https://t.me/${bot.username}`} target="_blank" rel="noreferrer">
                      @{bot.username}<ExternalLink size={12} aria-hidden="true" />
                    </a>
                  </div>
                </div>

                <div className={s.botDetails}>
                  <label className={s.projectField}>
                    <span>Проект по умолчанию</span>
                    <select
                      value={bot.defaultProjectId ?? ''}
                      onChange={(event) => void updateBotProject(bot, event.target.value)}
                      disabled={Boolean(busyBotId)}
                    >
                      <option value="">Без проекта</option>
                      {projects.filter((project) => project.status !== 'ARCHIVED').map((project) => (
                        <option key={project.id} value={project.id}>{project.name}</option>
                      ))}
                    </select>
                  </label>
                  <dl className={s.metaList}>
                    <div><dt>Токен</dt><dd>{bot.tokenHint ?? 'не сохранён'}</dd></div>
                    <div><dt>Webhook</dt><dd>{bot.webhookConfigured ? 'Luma IQ' : 'не подключён'}</dd></div>
                    <div><dt>Проверка</dt><dd>{formatDate(bot.lastHealthCheckAt)} МСК</dd></div>
                  </dl>
                </div>

                {bot.lastError ? (
                  <div className={s.cardError} role="status">
                    <AlertTriangle size={15} aria-hidden="true" />
                    <span>{bot.lastError}</span>
                  </div>
                ) : null}

                <footer className={s.botActions}>
                  {bot.status !== 'ACTIVE' ? (
                    <button
                      type="button"
                      className={s.primaryButtonSmall}
                      onClick={() => void connectBot(bot)}
                      disabled={Boolean(busyBotId)}
                    >
                      {isBusy ? <Loader2 className={s.spinning} size={15} /> : <Link2 size={15} />}
                      Подключить webhook
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={s.secondaryButtonSmall}
                      onClick={() => setConfirmation({ kind: 'disconnect', bot })}
                      disabled={Boolean(busyBotId)}
                    >
                      <Unplug size={15} aria-hidden="true" />
                      Отключить
                    </button>
                  )}
                  <button
                    type="button"
                    className={s.secondaryButtonSmall}
                    onClick={() => void openDiagnostics(bot)}
                    disabled={Boolean(busyBotId)}
                  >
                    <RefreshCw size={15} aria-hidden="true" />
                    Диагностика
                  </button>
                  <button
                    type="button"
                    className={s.secondaryButtonSmall}
                    onClick={() => openTokenDialog(bot)}
                    disabled={Boolean(busyBotId)}
                  >
                    <KeyRound size={15} aria-hidden="true" />
                    Заменить токен
                  </button>
                  <button
                    type="button"
                    className={s.iconDangerButton}
                    onClick={() => setConfirmation({ kind: 'archive', bot })}
                    disabled={Boolean(busyBotId)}
                    aria-label={`Удалить @${bot.username}`}
                    title="Удалить бота"
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </footer>
              </article>
            );
          })}
        </section>
      )}

      <aside className={s.securityNote}>
        <ShieldCheck size={20} aria-hidden="true" />
        <div>
          <strong>Токены защищены</strong>
          <p>Интерфейс никогда не показывает полный токен после сохранения. На сервере он хранится в зашифрованном виде.</p>
        </div>
      </aside>

      {connectOpen ? (
        <Modal labelledBy="connect-bot-title" onClose={closeConnect} closeDisabled={connectLoading} wide>
          {connectStep === 'token' ? (
            <>
              <ModalHeader
                id="connect-bot-title"
                title="Подключение Telegram-бота"
                description="Шаг 1 из 2 · Проверка токена и текущего webhook"
                onClose={closeConnect}
                closeDisabled={connectLoading}
              />
              <form className={s.modalBody} onSubmit={handleCreateBot}>
                <div className={s.infoBox}>
                  <ShieldCheck size={18} aria-hidden="true" />
                  <p>На этом шаге Luma IQ только проверит токен через Telegram. Текущий сервис не будет отключён.</p>
                </div>
                <label className={s.field}>
                  <span>Токен от @BotFather</span>
                  <input
                    type="password"
                    value={connectToken}
                    onChange={(event) => setConnectToken(event.target.value)}
                    autoComplete="off"
                    placeholder="1234567890:AA…"
                    disabled={connectLoading}
                    autoFocus
                    required
                  />
                  <small>Токен не попадёт в журнал браузера и не будет показан после сохранения.</small>
                </label>
                <label className={s.field}>
                  <span>Проект по умолчанию</span>
                  <select
                    value={connectProjectId}
                    onChange={(event) => setConnectProjectId(event.target.value)}
                    disabled={connectLoading}
                  >
                    <option value="">Без проекта</option>
                    {projects.filter((project) => project.status !== 'ARCHIVED').map((project) => (
                      <option key={project.id} value={project.id}>{project.name}</option>
                    ))}
                  </select>
                  <small>Сценарии можно будет привязать и к другим проектам позже.</small>
                </label>
                {connectError ? <p className={s.formError} role="alert">{connectError}</p> : null}
                <div className={s.modalActions}>
                  <button type="button" className={s.secondaryButton} onClick={closeConnect} disabled={connectLoading}>Отмена</button>
                  <button type="submit" className={s.primaryButton} disabled={!connectToken.trim() || connectLoading}>
                    {connectLoading ? <Loader2 className={s.spinning} size={17} /> : <RefreshCw size={17} />}
                    Проверить токен
                  </button>
                </div>
              </form>
            </>
          ) : connectResult ? (
            <>
              <ModalHeader
                id="connect-bot-title"
                title="Бот найден"
                description="Шаг 2 из 2 · Подтвердите подключение к Luma IQ"
                onClose={closeConnect}
                closeDisabled={connectLoading}
              />
              <div className={s.modalBody}>
                <div className={s.previewBot}>
                  <BotAvatar bot={connectResult.bot} />
                  <div><strong>{connectResult.bot.displayName}</strong><span>@{connectResult.bot.username}</span></div>
                  <CheckCircle2 className={s.previewCheck} size={22} aria-label="Токен действителен" />
                </div>
                {diagnosticsConflict(connectResult.bot, connectResult.diagnostics) ? (
                  <div className={s.conflictBox}>
                    <AlertTriangle size={20} aria-hidden="true" />
                    <div>
                      <strong>Бот уже подключён к другому сервису</strong>
                      <p>Текущий webhook: <b>{connectResult.diagnostics.webhook.host ?? 'неизвестный сервис'}</b>. Это может быть BotHelp. После подключения к Luma IQ прежний сервис перестанет получать новые сообщения.</p>
                    </div>
                  </div>
                ) : (
                  <div className={s.successBox}>
                    <CheckCircle2 size={19} aria-hidden="true" />
                    <p>{connectResult.diagnostics.webhook.configured ? 'Webhook уже указывает на Luma IQ.' : 'Бот свободен: webhook другого сервиса не найден.'}</p>
                  </div>
                )}
                <dl className={s.diagnosticsGrid}>
                  <div><dt>Telegram ID</dt><dd>{connectResult.diagnostics.bot.id}</dd></div>
                  <div><dt>Текущий webhook</dt><dd>{connectResult.diagnostics.webhook.host ?? 'не настроен'}</dd></div>
                  <div><dt>Ожидают обработки</dt><dd>{connectResult.diagnostics.webhook.pendingUpdateCount}</dd></div>
                  <div><dt>Проект</dt><dd>{projectNames.get(connectResult.bot.defaultProjectId ?? '') ?? 'Без проекта'}</dd></div>
                </dl>
                {connectError ? <p className={s.formError} role="alert">{connectError}</p> : null}
                <div className={s.modalActions}>
                  <button type="button" className={s.secondaryButton} onClick={closeConnect} disabled={connectLoading}>Сохранить без подключения</button>
                  <button
                    type="button"
                    className={diagnosticsConflict(connectResult.bot, connectResult.diagnostics) ? s.dangerButton : s.primaryButton}
                    onClick={() => void finishConnection()}
                    disabled={connectLoading}
                  >
                    {connectLoading ? <Loader2 className={s.spinning} size={17} /> : <Link2 size={17} />}
                    {diagnosticsConflict(connectResult.bot, connectResult.diagnostics)
                      ? 'Отключить прежний сервис и подключить'
                      : 'Подключить к Luma IQ'}
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </Modal>
      ) : null}

      {diagnosticsBot ? (
        <Modal
          labelledBy="diagnostics-title"
          onClose={() => {
            if (!diagnosticsLoading) setDiagnosticsBot(null);
          }}
          closeDisabled={diagnosticsLoading}
        >
          <ModalHeader
            id="diagnostics-title"
            title={`Диагностика @${diagnosticsBot.username}`}
            description="Актуальные данные напрямую из Telegram"
            onClose={() => setDiagnosticsBot(null)}
            closeDisabled={diagnosticsLoading}
          />
          <div className={s.modalBody} aria-live="polite">
            {diagnosticsLoading ? (
              <div className={s.loadingState}><Loader2 className={s.spinning} size={21} />Проверяю Telegram API…</div>
            ) : diagnosticsError ? (
              <p className={s.formError} role="alert">{diagnosticsError}</p>
            ) : diagnostics ? (
              <>
                <div className={s.diagnosticHeadline}>
                  {diagnostics.webhook.lastErrorMessage ? <CircleAlert size={20} /> : <CheckCircle2 size={20} />}
                  <div>
                    <strong>{diagnostics.webhook.lastErrorMessage ? 'Telegram сообщил об ошибке' : 'Бот отвечает'}</strong>
                    <span>{diagnostics.bot.firstName} · @{diagnostics.bot.username}</span>
                  </div>
                </div>
                <dl className={s.diagnosticsGrid}>
                  <div><dt>Webhook</dt><dd>{diagnostics.webhook.configured ? diagnostics.webhook.host : 'не настроен'}</dd></div>
                  <div><dt>Очередь обновлений</dt><dd>{diagnostics.webhook.pendingUpdateCount}</dd></div>
                  <div><dt>Макс. соединений</dt><dd>{diagnostics.webhook.maxConnections ?? '—'}</dd></div>
                  <div><dt>Последняя ошибка</dt><dd>{diagnostics.webhook.lastErrorAt ? `${formatDate(diagnostics.webhook.lastErrorAt)} МСК` : 'нет'}</dd></div>
                </dl>
                {diagnostics.webhook.lastErrorMessage ? (
                  <p className={s.formError}>{diagnostics.webhook.lastErrorMessage}</p>
                ) : null}
                <div className={s.urlBox}><span>URL webhook</span><code>{diagnostics.webhook.url ?? 'Не настроен'}</code></div>
              </>
            ) : null}
            <div className={s.modalActions}>
              <button type="button" className={s.secondaryButton} onClick={() => setDiagnosticsBot(null)} disabled={diagnosticsLoading}>Закрыть</button>
            </div>
          </div>
        </Modal>
      ) : null}

      {tokenBot ? (
        <Modal labelledBy="replace-token-title" onClose={closeTokenDialog} closeDisabled={tokenLoading}>
          <ModalHeader
            id="replace-token-title"
            title={`Заменить токен @${tokenBot.username}`}
            description="Новый токен должен принадлежать этому же Telegram-боту"
            onClose={closeTokenDialog}
            closeDisabled={tokenLoading}
          />
          <form className={s.modalBody} onSubmit={replaceToken}>
            <label className={s.field}>
              <span>Новый токен от @BotFather</span>
              <input
                type="password"
                value={newToken}
                onChange={(event) => setNewToken(event.target.value)}
                autoComplete="off"
                placeholder="1234567890:AA…"
                disabled={tokenLoading}
                autoFocus
                required
              />
              <small>Если токен принадлежит другому боту, Luma IQ отклонит замену.</small>
            </label>
            {tokenError ? <p className={s.formError} role="alert">{tokenError}</p> : null}
            <div className={s.modalActions}>
              <button type="button" className={s.secondaryButton} onClick={closeTokenDialog} disabled={tokenLoading}>Отмена</button>
              <button type="submit" className={s.primaryButton} disabled={!newToken.trim() || tokenLoading}>
                {tokenLoading ? <Loader2 className={s.spinning} size={17} /> : <KeyRound size={17} />}
                Заменить токен
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {confirmation ? (
        <Modal
          labelledBy="confirmation-title"
          onClose={() => {
            if (!confirmationLoading) setConfirmation(null);
          }}
          closeDisabled={confirmationLoading}
        >
          <ModalHeader
            id="confirmation-title"
            title={confirmationCopy.title}
            onClose={() => setConfirmation(null)}
            closeDisabled={confirmationLoading}
          />
          <div className={s.modalBody}>
            <div className={confirmationCopy.destructive ? s.conflictBox : s.infoBox}>
              <AlertTriangle size={20} aria-hidden="true" />
              <p>{confirmationCopy.body}</p>
            </div>
            <div className={s.modalActions}>
              <button type="button" className={s.secondaryButton} onClick={() => setConfirmation(null)} disabled={confirmationLoading}>Отмена</button>
              <button
                type="button"
                className={confirmationCopy.destructive ? s.dangerButton : s.primaryButton}
                onClick={() => void executeConfirmation()}
                disabled={confirmationLoading}
              >
                {confirmationLoading ? <Loader2 className={s.spinning} size={17} /> : null}
                {confirmationCopy.action}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
