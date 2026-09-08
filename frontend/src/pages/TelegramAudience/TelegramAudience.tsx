import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, CheckCircle2, Download, Loader2, MessageSquare, MousePointerClick, Search, Target, Users, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { TelegramBot, telegramBotApiError, telegramBotsApi } from '../../api/telegram-bots.api';
import {
  TelegramAudienceAnalytics,
  TelegramAudienceSubscriber,
  TelegramAudienceSubscriberDetails,
  TelegramSubscriberStatus,
  telegramAudienceApi,
} from '../../api/telegram-audience.api';
import { useProjectsStore } from '../../store/projects.store';
import s from './TelegramAudience.module.css';

const STATUS: Record<TelegramSubscriberStatus, string> = {
  ACTIVE: 'Активен', STOPPED: 'Остановлен', BLOCKED: 'Заблокировал бота', ARCHIVED: 'В архиве',
};

function subscriberName(item: Pick<TelegramAudienceSubscriber, 'firstName' | 'lastName' | 'username'>): string {
  return [item.firstName, item.lastName].filter(Boolean).join(' ') || (item.username ? `@${item.username}` : 'Подписчик');
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export default function TelegramAudience() {
  const projectId = useProjectsStore((state) => state.activeProjectId);
  const [bots, setBots] = useState<TelegramBot[]>([]);
  const [botId, setBotId] = useState('');
  const [status, setStatus] = useState<TelegramSubscriberStatus | ''>('');
  const [search, setSearch] = useState('');
  const [subscribers, setSubscribers] = useState<TelegramAudienceSubscriber[]>([]);
  const [total, setTotal] = useState(0);
  const [analytics, setAnalytics] = useState<TelegramAudienceAnalytics | null>(null);
  const [selected, setSelected] = useState<TelegramAudienceSubscriberDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = 'Подписчики и аналитика — Luma IQ';
    const controller = new AbortController();
    telegramBotsApi.list(controller.signal).then((items) => {
      setBots(items);
      setBotId((current) => current || items[0]?.id || '');
      if (!items.length) setLoading(false);
    }).catch((requestError) => {
      if (!controller.signal.aborted) {
        setError(telegramBotApiError(requestError, 'Не удалось загрузить Telegram-ботов').message);
        setLoading(false);
      }
    });
    return () => controller.abort();
  }, []);

  const loadAudience = useCallback(async (signal?: AbortSignal) => {
    if (!botId) return;
    setLoading(true);
    setError('');
    try {
      const [list, summary] = await Promise.all([
        telegramAudienceApi.list(botId, { ...(status ? { status } : {}), ...(search.trim() ? { search: search.trim() } : {}) }, signal),
        telegramAudienceApi.analytics(botId, projectId || undefined, signal),
      ]);
      setSubscribers(list.subscribers);
      setTotal(list.pagination.total);
      setAnalytics(summary);
      setSelected((current) => current && list.subscribers.some((item) => item.id === current.id) ? current : null);
    } catch (requestError) {
      if (!signal?.aborted) setError(telegramBotApiError(requestError, 'Не удалось загрузить аудиторию').message);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [botId, projectId, search, status]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void loadAudience(controller.signal), 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [loadAudience]);

  async function openSubscriber(item: TelegramAudienceSubscriber) {
    setDetailsLoading(true);
    try {
      setSelected(await telegramAudienceApi.get(botId, item.id));
    } catch (requestError) {
      toast.error(telegramBotApiError(requestError, 'Не удалось открыть карточку подписчика').message);
    } finally { setDetailsLoading(false); }
  }

  async function exportCsv() {
    if (!botId) return;
    try {
      const blob = await telegramAudienceApi.exportCsv(botId, { ...(status ? { status } : {}), ...(search.trim() ? { search: search.trim() } : {}) });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${bots.find((bot) => bot.id === botId)?.username || 'telegram-bot'}-subscribers.csv`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success('CSV подготовлен');
    } catch (requestError) {
      toast.error(telegramBotApiError(requestError, 'Не удалось выгрузить CSV').message);
    }
  }

  const cards = useMemo(() => analytics ? [
    { label: 'Активные подписчики', value: analytics.metrics.activeSubscribers, icon: Users },
    { label: 'Входы в сценарии', value: analytics.metrics.entries, icon: Activity },
    { label: 'Отправлено Telegram', value: analytics.metrics.delivered, icon: MessageSquare },
    { label: 'Завершения', value: analytics.metrics.completed, icon: CheckCircle2 },
    { label: 'Клики', value: analytics.metrics.buttonClicks, icon: MousePointerClick },
    { label: 'Цели', value: analytics.metrics.goalsReached, icon: Target },
  ] : [], [analytics]);

  if (!bots.length && !loading) return (
    <main className={s.root}><header className={s.header}><div><p className={s.eyebrow}>Конструктор чатботов</p><h1>Подписчики и аналитика</h1></div></header><div className={s.empty}>Сначала подключите Telegram-бота в разделе «Мои боты».</div></main>
  );

  return (
    <main className={s.root}>
      <header className={s.header}>
        <div><p className={s.eyebrow}>Конструктор чатботов</p><h1>Подписчики и аналитика</h1><p>Путь аудитории по сценариям и фактическая доставка сообщений.</p></div>
        <div className={s.headerActions}>
          <label><span>Бот</span><select value={botId} onChange={(event) => setBotId(event.target.value)}>{bots.map((bot) => <option key={bot.id} value={bot.id}>@{bot.username}</option>)}</select></label>
          <button type="button" className={s.secondaryButton} onClick={() => void exportCsv()} disabled={!botId}><Download size={16} />CSV</button>
        </div>
      </header>

      {error ? <div className={s.error} role="alert">{error}<button type="button" onClick={() => void loadAudience()}>Повторить</button></div> : null}
      <section className={s.metricGrid} aria-label="Метрики за последние 30 дней">
        {cards.map(({ label, value, icon: Icon }) => <article className={s.metricCard} key={label}><Icon size={18} aria-hidden="true" /><div><strong>{value.toLocaleString('ru-RU')}</strong><span>{label}</span></div></article>)}
      </section>
      {analytics ? <p className={s.deliveryNote}>{analytics.semantics.note} Поэтому Luma IQ не показывает open rate.</p> : null}

      <section className={s.workspace}>
        <div className={s.listPane}>
          <div className={s.filters}>
            <label className={s.search}><Search size={16} aria-hidden="true" /><input aria-label="Поиск подписчиков" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Имя или username" /></label>
            <select aria-label="Статус подписчика" value={status} onChange={(event) => setStatus(event.target.value as TelegramSubscriberStatus | '')}><option value="">Все статусы</option>{Object.entries(STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          </div>
          <div className={s.listHeader}><strong>Подписчики</strong><span>{total}</span></div>
          {loading ? <div className={s.loading}><Loader2 className={s.spin} size={22} />Загружаю</div> : subscribers.length ? (
            <div className={s.subscriberList}>{subscribers.map((item) => <button type="button" key={item.id} className={`${s.subscriberRow}${selected?.id === item.id ? ` ${s.selectedRow}` : ''}`} onClick={() => void openSubscriber(item)}><span className={s.avatar}>{subscriberName(item).charAt(0).toUpperCase()}</span><span className={s.identity}><strong>{subscriberName(item)}</strong><small>{item.username ? `@${item.username}` : item.source || 'Источник не указан'}</small></span><span className={s.rowMeta}><small>{item.currentEnrollment?.scenario.name || 'Без сценария'}</small><span data-status={item.status}>{STATUS[item.status]}</span></span></button>)}</div>
          ) : <div className={s.empty}>Подписчиков по выбранным условиям пока нет.</div>}
        </div>

        <aside className={s.detailsPane} aria-live="polite">
          {detailsLoading ? <div className={s.loading}><Loader2 className={s.spin} size={22} />Открываю карточку</div> : selected ? <>
            <div className={s.detailsHeader}><div><span className={s.avatar}>{subscriberName(selected).charAt(0).toUpperCase()}</span><div><h2>{subscriberName(selected)}</h2><p>{selected.username ? `@${selected.username}` : 'Username не указан'}</p></div></div><button type="button" className={s.iconButton} onClick={() => setSelected(null)} aria-label="Закрыть карточку"><X size={18} /></button></div>
            <dl className={s.profileGrid}><div><dt>Статус</dt><dd>{STATUS[selected.status]}</dd></div><div><dt>Источник</dt><dd>{selected.source || 'Не указан'}</dd></div><div><dt>Первый вход</dt><dd>{formatDate(selected.firstSeenAt)}</dd></div><div><dt>Последняя активность</dt><dd>{formatDate(selected.lastSeenAt)}</dd></div></dl>
            {selected.tags.length ? <div className={s.tags}>{selected.tags.map((tag) => <span key={tag.id}>{tag.name}</span>)}</div> : null}
            <h3>Прохождение сценариев</h3>
            {selected.enrollments.length ? <div className={s.timeline}>{selected.enrollments.map((enrollment) => <article key={enrollment.id}><span data-enrollment={enrollment.status} /><div><strong>{enrollment.scenario.name}</strong><p>{enrollment.status} · {formatDate(enrollment.lastActivityAt)}</p>{enrollment.currentNodeId ? <small>Текущий шаг: {enrollment.currentNodeId}</small> : null}</div></article>)}</div> : <p className={s.muted}>Нет запусков сценариев.</p>}
            <h3>Активность</h3><div className={s.activityGrid}><span>Отправлено <strong>{selected.activity.delivered}</strong></span><span>Ошибки <strong>{selected.activity.failed}</strong></span><span>Клики <strong>{selected.activity.buttonClicks}</strong></span><span>Цели <strong>{selected.activity.goalsReached}</strong></span></div>
          </> : <div className={s.detailsEmpty}><Users size={28} /><strong>Выберите подписчика</strong><span>Здесь появятся безопасный профиль и прохождение сценариев.</span></div>}
        </aside>
      </section>
    </main>
  );
}
