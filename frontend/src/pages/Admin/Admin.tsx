import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { adminApi, AdminDashboard, AdminPromptExperiment, AdminPromptRegistryItem, AdminPromptVersion, AdminUserDetail, AdminUserListItem, type AdminCommercialPlan, type AdminSubscriptionPlan } from '../../api/admin.api';
import { getAccessToken, getCsrfToken, setAdminAccessTokenBackup } from '../../api/token-session';
import { useAuthStore } from '../../store/auth.store';
import s from './Admin.module.css';

type Page = 'dashboard' | 'users' | 'usage' | 'subscriptions' | 'ai' | 'projects' | 'workflows' | 'prompts' | 'errors' | 'settings' | 'user-detail';
type SortKey = 'aiCostUsd' | 'tokens' | 'ltv' | 'lastActivityAt' | 'createdAt' | 'aiRequestCount';

const PAGES: Array<{ id: Page; label: string }> = [
  { id: 'dashboard', label: 'Дашборд' },
  { id: 'users', label: 'Пользователи' },
  { id: 'usage', label: 'Расходы AI' },
  { id: 'subscriptions', label: 'Подписки' },
  { id: 'ai', label: 'AI-аналитика' },
  { id: 'projects', label: 'Проекты' },
  { id: 'workflows', label: 'Workflow' },
  { id: 'prompts', label: 'Промпты' },
  { id: 'errors', label: 'Ошибки' },
  { id: 'settings', label: 'Настройки' },
];

const COMMERCIAL_PLAN_OPTIONS: Array<{ value: AdminCommercialPlan; label: string }> = [
  { value: 'START', label: 'Start' },
  { value: 'PRO', label: 'Pro' },
  { value: 'EXPERT', label: 'Expert' },
  { value: 'SUPPORT', label: 'Support' },
  { value: 'MARKETING_PARTNER', label: 'Marketing Partner' },
  { value: 'IMPLEMENTATION', label: 'Implementation' },
];

const SUBSCRIPTION_PLAN_OPTIONS: Array<{ value: AdminSubscriptionPlan; label: string }> = [
  { value: 'FREE', label: 'Free' },
  ...COMMERCIAL_PLAN_OPTIONS,
  { value: 'ANNUAL', label: 'Annual (legacy)' },
];

const PAYMENT_SOURCE_OPTIONS = [
  { value: 'TRIBUTE', label: 'Tribute' },
  { value: 'MANUAL', label: 'Ручная оплата' },
  { value: 'PROMO', label: 'Промо / пилот' },
] as const;

function fmtDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value));
}

function fmtMoney(value: number, currency: 'RUB' | 'USD' = 'RUB'): string {
  if (currency === 'USD') return `$${value.toFixed(2)}`;
  return `${Math.round(value).toLocaleString('ru-RU')} ₽`;
}

function fmtTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 100) / 10}K`;
  return String(value);
}

function planClass(plan: string): string {
  if (plan !== 'FREE') return `${s.badge} ${s.badgePro}`;
  return s.badge;
}

function statusClass(status: string): string {
  if (status === 'ACTIVE') return `${s.badge} ${s.badgeSuccess}`;
  if (status === 'EXPIRED' || status === 'FAILED') return `${s.badge} ${s.badgeDanger}`;
  return s.badge;
}

function fmtRole(role: string): string {
  return role === 'ADMIN' ? 'Администратор' : 'Пользователь';
}

function fmtStatus(status: string): string {
  if (status === 'ACTIVE') return 'Активен';
  if (status === 'EXPIRED') return 'Истек';
  if (status === 'FAILED') return 'Ошибка';
  if (status === 'CANCELED' || status === 'CANCELLED') return 'Отменен';
  return status;
}

function archiveClass(archivedAt: string | null): string {
  return archivedAt ? `${s.badge} ${s.badgeMuted}` : `${s.badge} ${s.badgeSuccess}`;
}

function MetricCard({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className={s.metricCard}>
      <div className={s.metricLabel}>{label}</div>
      <div className={s.metricValue}>{value}</div>
      {hint && <div className={s.metricHint}>{hint}</div>}
    </div>
  );
}

function BreakdownBar({ label, value, max, right }: { label: string; value: number; max: number; right: string }) {
  const width = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0;
  return (
    <div className={s.breakdownRow}>
      <div className={s.breakdownTop}>
        <span>{label}</span>
        <strong>{right}</strong>
      </div>
      <div className={s.barTrack}><div className={s.barFill} style={{ width: `${width}%` }} /></div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className={s.field}>
      <span className={s.fieldLabel}>{label}</span>
      {children}
      {hint && <span className={s.fieldHint}>{hint}</span>}
    </label>
  );
}

export default function Admin() {
  const navigate = useNavigate();
  const currentUser = useAuthStore((st) => st.user);
  const setTokens = useAuthStore((st) => st.setTokens);
  const isAdmin = currentUser?.role === 'ADMIN';
  const isAdminRef = useRef(isAdmin);
  const suppressAdminLoadErrorsRef = useRef(false);

  const [page, setPage] = useState<Page>('dashboard');
  const [previousPage, setPreviousPage] = useState<Page>('users');
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [users, setUsers] = useState<AdminUserListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [q, setQ] = useState('');
  const [plan, setPlan] = useState('ALL');
  const [status, setStatus] = useState('ALL');
  const [archiveFilter, setArchiveFilter] = useState<'ACTIVE' | 'ARCHIVED' | 'ALL'>('ACTIVE');
  const [sortKey, setSortKey] = useState<SortKey>('aiCostUsd');
  const [createOpen, setCreateOpen] = useState(false);
  const [impersonateLoading, setImpersonateLoading] = useState(false);

  const [grantEmail, setGrantEmail] = useState('');
  const [grantName, setGrantName] = useState('');
  const [grantPassword, setGrantPassword] = useState('');
  const [grantPlan, setGrantPlan] = useState<AdminCommercialPlan>('PRO');
  const [grantMonths, setGrantMonths] = useState(1);
  const [paymentSource, setPaymentSource] = useState<'TRIBUTE' | 'MANUAL' | 'PROMO'>('TRIBUTE');
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [externalId, setExternalId] = useState('');
  const [adminNote, setAdminNote] = useState('');
  const [grantLoading, setGrantLoading] = useState(false);
  const [accessRole, setAccessRole] = useState<'ADMIN' | 'USER'>('USER');
  const [accessPlan, setAccessPlan] = useState<AdminSubscriptionPlan>('FREE');
  const [accessStatus, setAccessStatus] = useState<'ACTIVE' | 'EXPIRED' | 'CANCELLED'>('ACTIVE');
  const [accessExpiresAt, setAccessExpiresAt] = useState('');
  const [accessLtv, setAccessLtv] = useState(0);
  const [accessPaymentDate, setAccessPaymentDate] = useState('');
  const [accessNote, setAccessNote] = useState('');
  const [accessProjectLimit, setAccessProjectLimit] = useState('');
  const [accessDailyLimit, setAccessDailyLimit] = useState('');
  const [accessMonthlyLimit, setAccessMonthlyLimit] = useState('');
  const [creditsAmount, setCreditsAmount] = useState(0);
  const [creditsReason, setCreditsReason] = useState('');
  const [accessLoading, setAccessLoading] = useState(false);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveReason, setArchiveReason] = useState('');
  const [promptRegistry, setPromptRegistry] = useState<AdminPromptRegistryItem[]>([]);
  const [promptVersions, setPromptVersions] = useState<AdminPromptVersion[]>([]);
  const [promptExperiments, setPromptExperiments] = useState<AdminPromptExperiment[]>([]);
  const [promptWorkflow, setPromptWorkflow] = useState('posts.post');
  const [promptStep, setPromptStep] = useState('write');
  const [promptVersionLabel, setPromptVersionLabel] = useState('v2');
  const [promptStatus, setPromptStatus] = useState<'DRAFT' | 'ACTIVE' | 'ARCHIVED'>('DRAFT');
  const [promptModel, setPromptModel] = useState('');
  const [promptTemperature, setPromptTemperature] = useState('');
  const [promptMaxTokens, setPromptMaxTokens] = useState('');
  const [promptSystem, setPromptSystem] = useState('');
  const [promptNotes, setPromptNotes] = useState('');
  const [experimentName, setExperimentName] = useState('');
  const [experimentVersionId, setExperimentVersionId] = useState('');

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => {
      if (sortKey === 'createdAt' || sortKey === 'lastActivityAt') return new Date(b[sortKey]).getTime() - new Date(a[sortKey]).getTime();
      return Number(b[sortKey] ?? 0) - Number(a[sortKey] ?? 0);
    });
  }, [users, sortKey]);

  const selectedProjects = selected?.projects ?? [];
  const maxFeatureCost = Math.max(...(dashboard?.ai.byFeature.map((item) => item.costUsd) ?? [0]), 0);
  const maxModelCost = Math.max(...(dashboard?.ai.byModel.map((item) => item.costUsd) ?? [0]), 0);

  useEffect(() => {
    isAdminRef.current = isAdmin;
    if (!isAdmin) suppressAdminLoadErrorsRef.current = true;
  }, [isAdmin]);

  function showAdminLoadError(message: string) {
    if (!isAdminRef.current || suppressAdminLoadErrorsRef.current) return;
    toast.error(message);
  }

  async function loadDashboard() {
    if (!isAdmin) return;
    try {
      setDashboard(await adminApi.dashboard());
    } catch {
      showAdminLoadError('Не удалось загрузить бизнес-метрики');
    }
  }

  async function loadPrompts() {
    if (!isAdmin) return;
    try {
      const data = await adminApi.prompts();
      setPromptRegistry(data.registry);
      setPromptVersions(data.versions);
      setPromptExperiments(data.experiments);
      const first = data.registry[0];
      if (first && !promptWorkflow) {
        setPromptWorkflow(first.workflow);
        setPromptStep(first.step);
      }
    } catch {
      showAdminLoadError('Не удалось загрузить prompt CMS');
    }
  }

  async function loadUsers() {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await adminApi.listUsers({ q: q || undefined, plan, status, archive: archiveFilter, limit: 100 });
      setUsers(data.users);
      setTotal(data.total);
    } catch {
      showAdminLoadError('Не удалось загрузить пользователей');
    } finally {
      setLoading(false);
    }
  }

  async function openUser(user: AdminUserListItem) {
    setPreviousPage(page === 'user-detail' ? 'users' : page);
    setPage('user-detail');
    setDetailLoading(true);
    try {
      const detail = await adminApi.getUser(user.id);
      setSelected(detail);
      setGrantEmail(detail.email);
      setGrantName(detail.name ?? '');
      setAccessRole(detail.role as 'ADMIN' | 'USER');
      setAccessPlan(detail.subscription.plan as AdminSubscriptionPlan);
      setAccessStatus(detail.subscription.status as 'ACTIVE' | 'EXPIRED' | 'CANCELLED');
      setAccessExpiresAt(detail.subscription.expiresAt ? detail.subscription.expiresAt.slice(0, 10) : '');
      setAccessPaymentDate(detail.subscription.lastPaymentAt ? detail.subscription.lastPaymentAt.slice(0, 10) : '');
      setAccessLtv(Number(detail.subscription.ltvRub ?? detail.ltv ?? 0));
      setAccessNote(detail.subscription.adminNote ?? '');
      const overrides = detail.subscription.limitOverrides as { projectLimit?: number; dailyGenerationLimit?: number; monthlyGenerationLimit?: number } | null | undefined;
      setAccessProjectLimit(overrides?.projectLimit ? String(overrides.projectLimit) : '');
      setAccessDailyLimit(overrides?.dailyGenerationLimit ? String(overrides.dailyGenerationLimit) : '');
      setAccessMonthlyLimit(overrides?.monthlyGenerationLimit ? String(overrides.monthlyGenerationLimit) : '');
      setArchiveReason(detail.archiveReason ?? '');
    } catch {
      toast.error('Не удалось загрузить карточку пользователя');
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    if (currentUser && !isAdmin) {
      suppressAdminLoadErrorsRef.current = true;
      navigate('/dashboard', { replace: true });
      setLoading(false);
      return;
    }
    if (!isAdmin) return;
    suppressAdminLoadErrorsRef.current = false;
    void loadDashboard();
    void loadUsers();
    void loadPrompts();
  }, [currentUser, isAdmin, navigate]);

  async function refreshAll() {
    if (!isAdmin) return;
    await Promise.all([loadDashboard(), loadUsers(), loadPrompts()]);
    if (selected) {
      const detail = await adminApi.getUser(selected.id).catch(() => null);
      if (detail) setSelected(detail);
    }
  }

  async function handleGrant() {
    setGrantLoading(true);
    try {
      const result = await adminApi.grantPro({
        email: grantEmail,
        name: grantName || undefined,
        password: grantPassword || undefined,
        plan: grantPlan,
        months: grantMonths,
        paymentSource,
        amount: paymentAmount,
        externalId: externalId || undefined,
        adminNote: adminNote || undefined,
      });
      toast.success(`Доступ ${result.subscription.plan} активирован`);
      setGrantPassword('');
      setExternalId('');
      setAdminNote('');
      setPaymentAmount(0);
      setCreateOpen(false);
      await refreshAll();
      const target = await adminApi.getUser(result.user.id);
      setSelected(target);
      setPage('user-detail');
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg ?? 'Не удалось сохранить доступ');
    } finally {
      setGrantLoading(false);
    }
  }

  async function handleImpersonate() {
    if (!selected) return;
    const ok = window.confirm(`Войти в сервис как ${selected.email}?`);
    if (!ok) return;
    setImpersonateLoading(true);
    suppressAdminLoadErrorsRef.current = true;
    try {
      const currentAccess = getAccessToken();
      const currentCsrf = getCsrfToken() ?? undefined;
      const { tokens } = await adminApi.impersonateUser(selected.id);
      const impersonatedUser = await setTokens(tokens.accessToken, tokens.csrfToken);
      if (currentAccess) {
        // Set after setTokens, because normal auth token updates clear impersonation state.
        setAdminAccessTokenBackup({ accessToken: currentAccess, csrfToken: currentCsrf });
      }
      toast.success(`Вы вошли как ${impersonatedUser?.email ?? selected.email}`);
      navigate('/dashboard', { replace: true });
    } catch {
      suppressAdminLoadErrorsRef.current = false;
      toast.error('Не удалось войти под пользователем');
    } finally {
      setImpersonateLoading(false);
    }
  }

  async function handleUpdateSelectedAccess() {
    if (!selected) return;
    setAccessLoading(true);
    try {
      const limitOverrides = {
        ...(accessProjectLimit ? { projectLimit: Number(accessProjectLimit) } : {}),
        ...(accessDailyLimit ? { dailyGenerationLimit: Number(accessDailyLimit) } : {}),
        ...(accessMonthlyLimit ? { monthlyGenerationLimit: Number(accessMonthlyLimit) } : {}),
      };
      await adminApi.updateUserAccess(selected.id, {
        role: accessRole,
        plan: accessPlan,
        status: accessStatus,
        expiresAt: accessExpiresAt ? new Date(`${accessExpiresAt}T23:59:59.000Z`).toISOString() : null,
        paymentDate: accessPaymentDate ? new Date(`${accessPaymentDate}T12:00:00.000Z`).toISOString() : null,
        paymentSource,
        paymentAmount,
        externalId: externalId || undefined,
        adminNote: accessNote || null,
        ltvRub: accessLtv || null,
        limitOverrides: Object.keys(limitOverrides).length > 0 ? limitOverrides : null,
      });
      toast.success('Доступ пользователя обновлен');
      setPaymentAmount(0);
      setExternalId('');
      await refreshAll();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg ?? 'Не удалось обновить доступ');
    } finally {
      setAccessLoading(false);
    }
  }

  async function handleAddCredits() {
    if (!selected || creditsAmount === 0) return;
    setAccessLoading(true);
    try {
      await adminApi.addUserCredits(selected.id, { amount: creditsAmount, reason: creditsReason || undefined });
      toast.success('Credits обновлены');
      setCreditsAmount(0);
      setCreditsReason('');
      await refreshAll();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg ?? 'Не удалось обновить credits');
    } finally {
      setAccessLoading(false);
    }
  }

  async function handleArchiveSelected(archived: boolean) {
    if (!selected || archiveLoading) return;
    if (archived && selected.id === currentUser?.id) {
      toast.error('Нельзя архивировать текущего администратора');
      return;
    }
    const ok = window.confirm(
      archived
        ? `Архивировать пользователя ${selected.email}? Данные сохранятся, но он пропадет из основной аналитики.`
        : `Вернуть пользователя ${selected.email} в основную аналитику?`,
    );
    if (!ok) return;
    setArchiveLoading(true);
    try {
      await adminApi.archiveUser(selected.id, { archived, reason: archived ? archiveReason || null : null });
      toast.success(archived ? 'Пользователь архивирован' : 'Пользователь восстановлен');
      const detail = await adminApi.getUser(selected.id);
      setSelected(detail);
      setArchiveReason(detail.archiveReason ?? '');
      await Promise.all([loadDashboard(), loadUsers()]);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg ?? 'Не удалось обновить архив');
    } finally {
      setArchiveLoading(false);
    }
  }

  function renderDashboard() {
    const m = dashboard?.metrics;
    return (
      <>
        <div className={s.metricsGrid}>
          <MetricCard label="Всего пользователей" value={m?.totalUsers ?? '—'} hint={`${m?.newUsers7d ?? 0} новых за 7 дней · ${m?.newUsers30d ?? 0} за 30 дней`} />
          <MetricCard label="Активные пользователи" value={m?.activeUsers30d ?? '—'} hint="AI-активность за 30 дней" />
          <MetricCard label="Выручка / MRR" value={fmtMoney(m?.revenue ?? 0)} hint={`Средний LTV ${fmtMoney(m?.averageLtv ?? 0)}`} />
          <MetricCard label="AI-расходы за 30 дней" value={fmtMoney(m?.totalAiCostUsd ?? 0, 'USD')} hint={`${fmtMoney(m?.avgAiCostPerUserUsd ?? 0, 'USD')} / активный пользователь`} />
          <MetricCard label="Запросы сегодня" value={m?.aiToday ?? 0} hint={`${m?.generationsToday ?? 0} генераций`} />
          <MetricCard label="Ошибки AI за 30 дней" value={m?.failedGenerations30d ?? 0} hint={`${m?.missingPricingAlerts30d ?? 0} missing pricing`} />
          <MetricCard label="Дорогие пользователи" value={m?.highCostUsers30d ?? 0} hint="AI cost ≥ $3 за 30 дней" />
          <MetricCard label="Токены сегодня" value={fmtTokens(m?.tokensToday ?? 0)} hint="по всем провайдерам" />
          <MetricCard label="Самая используемая функция" value={m?.mostUsedFeature ?? '—'} hint="по запросам и расходам" />
          <MetricCard label="Оценочная маржа" value={fmtMoney(m?.estimatedMarginRub ?? 0)} hint={`${m?.estimatedMarginPercent ?? 0}% валовая маржа`} />
          <MetricCard label="Prompt CMS" value={m?.promptVersionsCount ?? 0} hint={`${m?.runningPromptExperiments ?? 0} A/B тестов запущено`} />
          <MetricCard label="Activation 30d" value={`${dashboard?.retention.activationRate ?? 0}%`} hint={`${dashboard?.retention.activatedUsers ?? 0}/${dashboard?.retention.cohort30dUsers ?? 0} новых пользователей`} />
          <MetricCard label="Retention AI" value={`${dashboard?.retention.retention7dRate ?? 0}%`} hint={`7d: ${dashboard?.retention.retained7dUsers ?? 0} · 30d: ${dashboard?.retention.retention30dRate ?? 0}%`} />
        </div>

        <div className={s.twoCol}>
          <section className={s.panel}>
            <div className={s.panelTitle}>Выручка против AI-расходов</div>
            <div className={s.economics}>
              <div><span>Выручка</span><strong>{fmtMoney(m?.revenue ?? 0)}</strong></div>
              <div><span>AI-расходы</span><strong>{fmtMoney(m?.totalAiCostUsd ?? 0, 'USD')}</strong></div>
              <div><span>Оценочная маржа</span><strong>{fmtMoney(m?.estimatedMarginRub ?? 0)}</strong></div>
            </div>
          </section>
          <section className={s.panel}>
            <div className={s.panelTitle}>Расходы по функциям</div>
            {(dashboard?.ai.byFeature ?? []).slice(0, 6).map((item) => (
              <BreakdownBar key={item.featureCode} label={item.featureCode} value={item.costUsd} max={maxFeatureCost} right={`${fmtMoney(item.costUsd, 'USD')} · ${item.requests}`} />
            ))}
            {dashboard?.ai.byFeature.length === 0 && <div className={s.emptyState}>AI-использования пока нет</div>}
          </section>
        </div>
        <section className={s.panel}>
          <div className={s.panelTitle}>AI margin по тарифам</div>
          <table className={s.table}>
            <thead><tr><th>Тариф</th><th>Пользователи</th><th>Выручка</th><th>AI cost</th><th>Маржа</th><th>Margin %</th></tr></thead>
            <tbody>
              {(dashboard?.ai.marginByPlan ?? []).map((item) => (
                <tr key={item.plan}>
                  <td><strong>{item.plan}</strong></td>
                  <td>{item.users}</td>
                  <td>{fmtMoney(item.revenueRub)}</td>
                  <td>{fmtMoney(item.aiCostUsd, 'USD')}</td>
                  <td>{fmtMoney(item.marginRub)}</td>
                  <td>{item.marginPercent}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </>
    );
  }

  function renderUsers() {
    return (
      <section className={s.panel}>
        <div className={s.filters}>
          <input className={s.search} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void loadUsers()} placeholder="Поиск по имени или email" />
          <select className={s.select} value={plan} onChange={(e) => setPlan(e.target.value)}>
            <option value="ALL">Все тарифы</option>
            {SUBSCRIPTION_PLAN_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <select className={s.select} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="ALL">Все статусы</option><option value="ACTIVE">Активные</option><option value="INACTIVE">Неактивные</option><option value="HIGH_COST">Дорогие пользователи</option>
          </select>
          <select className={s.select} value={archiveFilter} onChange={(e) => setArchiveFilter(e.target.value as 'ACTIVE' | 'ARCHIVED' | 'ALL')}>
            <option value="ACTIVE">Без архива</option>
            <option value="ARCHIVED">Архив</option>
            <option value="ALL">Все пользователи</option>
          </select>
          <select className={s.select} value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
            <option value="aiCostUsd">Сортировка: AI-расходы</option><option value="tokens">Сортировка: токены</option><option value="ltv">Сортировка: LTV</option><option value="aiRequestCount">Сортировка: запросы</option><option value="lastActivityAt">Сортировка: активность</option>
          </select>
          <button className={s.button} onClick={() => void loadUsers()}>Применить</button>
        </div>

        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Имя</th><th>Email</th><th>Архив</th><th>Роль</th><th>Тариф</th><th>Статус</th><th>Проекты</th><th>AI-запросы</th><th>Токены</th><th>AI-расходы</th><th>Выручка / LTV</th><th>Маржа</th><th>Активность</th><th>Создан</th>
              </tr>
            </thead>
            <tbody>
              {sortedUsers.map((user) => (
                <tr key={user.id} onClick={() => void openUser(user)} className={`${s.row}${user.archivedAt ? ' ' + s.archivedRow : ''}`}>
                  <td><strong>{user.name ?? 'Без имени'}</strong></td>
                  <td>{user.email}</td>
                  <td><span className={archiveClass(user.archivedAt)}>{user.archivedAt ? 'Архив' : 'Основной'}</span></td>
                  <td><span className={user.role === 'ADMIN' ? `${s.badge} ${s.badgeAdmin}` : s.badge}>{fmtRole(user.role)}</span></td>
                  <td><span className={planClass(user.subscription.plan)}>{user.subscription.plan}</span></td>
                  <td><span className={statusClass(user.subscription.status)}>{fmtStatus(user.subscription.status)}</span></td>
                  <td>{user.projectCount}</td>
                  <td>{user.aiRequestCount}</td>
                  <td>{fmtTokens(user.tokens)}</td>
                  <td>{fmtMoney(user.aiCostUsd, 'USD')}</td>
                  <td>{fmtMoney(user.ltv)}</td>
                  <td>{user.marginPercent}%</td>
                  <td>{fmtDate(user.lastActivityAt)}</td>
                  <td>{fmtDate(user.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading && <div className={s.emptyState}>Загружаю пользователей...</div>}
          {!loading && sortedUsers.length === 0 && <div className={s.emptyState}>Пользователи не найдены</div>}
        </div>
        <div className={s.tableFooter}>Показано: {sortedUsers.length} · всего: {total}</div>
      </section>
    );
  }

  function renderUsage() {
    return (
      <div className={s.twoCol}>
        <section className={s.panel}>
          <div className={s.panelTitle}>Расходы по функциям</div>
          {(dashboard?.ai.byFeature ?? []).map((item) => (
            <BreakdownBar key={item.featureCode} label={item.featureCode} value={item.costUsd} max={maxFeatureCost} right={`${fmtMoney(item.costUsd, 'USD')} · ${fmtTokens(item.tokens)} токенов`} />
          ))}
        </section>
        <section className={s.panel}>
          <div className={s.panelTitle}>Расходы по моделям</div>
          {(dashboard?.ai.byModel ?? []).map((item) => (
            <BreakdownBar key={`${item.provider}-${item.model}`} label={`${item.provider} / ${item.model}`} value={item.costUsd} max={maxModelCost} right={`${fmtMoney(item.costUsd, 'USD')} · ${item.requests}`} />
          ))}
        </section>
      </div>
    );
  }

  function renderAIAnalytics() {
    return (
      <section className={s.panel}>
        <div className={s.panelTitle}>Самые дорогие workflow</div>
        <table className={s.table}>
          <thead><tr><th>Workflow / функция</th><th>Запросы</th><th>Токены</th><th>Общий расход</th><th>Средний расход</th><th>Среднее время</th></tr></thead>
          <tbody>
            {(dashboard?.ai.byWorkflow ?? []).map((item) => (
              <tr key={item.workflow}>
                <td><strong>{item.workflow}</strong></td>
                <td>{item.requests}</td>
                <td>{fmtTokens(item.tokens)}</td>
                <td>{fmtMoney(item.costUsd, 'USD')}</td>
                <td>{fmtMoney(item.requests ? item.costUsd / item.requests : 0, 'USD')}</td>
                <td>{item.avgLatencyMs ? `${Math.round(item.avgLatencyMs / 1000)}s` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    );
  }

  function renderProjects() {
    const projects = selectedProjects;
    return (
      <section className={s.panel}>
        <div className={s.panelTitle}>Проекты {selected ? `· ${selected.email}` : ''}</div>
        {!selected && <div className={s.emptyState}>Откройте пользователя, чтобы увидеть здоровье проектов и AI-расходы по проектам.</div>}
        {selected && (
          <table className={s.table}>
            <thead><tr><th>Проект</th><th>Владелец</th><th>Этап</th><th>Здоровье</th><th>AI-использование</th><th>Материалы</th><th>Активность</th></tr></thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.id}>
                  <td><strong>{project.name}</strong></td>
                  <td>{selected.email}</td>
                  <td>{project.currentStage}</td>
                  <td>{project.health}%</td>
                  <td>{project.aiRequests} запр. · {fmtMoney(project.aiCostUsd, 'USD')}</td>
                  <td>{project.productsCount + project.generatedTextsCount + project.contentPlanItemsCount}</td>
                  <td>{fmtDate(project.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    );
  }

  function renderWorkflows() {
    return (
      <section className={s.panel}>
        <div className={s.panelTitle}>Состояние workflow</div>
        <table className={s.table}>
          <thead><tr><th>Workflow</th><th>Запуски</th><th>Успешность</th><th>Ошибки</th><th>Повторы</th><th>Среднее время</th></tr></thead>
          <tbody>
            {(dashboard?.ai.workflowHealth ?? []).map((item) => (
              <tr key={item.workflow}>
                <td><strong>{item.workflow}</strong></td>
                <td>{item.count}</td>
                <td>{item.successRate}%</td>
                <td>{item.failed}</td>
                <td>{item.avgRetry}</td>
                <td>{item.avgDurationMs ? `${Math.round(item.avgDurationMs / 1000)}s` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    );
  }

  async function handleCreatePromptVersion() {
    try {
      const version = await adminApi.createPromptVersion({
        workflow: promptWorkflow,
        step: promptStep,
        versionLabel: promptVersionLabel,
        status: promptStatus,
        model: promptModel || undefined,
        temperature: promptTemperature ? Number(promptTemperature) : undefined,
        maxTokens: promptMaxTokens ? Number(promptMaxTokens) : undefined,
        systemPrompt: promptSystem || undefined,
        notes: promptNotes || undefined,
      });
      toast.success(`Версия промпта создана: ${version.versionLabel}`);
      setExperimentVersionId(version.id);
      await loadPrompts();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg ?? 'Не удалось создать версию промпта');
    }
  }

  async function handleCreateExperiment() {
    try {
      await adminApi.createPromptExperiment({
        name: experimentName || `${promptWorkflow}.${promptStep} A/B`,
        workflow: promptWorkflow,
        step: promptStep,
        status: 'RUNNING',
        trafficPct: 100,
        variants: [
          { name: 'Control', promptVersionId: null, trafficWeight: 50, isControl: true },
          { name: 'Variant', promptVersionId: experimentVersionId || null, trafficWeight: 50 },
        ],
      });
      toast.success('A/B тест запущен');
      setExperimentName('');
      await loadPrompts();
      await loadDashboard();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg ?? 'Не удалось запустить A/B тест');
    }
  }

  function renderPrompts() {
    const selectedPrompt = promptRegistry.find((item) => item.workflow === promptWorkflow && item.step === promptStep);
    const relevantVersions = promptVersions.filter((item) => item.workflow === promptWorkflow && item.step === promptStep);
    return (
      <div className={s.detailStack}>
        <section className={s.panel}>
          <div className={s.panelTitle}>Prompt CMS / version control</div>
          <div className={s.formGrid}>
            <select className={s.select} value={`${promptWorkflow}.${promptStep}`} onChange={(event) => {
              const parts = event.target.value.split('.');
              setPromptWorkflow(parts.slice(0, -1).join('.'));
              setPromptStep(parts[parts.length - 1] ?? 'generate');
            }}>
              {promptRegistry.map((prompt) => (
                <option key={`${prompt.workflow}.${prompt.step}`} value={`${prompt.workflow}.${prompt.step}`}>
                  {prompt.workflow}.{prompt.step} · {prompt.feature}
                </option>
              ))}
            </select>
            <input className={s.input} value={promptVersionLabel} onChange={(e) => setPromptVersionLabel(e.target.value)} placeholder="Версия, например v2" />
            <select className={s.select} value={promptStatus} onChange={(e) => setPromptStatus(e.target.value as 'DRAFT' | 'ACTIVE' | 'ARCHIVED')}>
              <option value="DRAFT">Черновик</option>
              <option value="ACTIVE">Активная версия</option>
              <option value="ARCHIVED">Архив</option>
            </select>
            <input className={s.input} value={promptModel} onChange={(e) => setPromptModel(e.target.value)} placeholder={`Модель: ${selectedPrompt?.model ?? 'по умолчанию'}`} />
            <input className={s.input} value={promptTemperature} onChange={(e) => setPromptTemperature(e.target.value)} placeholder={`Temperature: ${selectedPrompt?.temperature ?? ''}`} />
            <input className={s.input} value={promptMaxTokens} onChange={(e) => setPromptMaxTokens(e.target.value)} placeholder={`Max tokens: ${selectedPrompt?.maxTokens ?? ''}`} />
            <textarea className={s.textarea} value={promptSystem} onChange={(e) => setPromptSystem(e.target.value)} placeholder="System prompt override. Используйте {{context}}, если хотите вставить selective context в конкретное место." rows={8} />
            <textarea className={s.textarea} value={promptNotes} onChange={(e) => setPromptNotes(e.target.value)} placeholder="Заметка: что тестируем и зачем" rows={3} />
          </div>
          <div className={s.actions}>
            <button className={s.button} onClick={() => void handleCreatePromptVersion()}>Создать версию</button>
          </div>
        </section>

        <section className={s.panel}>
          <div className={s.panelTitle}>A/B testing prompts</div>
          <div className={s.formGrid}>
            <input className={s.input} value={experimentName} onChange={(e) => setExperimentName(e.target.value)} placeholder="Название A/B теста" />
            <select className={s.select} value={experimentVersionId} onChange={(e) => setExperimentVersionId(e.target.value)}>
              <option value="">Variant = code prompt</option>
              {relevantVersions.map((version) => <option key={version.id} value={version.id}>{version.versionLabel} · {version.status}</option>)}
            </select>
          </div>
          <div className={s.actions}>
            <button className={s.secondaryButton} onClick={() => void handleCreateExperiment()} disabled={!promptWorkflow}>Запустить 50/50 A/B</button>
          </div>
        </section>

        <div className={s.twoCol}>
          <section className={s.panel}>
            <div className={s.panelTitle}>Версии выбранного промпта</div>
            {relevantVersions.map((version) => (
              <div key={version.id} className={s.listItem}>
                <strong>{version.versionLabel} · {version.status}</strong>
                <span>{version.model || selectedPrompt?.model} · temp {String(version.temperature ?? selectedPrompt?.temperature)} · {version.maxTokens ?? selectedPrompt?.maxTokens} tokens</span>
                {version.notes && <p>{version.notes}</p>}
              </div>
            ))}
            {relevantVersions.length === 0 && <div className={s.emptyState}>Для этого prompt step пока нет CMS-версий</div>}
          </section>
          <section className={s.panel}>
            <div className={s.panelTitle}>Эксперименты</div>
            {promptExperiments.slice(0, 12).map((experiment) => (
              <div key={experiment.id} className={s.listItem}>
                <strong>{experiment.name} · {experiment.status}</strong>
                <span>{experiment.workflow}.{experiment.step} · traffic {experiment.trafficPct}%</span>
                <p>{experiment.variants.map((variant) => `${variant.name}: ${variant.trafficWeight}%`).join(' · ')}</p>
              </div>
            ))}
            {promptExperiments.length === 0 && <div className={s.emptyState}>A/B тестов пока нет</div>}
          </section>
        </div>
      </div>
    );
  }

  function renderSubscriptions() {
    return (
      <section className={s.panel}>
        <div className={s.panelTitle}>Подписки</div>
        <div className={s.metricsGridSmall}>
          <MetricCard label="Активные платные" value={dashboard?.metrics.activePro ?? 0} />
          <MetricCard label="Выручка всего" value={fmtMoney(dashboard?.metrics.revenue ?? 0)} />
          <MetricCard label="Средний LTV" value={fmtMoney(dashboard?.metrics.averageLtv ?? 0)} />
          <MetricCard label="Маржа" value={`${dashboard?.metrics.estimatedMarginPercent ?? 0}%`} />
        </div>
        {renderUsers()}
      </section>
    );
  }

  function renderErrors() {
    const failed = dashboard?.ai.byStatus.filter((item) => item.status !== 'success' && item.status !== 'SUCCEEDED') ?? [];
    return (
      <section className={s.panel}>
        <div className={s.panelTitle}>Ошибки и риски</div>
        <div className={s.metricsGridSmall}>
          {failed.map((item) => <MetricCard key={item.status} label={item.status} value={item.count} />)}
          {failed.length === 0 && <MetricCard label="Ошибки генераций" value="0" hint="Критичных ошибок в агрегированном виде нет" />}
        </div>
        <div className={s.emptyState}>Сырые технические логи скрыты из бизнес-интерфейса. Их стоит смотреть только при расследовании инцидентов.</div>
      </section>
    );
  }

  function renderSettings() {
    return (
      <section className={s.panel}>
        <div className={s.panelTitle}>Управление доступом</div>
        <div className={s.formGrid}>
          <Field label="Email пользователя" hint="На этот email будет создан или найден аккаунт.">
            <input className={s.input} value={grantEmail} onChange={(e) => setGrantEmail(e.target.value)} placeholder="name@example.com" />
          </Field>
          <Field label="Имя" hint="Опционально: отображается в профиле и админке.">
            <input className={s.input} value={grantName} onChange={(e) => setGrantName(e.target.value)} placeholder="Имя пользователя" />
          </Field>
          <Field label="Пароль" hint="Только для нового аккаунта, минимум 8 символов.">
            <input className={s.input} value={grantPassword} onChange={(e) => setGrantPassword(e.target.value)} placeholder="Можно оставить пустым" />
          </Field>
          <Field label="Тариф" hint="Актуальный коммерческий тариф для выдачи доступа.">
            <select className={s.select} value={grantPlan} onChange={(e) => setGrantPlan(e.target.value as AdminCommercialPlan)}>
              {COMMERCIAL_PLAN_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </Field>
          <Field label="Период доступа" hint="Сколько месяцев добавить или продлить, от 1 до 24.">
            <input className={s.input} type="number" min={1} max={24} value={grantMonths} onChange={(e) => setGrantMonths(Number(e.target.value))} placeholder="Месяцы" />
          </Field>
          <Field label="Источник оплаты" hint="Откуда пришла оплата или почему выдается доступ.">
            <select className={s.select} value={paymentSource} onChange={(e) => setPaymentSource(e.target.value as 'TRIBUTE' | 'MANUAL' | 'PROMO')}>
              {PAYMENT_SOURCE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </Field>
          <Field label="Сумма оплаты" hint="Фактически оплаченная сумма в рублях. Можно поставить 0 для промо.">
            <div className={s.moneyInput}>
              <span>₽</span>
              <input className={s.input} type="number" min={0} value={paymentAmount} onChange={(e) => setPaymentAmount(Number(e.target.value))} placeholder="0" />
            </div>
          </Field>
          <Field label="ID / ссылка оплаты" hint="Tribute ID, ссылка на платеж или другой внешний идентификатор.">
            <input className={s.input} value={externalId} onChange={(e) => setExternalId(e.target.value)} placeholder="Например, ссылка Tribute" />
          </Field>
          <Field label="Заметка администратора" hint="Внутренний комментарий: условия, договоренность, контекст оплаты.">
            <textarea className={s.textarea} value={adminNote} onChange={(e) => setAdminNote(e.target.value)} placeholder="Заметка по оплате или выдаче доступа" rows={3} />
          </Field>
        </div>
        <div className={s.actions}><button className={s.button} onClick={() => void handleGrant()} disabled={grantLoading || !grantEmail}>{grantLoading ? 'Сохраняю...' : 'Создать / продлить доступ'}</button></div>
      </section>
    );
  }

  function renderUserDetail() {
    if (detailLoading) return <section className={s.panel}><div className={s.emptyState}>Загружаю пользователя...</div></section>;
    if (!selected) return <section className={s.panel}><div className={s.emptyState}>Пользователь не выбран</div></section>;
    return (
      <div className={s.detailStack}>
        <div className={s.detailHeader}>
          <button className={s.secondaryButton} onClick={() => setPage(previousPage)}>Назад</button>
          <div>
            <h2>{selected.name ?? 'Без имени'}</h2>
            <p>{selected.email}</p>
            {selected.archivedAt && <span className={`${s.badge} ${s.badgeMuted}`}>В архиве с {fmtDate(selected.archivedAt)}</span>}
          </div>
          <div className={s.actions}>
            <button className={s.secondaryButton} onClick={() => void handleImpersonate()} disabled={impersonateLoading || selected.id === currentUser?.id}>Войти как пользователь</button>
          </div>
        </div>

        <div className={s.metricsGrid}>
          <MetricCard label="Тариф" value={selected.subscription.plan} hint={fmtStatus(selected.subscription.status)} />
          <MetricCard label="Доступ до" value={fmtDate(selected.subscription.expiresAt)} />
          <MetricCard label="AI-расходы" value={fmtMoney(selected.aiCostUsd, 'USD')} hint={`${selected.aiRequestCount} запросов`} />
          <MetricCard label="Токены" value={fmtTokens(selected.tokens)} hint={`${selected.avgTokensPerRequest} в среднем / запрос`} />
          <MetricCard label="Выручка / LTV" value={fmtMoney(selected.ltv)} />
          <MetricCard label="Маржа" value={`${selected.marginPercent}%`} />
          <MetricCard label="Проекты" value={selected.projectCount} />
          <MetricCard label="Материалы" value={selected.generatedTextCount} />
        </div>

        <section className={selected.archivedAt ? `${s.panel} ${s.archivePanel}` : s.panel}>
          <div className={s.panelTitle}>Архивирование пользователя</div>
          <div className={s.archiveLayout}>
            <div>
              <div className={s.archiveState}>
                <span className={archiveClass(selected.archivedAt)}>{selected.archivedAt ? 'В архиве' : 'В основной аналитике'}</span>
                {selected.archivedAt && <span>с {fmtDate(selected.archivedAt)}</span>}
              </div>
              <p className={s.mutedText}>
                Архивирование не удаляет пользователя, проекты, платежи и AI-историю. Архивные пользователи не учитываются в основной админской аналитике и скрыты из списка по умолчанию.
              </p>
              {selected.archiveReason && <p className={s.archiveReason}>Причина: {selected.archiveReason}</p>}
            </div>
            <div className={s.archiveControls}>
              <textarea
                className={s.textarea}
                value={archiveReason}
                onChange={(e) => setArchiveReason(e.target.value)}
                placeholder="Причина архивации, если нужно"
                rows={3}
                disabled={Boolean(selected.archivedAt)}
              />
              {selected.archivedAt ? (
                <button className={s.secondaryButton} onClick={() => void handleArchiveSelected(false)} disabled={archiveLoading}>
                  Вернуть из архива
                </button>
              ) : (
                <button className={s.warningButton} onClick={() => void handleArchiveSelected(true)} disabled={archiveLoading || selected.id === currentUser?.id}>
                  Архивировать
                </button>
              )}
            </div>
          </div>
        </section>

        <div className={s.twoCol}>
          <section className={s.panel}>
            <div className={s.panelTitle}>Использование функций</div>
            {selected.featureUsage.map((item) => <BreakdownBar key={item.featureCode} label={item.featureCode} value={item.costUsd} max={Math.max(...selected.featureUsage.map((f) => f.costUsd), 0)} right={`${item.requests} запр. · ${fmtMoney(item.costUsd, 'USD')}`} />)}
            {selected.featureUsage.length === 0 && <div className={s.emptyState}>AI-использования пока нет</div>}
          </section>
          <section className={s.panel}>
            <div className={s.panelTitle}>Подписка и заметки Tribute</div>
            <div className={s.list}>
              {selected.payments.slice(0, 6).map((payment) => (
                <div className={s.listItem} key={payment.id}>
                  <strong>{Number(payment.amount).toLocaleString('ru-RU')} {payment.currency}</strong>
                  <span>{payment.source} · {payment.status} · {fmtDate(payment.createdAt)}</span>
                  {payment.adminNote && <p>{payment.adminNote}</p>}
                </div>
              ))}
              {selected.payments.length === 0 && <div className={s.emptyState}>Платежей пока нет</div>}
            </div>
          </section>
        </div>

        <section className={s.panel}>
          <div className={s.panelTitle}>Ручное управление доступом</div>
          <div className={s.formGrid}>
            <select className={s.select} value={accessRole} onChange={(e) => setAccessRole(e.target.value as 'ADMIN' | 'USER')}><option value="USER">Пользователь</option><option value="ADMIN">Администратор</option></select>
            <select className={s.select} value={accessPlan} onChange={(e) => setAccessPlan(e.target.value as AdminSubscriptionPlan)}>
              {SUBSCRIPTION_PLAN_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <select className={s.select} value={accessStatus} onChange={(e) => setAccessStatus(e.target.value as 'ACTIVE' | 'EXPIRED' | 'CANCELLED')}><option value="ACTIVE">Активен</option><option value="EXPIRED">Истек</option><option value="CANCELLED">Отключен</option></select>
            <input className={s.input} type="date" value={accessExpiresAt} onChange={(e) => setAccessExpiresAt(e.target.value)} />
            <input className={s.input} type="date" value={accessPaymentDate} onChange={(e) => setAccessPaymentDate(e.target.value)} />
            <select className={s.select} value={paymentSource} onChange={(e) => setPaymentSource(e.target.value as 'TRIBUTE' | 'MANUAL' | 'PROMO')}><option value="TRIBUTE">Tribute</option><option value="MANUAL">Manual</option><option value="PROMO">Promo</option></select>
            <input className={s.input} type="number" min={0} value={paymentAmount} onChange={(e) => setPaymentAmount(Number(e.target.value))} placeholder="Новый платеж, ₽" />
            <input className={s.input} type="number" min={0} value={accessLtv} onChange={(e) => setAccessLtv(Number(e.target.value))} placeholder="LTV, ₽" />
            <input className={s.input} value={externalId} onChange={(e) => setExternalId(e.target.value)} placeholder="Tribute ID / ссылка" />
            <input className={s.input} value={accessProjectLimit} onChange={(e) => setAccessProjectLimit(e.target.value)} placeholder="Override: лимит проектов" />
            <input className={s.input} value={accessDailyLimit} onChange={(e) => setAccessDailyLimit(e.target.value)} placeholder="Override: AI в день" />
            <input className={s.input} value={accessMonthlyLimit} onChange={(e) => setAccessMonthlyLimit(e.target.value)} placeholder="Override: AI в месяц" />
            <textarea className={s.textarea} value={accessNote} onChange={(e) => setAccessNote(e.target.value)} placeholder="Заметка администратора / Tribute" rows={3} />
          </div>
          <div className={s.actions}><button className={s.button} onClick={() => void handleUpdateSelectedAccess()} disabled={accessLoading}>Сохранить доступ</button></div>
        </section>

        <section className={s.panel}>
          <div className={s.panelTitle}>Credits override</div>
          <div className={s.formGrid}>
            <input className={s.input} type="number" value={creditsAmount} onChange={(e) => setCreditsAmount(Number(e.target.value))} placeholder="+100 или -50" />
            <input className={s.input} value={creditsReason} onChange={(e) => setCreditsReason(e.target.value)} placeholder="Причина корректировки" />
          </div>
          <div className={s.actions}><button className={s.secondaryButton} onClick={() => void handleAddCredits()} disabled={accessLoading || creditsAmount === 0}>Начислить / списать credits</button></div>
        </section>

        {renderProjects()}
        {renderSettings()}
      </div>
    );
  }

  function renderPage() {
    if (page === 'dashboard') return renderDashboard();
    if (page === 'users') return renderUsers();
    if (page === 'usage') return renderUsage();
    if (page === 'subscriptions') return renderSubscriptions();
    if (page === 'ai') return renderAIAnalytics();
    if (page === 'projects') return renderProjects();
    if (page === 'workflows') return renderWorkflows();
    if (page === 'prompts') return renderPrompts();
    if (page === 'errors') return renderErrors();
    if (page === 'settings') return renderSettings();
    return renderUserDetail();
  }

  return (
    <div className={s.root}>
      <header className={s.header}>
        <div>
          <h1 className={s.title}>Центр управления Luma IQ</h1>
          <div className={s.subtitle}>Бизнес-метрики, AI-экономика, пользователи и управление доступами</div>
        </div>
        <div className={s.headerActions}>
          {isAdmin && <button className={s.secondaryButton} onClick={() => setCreateOpen(true)}>Добавить пользователя</button>}
          <button className={s.button} onClick={() => void refreshAll()}>Обновить</button>
        </div>
      </header>

      <nav className={s.nav}>
        {PAGES.map((item) => (
          <button key={item.id} className={`${s.navItem}${page === item.id ? ' ' + s.navItemActive : ''}`} onClick={() => setPage(item.id)}>
            {item.label}
          </button>
        ))}
      </nav>

      <main className={s.content}>{renderPage()}</main>

      {createOpen && (
        <div className={s.modalBackdrop} onMouseDown={() => setCreateOpen(false)}>
          <div className={s.modal} onMouseDown={(e) => e.stopPropagation()}>
            <div className={s.modalHeader}>
              <div><h3>Добавить пользователя / выдать доступ</h3><p>Ручная выдача доступа после Tribute, промо или пилотной оплаты.</p></div>
              <button className={s.iconButton} onClick={() => setCreateOpen(false)}>×</button>
            </div>
            {renderSettings()}
          </div>
        </div>
      )}
    </div>
  );
}
