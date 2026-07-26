import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  adminApi,
  AdminAiEconomicsV2,
  AdminDashboard,
  AdminPlanCatalogItem,
  AdminPromptExperiment,
  AdminPromptRegistryItem,
  AdminPromptVersion,
  AdminTariffSimulation,
  AdminUserDetail,
  AdminUserListItem,
  AdminWorkflowRun,
  type AdminAiEconomicsAction,
  type AdminCommercialPlan,
  type AdminSubscriptionPlan,
} from '../../api/admin.api';
import { setAdminAccessTokenBackup } from '../../api/token-session';
import { useAuthStore } from '../../store/auth.store';
import {
  BreakdownBar,
  COMMERCIAL_PLAN_OPTIONS,
  Field,
  MetricCard,
  PAGES,
  PAYMENT_SOURCE_OPTIONS,
  SUBSCRIPTION_PLAN_OPTIONS,
  archiveClass,
  fmtDate,
  fmtMoney,
  fmtRole,
  fmtStatus,
  fmtTokens,
  planClass,
  statusClass,
  type Page,
  type SortKey,
} from './admin.shared';
import s from './Admin.module.css';

export default function Admin() {
  const navigate = useNavigate();
  const currentUser = useAuthStore((st) => st.user);
  const setTokens = useAuthStore((st) => st.setTokens);
  const isAdmin = currentUser?.role === 'ADMIN';
  const isAdminRef = useRef(isAdmin);
  const suppressAdminLoadErrorsRef = useRef(false);
  const adminLoadEpochRef = useRef(0);

  const [page, setPage] = useState<Page>('dashboard');
  const [previousPage, setPreviousPage] = useState<Page>('users');
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [adminPlans, setAdminPlans] = useState<AdminPlanCatalogItem[]>([]);
  const [editingPlan, setEditingPlan] = useState<AdminPlanCatalogItem | null>(null);
  const [planSaveLoading, setPlanSaveLoading] = useState(false);
  const [users, setUsers] = useState<AdminUserListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [workflows, setWorkflows] = useState<AdminWorkflowRun[]>([]);
  const [workflowTotal, setWorkflowTotal] = useState(0);
  const [workflowLoading, setWorkflowLoading] = useState(false);
  const [workflowUserId, setWorkflowUserId] = useState('');
  const [workflowProjectId, setWorkflowProjectId] = useState('');
  const [workflowName, setWorkflowName] = useState('');
  const [workflowStatus, setWorkflowStatus] = useState('');
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
  const [grantPlan, setGrantPlan] = useState<AdminCommercialPlan>('SYSTEM_FUNNEL');
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
  const [economics, setEconomics] = useState<AdminAiEconomicsV2 | null>(null);
  const [economicsLoading, setEconomicsLoading] = useState(false);
  const [economicsPlan, setEconomicsPlan] = useState('');
  const [economicsAction, setEconomicsAction] = useState('');
  const [economicsSection, setEconomicsSection] = useState('');
  const [economicsModel, setEconomicsModel] = useState('');
  const [economicsBatch, setEconomicsBatch] = useState('');
  const [economicsStatus, setEconomicsStatus] = useState('');
  const [economicsFrom, setEconomicsFrom] = useState(() => new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  const [economicsTo, setEconomicsTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [economicsUserId, setEconomicsUserId] = useState('');
  const [economicsProjectId, setEconomicsProjectId] = useState('');
  const [economicsPromptVersion, setEconomicsPromptVersion] = useState('');
  const [economicsPricingVersion, setEconomicsPricingVersion] = useState('');
  const [simulationPlan, setSimulationPlan] = useState('start');
  const [simulationAction, setSimulationAction] = useState('ai_chat');
  const [simulationCount, setSimulationCount] = useState(100);
  const [simulationMix, setSimulationMix] = useState<Record<string, number>>({});
  const [simulation, setSimulation] = useState<AdminTariffSimulation | null>(null);
  const [reconciliation, setReconciliation] = useState<{
    enabled: boolean;
    reason?: string;
    localCostUsd?: number;
    openAiCostUsd?: number;
    deltaUsd?: number;
    deltaPercent?: number;
    alert?: boolean;
  } | null>(null);

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
    if (!isAdmin) {
      suppressAdminLoadErrorsRef.current = true;
      adminLoadEpochRef.current += 1;
    }
  }, [isAdmin]);

  function beginAdminLoad(): number | null {
    if (!isAdminRef.current || suppressAdminLoadErrorsRef.current) return null;
    return adminLoadEpochRef.current;
  }

  function isActiveAdminLoad(loadEpoch: number): boolean {
    return loadEpoch === adminLoadEpochRef.current && isAdminRef.current && !suppressAdminLoadErrorsRef.current;
  }

  function showAdminLoadError(message: string, loadId?: number) {
    if (!isAdminRef.current || suppressAdminLoadErrorsRef.current) return;
    if (loadId && !isActiveAdminLoad(loadId)) return;
    toast.error(message);
  }

  async function loadDashboard() {
    const loadId = beginAdminLoad();
    if (loadId === null) return;
    try {
      const data = await adminApi.dashboard();
      if (!isActiveAdminLoad(loadId)) return;
      setDashboard(data);
    } catch {
      showAdminLoadError('Не удалось загрузить бизнес-метрики', loadId);
    }
  }

  async function loadPlans() {
    const loadId = beginAdminLoad();
    if (loadId === null) return;
    try {
      const data = await adminApi.plans();
      if (isActiveAdminLoad(loadId)) setAdminPlans(data);
    } catch {
      showAdminLoadError('Не удалось загрузить каталог тарифов', loadId);
    }
  }

  async function handleSavePlan() {
    if (!editingPlan || editingPlan.legacy) return;
    setPlanSaveLoading(true);
    try {
      await adminApi.updatePlan(
        editingPlan.code as 'START' | 'SYSTEM_FUNNEL' | 'EVERGREEN_FUNNEL',
        {
          isPublic: editingPlan.public,
          isPurchasable: editingPlan.purchasable,
          displayOrder: editingPlan.displayOrder,
          shortDescription: editingPlan.shortDescription,
          extendedDescription: editingPlan.extendedDescription,
        },
      );
      await loadPlans();
      setEditingPlan(null);
      toast.success('Настройки тарифа сохранены');
    } catch {
      toast.error('Не удалось сохранить настройки тарифа');
    } finally {
      setPlanSaveLoading(false);
    }
  }

  async function loadPrompts() {
    const loadId = beginAdminLoad();
    if (loadId === null) return;
    try {
      const data = await adminApi.prompts();
      if (!isActiveAdminLoad(loadId)) return;
      setPromptRegistry(data.registry);
      setPromptVersions(data.versions);
      setPromptExperiments(data.experiments);
      const first = data.registry[0];
      if (first && !promptWorkflow) {
        setPromptWorkflow(first.workflow);
        setPromptStep(first.step);
      }
    } catch {
      showAdminLoadError('Не удалось загрузить prompt CMS', loadId);
    }
  }

  async function loadUsers() {
    const loadId = beginAdminLoad();
    if (loadId === null) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await adminApi.listUsers({ q: q || undefined, plan, status, archive: archiveFilter, limit: 100 });
      if (!isActiveAdminLoad(loadId)) return;
      setUsers(data.users);
      setTotal(data.total);
    } catch {
      showAdminLoadError('Не удалось загрузить пользователей', loadId);
    } finally {
      if (isActiveAdminLoad(loadId)) setLoading(false);
    }
  }

  async function loadWorkflows(params?: { userId?: string; projectId?: string; workflow?: string; status?: string }) {
    const loadId = beginAdminLoad();
    if (loadId === null) return;
    setWorkflowLoading(true);
    try {
      const data = await adminApi.workflows({
        userId: (params?.userId ?? workflowUserId) || undefined,
        projectId: (params?.projectId ?? workflowProjectId) || undefined,
        workflow: (params?.workflow ?? workflowName) || undefined,
        status: (params?.status ?? workflowStatus) || undefined,
        limit: 50,
      });
      if (!isActiveAdminLoad(loadId)) return;
      setWorkflows(data.workflows);
      setWorkflowTotal(data.total);
    } catch {
      showAdminLoadError('Не удалось загрузить workflow history', loadId);
    } finally {
      if (isActiveAdminLoad(loadId)) setWorkflowLoading(false);
    }
  }

  async function loadEconomics(overrides?: Partial<{
    plan: string;
    actionKey: string;
    section: string;
    modelAlias: string;
    batch: string;
    status: string;
  }>) {
    const loadId = beginAdminLoad();
    if (loadId === null) return;
    setEconomicsLoading(true);
    try {
      const planFilter = overrides?.plan ?? economicsPlan;
      const actionFilter = overrides?.actionKey ?? economicsAction;
      const sectionFilter = overrides?.section ?? economicsSection;
      const modelFilter = overrides?.modelAlias ?? economicsModel;
      const batchFilter = overrides?.batch ?? economicsBatch;
      const statusFilter = overrides?.status ?? economicsStatus;
      const data = await adminApi.aiEconomicsV2({
        from: economicsFrom ? new Date(`${economicsFrom}T00:00:00`).toISOString() : undefined,
        to: economicsTo ? new Date(`${economicsTo}T23:59:59.999`).toISOString() : undefined,
        plan: planFilter || undefined,
        actionKey: actionFilter || undefined,
        section: sectionFilter || undefined,
        modelAlias: modelFilter || undefined,
        batch: batchFilter ? batchFilter === 'true' : undefined,
        status: statusFilter || undefined,
        userId: economicsUserId || undefined,
        projectId: economicsProjectId || undefined,
        promptVersion: economicsPromptVersion || undefined,
        actionPricingVersionId: economicsPricingVersion || undefined,
      });
      if (!isActiveAdminLoad(loadId)) return;
      setEconomics(data);
    } catch {
      showAdminLoadError('Не удалось загрузить AI-экономику V2', loadId);
    } finally {
      if (isActiveAdminLoad(loadId)) setEconomicsLoading(false);
    }
  }

  async function applyRecommendedPrice(action: AdminAiEconomicsAction) {
    const points = action.recommendation.recommendedAiPoints;
    const confirmation = `APPLY ${action.actionKey} ${points}`;
    const entered = window.prompt(`Для применения новой версии цены введите:\n${confirmation}`);
    if (entered !== confirmation) return;
    try {
      await adminApi.applyAiEconomicsPrice({
        actionKey: action.actionKey,
        aiPoints: points,
        sampleSize: action.recommendation.sampleSize,
        p90CostUsd: action.p90CostUsd,
        confirmation: entered,
      });
      toast.success(`Новая цена ${points} AI-баллов активирована`);
      await loadEconomics();
    } catch {
      toast.error('Не удалось применить новую цену');
    }
  }

  async function runTariffSimulation() {
    const actionMix = Object.keys(simulationMix).length
      ? simulationMix
      : { [simulationAction]: simulationCount };
    try {
      setSimulation(await adminApi.simulateAiTariff({ planId: simulationPlan, actionMix }));
    } catch {
      toast.error('Не удалось рассчитать тариф');
    }
  }

  async function reconcileCosts() {
    const to = new Date();
    const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    try {
      setReconciliation(await adminApi.reconcileAiCosts({
        from: from.toISOString(),
        to: to.toISOString(),
      }));
    } catch {
      toast.error('Не удалось сверить расходы OpenAI');
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
    void loadPlans();
  }, [currentUser, isAdmin, navigate]);

  useEffect(() => {
    if (page === 'workflows' && workflows.length === 0 && !workflowLoading) {
      void loadWorkflows();
    }
    if (page === 'ai' && !economics && !economicsLoading) {
      void loadEconomics();
    }
  }, [page, workflows.length, workflowLoading, economics, economicsLoading]);

  async function refreshAll() {
    if (!isAdmin) return;
    await Promise.all([loadDashboard(), loadUsers(), loadPrompts(), loadPlans()]);
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
    adminLoadEpochRef.current += 1;
    try {
      const { tokens } = await adminApi.impersonateUser(selected.id);
      const impersonatedUser = await setTokens(tokens.accessToken, tokens.csrfToken);
      // Set after setTokens, because normal auth token updates clear impersonation state.
      setAdminAccessTokenBackup({ mode: 'server-cookie' });
      toast.dismiss();
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

  function openSelectedUserWorkflows() {
    if (!selected) return;
    setWorkflowUserId(selected.id);
    setWorkflowProjectId('');
    setWorkflowName('');
    setWorkflowStatus('');
    setPage('workflows');
    void loadWorkflows({ userId: selected.id, projectId: '', workflow: '', status: '' });
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
            <thead><tr><th>Тариф</th><th>Пользователи</th><th>Выручка</th><th>AI cost</th><th>AI-бюджет</th><th>Бюджет</th><th>Маржа</th><th>Margin %</th></tr></thead>
            <tbody>
              {(dashboard?.ai.marginByPlan ?? []).map((item) => (
                <tr key={item.plan}>
                  <td><strong>{item.plan}</strong></td>
                  <td>{item.users}</td>
                  <td>{fmtMoney(item.revenueRub)}</td>
                  <td>{fmtMoney(item.aiCostUsd, 'USD')}</td>
                  <td>{fmtMoney(item.aiBudgetRub)}</td>
                  <td>{item.aiBudgetUsedPercent}% · {fmtMoney(item.aiBudgetDeltaRub)}</td>
                  <td>{fmtMoney(item.marginRub)}</td>
                  <td>{item.marginPercent}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className={s.panel}>
          <div className={s.panelTitle}>AI экономика по пользователям за 30 дней</div>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Пользователь</th>
                  <th>Тариф</th>
                  <th>AI-баллы</th>
                  <th>Токены</th>
                  <th>AI cost</th>
                  <th>Среднее / действие</th>
                  <th>AI-бюджет</th>
                </tr>
              </thead>
              <tbody>
                {(dashboard?.ai.userEconomics ?? []).map((item) => (
                  <tr key={item.userId}>
                    <td>
                      <strong>{item.name ?? 'Без имени'}</strong>
                      <div className={s.mutedText}>{item.email}</div>
                    </td>
                    <td><span className={planClass(item.plan)}>{item.plan}</span></td>
                    <td>{item.aiPointsUsed} · {item.requests} действий</td>
                    <td>{fmtTokens(item.tokens)}</td>
                    <td>{fmtMoney(item.aiCostUsd, 'USD')} · {fmtMoney(item.aiCostRub)}</td>
                    <td>{fmtTokens(item.avgTokensPerRequest)} ток. · {fmtMoney(item.avgCostRub)} · {item.avgAiPointsPerAction} баллов</td>
                    <td>{item.aiBudgetUsedPercent}% · {fmtMoney(item.aiBudgetDeltaRub)} из {fmtMoney(item.aiBudgetRub)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {dashboard?.ai.userEconomics.length === 0 && <div className={s.emptyState}>За последние 30 дней нет успешных AI-действий</div>}
          </div>
        </section>

        <section className={s.panel}>
          <div className={s.panelTitle}>AI экономика по типам действий за 30 дней</div>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Действие</th>
                  <th>Раздел</th>
                  <th>Запросы</th>
                  <th>Средние токены</th>
                  <th>Средняя стоимость</th>
                  <th>Среднее списание</th>
                  <th>Всего</th>
                </tr>
              </thead>
              <tbody>
                {(dashboard?.ai.actionEconomics ?? []).map((item) => (
                  <tr key={item.actionType}>
                    <td><strong>{item.actionLabel}</strong><div className={s.mutedText}>{item.actionType}</div></td>
                    <td>{item.sectionLabel}</td>
                    <td>{item.requests}</td>
                    <td>{fmtTokens(item.avgTokensPerRequest)}</td>
                    <td>{fmtMoney(item.avgCostUsd, 'USD')} · {fmtMoney(item.avgCostRub)}</td>
                    <td>{item.avgAiPoints} AI-баллов</td>
                    <td>{fmtMoney(item.costUsd, 'USD')} · {fmtTokens(item.tokens)} ток.</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {dashboard?.ai.actionEconomics.length === 0 && <div className={s.emptyState}>За последние 30 дней нет успешных AI-действий</div>}
          </div>
          <div className={s.emptyState}>Таблицу стоимости действий нужно пересмотреть после 10-20 платящих пользователей: сравнить средние токены, среднюю себестоимость и среднее списание AI-баллов.</div>
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
    const totals = economics?.totals;
    const actionOptions = economics?.actions ?? [];
    return (
      <div className={s.detailStack}>
        <section className={s.panel}>
          <div className={s.panelTitle}>AI-экономика V2</div>
          <div className={s.filters}>
            <input className={s.select} type="date" value={economicsFrom} onChange={(e) => setEconomicsFrom(e.target.value)} title="Начало периода" />
            <input className={s.select} type="date" value={economicsTo} onChange={(e) => setEconomicsTo(e.target.value)} title="Конец периода" />
            <select className={s.select} value={economicsPlan} onChange={(e) => setEconomicsPlan(e.target.value)}>
              <option value="">Все тарифы</option>
              {['START', 'SYSTEM_FUNNEL', 'EVERGREEN_FUNNEL', 'PRO', 'EXPERT', 'SUPPORT', 'MARKETING_PARTNER', 'IMPLEMENTATION'].map((value) => <option key={value}>{value}</option>)}
            </select>
            <select className={s.select} value={economicsAction} onChange={(e) => setEconomicsAction(e.target.value)}>
              <option value="">Все действия</option>
              {actionOptions.map((item) => <option key={item.actionKey} value={item.actionKey}>{item.actionLabel}</option>)}
            </select>
            <select className={s.select} value={economicsSection} onChange={(e) => setEconomicsSection(e.target.value)}>
              <option value="">Все разделы</option>
              {['Диалог с ИИ', 'Стратегия', 'Конструктор продуктов', 'Контент', 'Другое'].map((value) => <option key={value}>{value}</option>)}
            </select>
            <select className={s.select} value={economicsModel} onChange={(e) => setEconomicsModel(e.target.value)}>
              <option value="">Все модели</option>
              {['SOL', 'TERRA', 'LUNA'].map((value) => <option key={value}>{value}</option>)}
            </select>
            <select className={s.select} value={economicsBatch} onChange={(e) => setEconomicsBatch(e.target.value)}>
              <option value="">Batch и realtime</option>
              <option value="true">Только Batch</option>
              <option value="false">Только realtime</option>
            </select>
            <select className={s.select} value={economicsStatus} onChange={(e) => setEconomicsStatus(e.target.value)}>
              <option value="">Все статусы</option>
              <option value="SUCCEEDED">SUCCEEDED</option>
              <option value="FAILED">FAILED</option>
              <option value="TIMEOUT">TIMEOUT</option>
            </select>
            <input className={s.select} value={economicsUserId} onChange={(e) => setEconomicsUserId(e.target.value)} placeholder="User ID" />
            <input className={s.select} value={economicsProjectId} onChange={(e) => setEconomicsProjectId(e.target.value)} placeholder="Project ID" />
            <input className={s.select} value={economicsPromptVersion} onChange={(e) => setEconomicsPromptVersion(e.target.value)} placeholder="Prompt version" />
            <input className={s.select} value={economicsPricingVersion} onChange={(e) => setEconomicsPricingVersion(e.target.value)} placeholder="Action price version ID" />
            <button className={s.button} onClick={() => void loadEconomics()} disabled={economicsLoading}>
              {economicsLoading ? 'Загружаю...' : 'Применить'}
            </button>
          </div>
          <div className={s.metricsGridSmall}>
            <MetricCard label="Pipeline runs" value={totals?.pipelineRuns ?? 0} hint={`${totals?.failed ?? 0} ошибок`} />
            <MetricCard label="Фактический расход" value={fmtMoney(totals?.costUsd ?? 0, 'USD')} hint={`${totals?.aiPoints ?? 0} AI-баллов`} />
            <MetricCard label="P90 запуска" value={fmtMoney(totals?.p90CostUsd ?? 0, 'USD')} hint={`P95 ${fmtMoney(totals?.p95CostUsd ?? 0, 'USD')}`} />
            <MetricCard label="Стоимость балла" value={fmtMoney(totals?.costPerPointUsd ?? 0, 'USD')} hint={`P90 ${fmtMoney(totals?.p90CostPerPointUsd ?? 0, 'USD')}`} />
            <MetricCard label="Cache hit" value={`${Math.round((totals?.cacheHitRate ?? 0) * 100)}%`} hint={`экономия ${fmtMoney(totals?.cacheSavingsUsd ?? 0, 'USD')}`} />
            <MetricCard label="Batch" value={fmtMoney(totals?.batchSavingsUsd ?? 0, 'USD')} hint={`${totals?.retries ?? 0} повторов`} />
          </div>
        </section>

        <section className={s.panel}>
          <div className={s.panelTitle}>Стоимость по AI-действиям</div>
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Действие</th><th>Запуски</th><th>P50 / P90 / P95</th><th>Баллы</th>
                  <th>Токены в среднем</th><th>Кэш / ошибки</th><th>Модели</th><th>Рекомендация</th>
                </tr>
              </thead>
              <tbody>
                {actionOptions.map((item) => (
                  <tr key={item.actionKey}>
                    <td><strong>{item.actionLabel}</strong><br /><small>{item.sectionLabel} · {item.actionKey}</small></td>
                    <td>{item.runs}<br /><small>{item.succeeded} успешно</small></td>
                    <td>{fmtMoney(item.p50CostUsd, 'USD')} / {fmtMoney(item.p90CostUsd, 'USD')} / {fmtMoney(item.p95CostUsd, 'USD')}</td>
                    <td>{item.currentAiPoints}<br /><small>{fmtMoney(item.avgCostPerPointUsd, 'USD')} / балл</small></td>
                    <td>
                      in {fmtTokens(item.avgTokens.input)} · cache {fmtTokens(item.avgTokens.cached)}<br />
                      <small>out {fmtTokens(item.avgTokens.output)} · reason {fmtTokens(item.avgTokens.reasoning)} · audio {fmtTokens(item.avgTokens.audioInput + item.avgTokens.audioOutput)}</small>
                    </td>
                    <td>{Math.round(item.cacheHitRate * 100)}% / {Math.round(item.errorRate * 100)}%<br /><small>{item.retries} retry · {item.refunds} refund</small></td>
                    <td>{item.modelShares.map((model) => `${model.alias} ${Math.round(model.share * 100)}%`).join(' · ') || '—'}</td>
                    <td>
                      <strong>{item.recommendation.recommendedAiPoints} баллов</strong><br />
                      <small>{item.recommendation.sampleSize} результатов</small><br />
                      <button
                        className={s.secondaryButton}
                        disabled={!item.recommendation.reliable || item.recommendation.recommendedAiPoints === item.currentAiPoints}
                        onClick={() => void applyRecommendedPrice(item)}
                        title={item.recommendation.reason ?? item.recommendation.formula}
                      >
                        Применить
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!economicsLoading && actionOptions.length === 0 && <div className={s.emptyState}>За выбранный период данных пока нет.</div>}
        </section>

        <section className={s.panel}>
          <div className={s.panelTitle}>Предупреждения</div>
          {(economics?.alerts ?? []).map((alert, index) => (
            <div className={s.listItem} key={`${alert.type}-${index}`}>
              <strong>{alert.type}</strong>
              <span>{alert.email ? `${alert.email} · ` : ''}{alert.message}</span>
            </div>
          ))}
          {(economics?.alerts.length ?? 0) === 0 && <div className={s.emptyState}>Отклонений от плановой экономики не найдено.</div>}
        </section>

        <section className={s.panel}>
          <div className={s.panelTitle}>Симулятор тарифа</div>
          <div className={s.filters}>
            <select className={s.select} value={simulationPlan} onChange={(e) => setSimulationPlan(e.target.value)}>
              {['start', 'pro', 'expert', 'support', 'marketing_partner', 'implementation'].map((value) => <option key={value}>{value}</option>)}
            </select>
            <select className={s.select} value={simulationAction} onChange={(e) => setSimulationAction(e.target.value)}>
              {(economics?.actions ?? []).map((item) => <option key={item.actionKey} value={item.actionKey}>{item.actionLabel}</option>)}
              {(economics?.actions.length ?? 0) === 0 && <option value="ai_chat">Диалог с ИИ</option>}
            </select>
            <input className={s.select} type="number" min="0" value={simulationCount} onChange={(e) => setSimulationCount(Number(e.target.value))} />
            <button
              className={s.secondaryButton}
              onClick={() => setSimulationMix((current) => ({ ...current, [simulationAction]: simulationCount }))}
            >
              Добавить в сценарий
            </button>
            <button className={s.button} onClick={() => void runTariffSimulation()}>Рассчитать</button>
          </div>
          {Object.entries(simulationMix).length > 0 && (
            <div className={s.emptyState}>
              {Object.entries(simulationMix).map(([key, count]) => `${key}: ${count}`).join(' · ')}
              {' · '}<button className={s.secondaryButton} onClick={() => setSimulationMix({})}>Очистить</button>
            </div>
          )}
          {simulation && (
            <>
              <div className={s.metricsGridSmall}>
                <MetricCard label={simulation.plan.name} value={`${simulation.package.aiPoints} AI-баллов`} hint={`${simulation.package.remainingPoints} останется`} />
                <MetricCard label="Оценка AI-расхода" value={`${simulation.package.estimatedAiCostRub} ₽`} hint={`бюджет ${simulation.package.budgetRub} ₽`} />
              </div>
              <table className={s.table}>
                <thead><tr><th>Использование</th><th>AI-баллы</th><th>Расход</th><th>В бюджете</th></tr></thead>
                <tbody>{simulation.forecasts.map((item) => (
                  <tr key={item.utilization}><td>{item.utilization}%</td><td>{item.aiPoints}</td><td>{item.estimatedAiCostRub} ₽</td><td>{item.withinBudget ? 'Да' : 'Нет'}</td></tr>
                ))}</tbody>
              </table>
            </>
          )}
        </section>

        <section className={s.panel}>
          <div className={s.panelTitle}>Сверка расходов OpenAI</div>
          <button className={s.secondaryButton} onClick={() => void reconcileCosts()}>Сверить последние 30 дней</button>
          {reconciliation && (
            <div className={s.emptyState}>
              {!reconciliation.enabled
                ? `Сверка отключена: ${reconciliation.reason}`
                : `Локально ${fmtMoney(reconciliation.localCostUsd ?? 0, 'USD')} · OpenAI ${fmtMoney(reconciliation.openAiCostUsd ?? 0, 'USD')} · отклонение ${reconciliation.deltaPercent ?? 0}%${reconciliation.alert ? ' · требует проверки' : ''}`}
            </div>
          )}
        </section>
      </div>
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
      <div className={s.detailStack}>
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

        <section className={s.panel}>
          <div className={s.panelTitle}>Workflow history</div>
          <div className={s.filters}>
            <input className={s.input} value={workflowUserId} onChange={(e) => setWorkflowUserId(e.target.value)} placeholder="User ID" />
            <input className={s.input} value={workflowProjectId} onChange={(e) => setWorkflowProjectId(e.target.value)} placeholder="Project ID" />
            <input className={s.input} value={workflowName} onChange={(e) => setWorkflowName(e.target.value)} placeholder="workflow, например product.main" />
            <select className={s.select} value={workflowStatus} onChange={(e) => setWorkflowStatus(e.target.value)}>
              <option value="">Все статусы</option>
              <option value="RUNNING">RUNNING</option>
              <option value="SUCCEEDED">SUCCEEDED</option>
              <option value="SUCCEEDED_WITH_WARNINGS">SUCCEEDED_WITH_WARNINGS</option>
              <option value="FAILED">FAILED</option>
              <option value="CANCELED">CANCELED</option>
            </select>
            <button className={s.button} onClick={() => void loadWorkflows()} disabled={workflowLoading}>{workflowLoading ? 'Загружаю...' : 'Применить'}</button>
            <button
              className={s.secondaryButton}
              onClick={() => {
                setWorkflowUserId('');
                setWorkflowProjectId('');
                setWorkflowName('');
                setWorkflowStatus('');
                void loadWorkflows({ userId: '', projectId: '', workflow: '', status: '' });
              }}
              disabled={workflowLoading}
            >
              Сбросить
            </button>
          </div>

          <div className={s.list}>
            {workflows.map((run) => (
              <details key={run.id} className={s.listItem} open={run.status === 'FAILED'}>
                <summary>
                  <strong>{run.workflow}</strong>
                  <span>
                    <span className={statusClass(run.status)}>{run.status}</span>
                    {' · '}{run.user.email}
                    {' · '}{run.project.name}
                    {' · '}{fmtDate(run.createdAt)}
                    {' · '}{fmtTokens(run.totals.tokens)} ток.
                    {' · '}{fmtMoney(run.totals.costUsd, 'USD')}
                  </span>
                </summary>

                <div className={s.metricsGridSmall}>
                  <MetricCard label="Steps" value={run.totals.steps} hint={`${run.totals.generations} generations`} />
                  <MetricCard label="Artifacts" value={run.totals.artifacts} />
                  <MetricCard label="Tokens" value={fmtTokens(run.totals.tokens)} />
                  <MetricCard label="Cost" value={fmtMoney(run.totals.costUsd, 'USD')} hint={fmtMoney(run.totals.costRub)} />
                </div>

                {run.errors.length > 0 && (
                  <div className={s.emptyState}>
                    {run.errors.map((error, index) => (
                      <div key={`${run.id}-error-${index}`}>{error.type} {error.step ? `· ${error.step}` : ''}: {error.message}</div>
                    ))}
                  </div>
                )}

                <div className={s.tableWrap}>
                  <table className={s.table}>
                    <thead><tr><th>Step</th><th>Status</th><th>Model</th><th>Tokens</th><th>Cost</th><th>Artifacts</th><th>Error</th></tr></thead>
                    <tbody>
                      {run.steps.map((step) => {
                        const generation = step.generations[0];
                        return (
                          <tr key={step.id}>
                            <td><strong>{step.step}</strong><div className={s.mutedText}>{step.latencyMs ? `${Math.round(step.latencyMs / 1000)}s` : '—'} · retry {step.retryCount}</div></td>
                            <td><span className={statusClass(step.status)}>{step.status}</span></td>
                            <td>{generation ? `${generation.provider} / ${generation.model}` : '—'}</td>
                            <td>{fmtTokens(generation?.totalTokens ?? 0)}</td>
                            <td>{fmtMoney(generation?.actualCostUsd ?? 0, 'USD')}</td>
                            <td>{step.artifacts.map((artifact) => artifact.title || artifact.type).join(', ') || '—'}</td>
                            <td>{step.error || generation?.errorMessage || generation?.errorCode || '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {run.artifacts.length > 0 && (
                  <div className={s.mutedText}>
                    Artifacts: {run.artifacts.map((artifact) => `${artifact.type}${artifact.title ? `: ${artifact.title}` : ''}`).join(' · ')}
                  </div>
                )}
              </details>
            ))}
            {workflowLoading && <div className={s.emptyState}>Загружаю workflow history...</div>}
            {!workflowLoading && workflows.length === 0 && <div className={s.emptyState}>Workflow runs не найдены</div>}
          </div>
          <div className={s.tableFooter}>Показано: {workflows.length} · всего: {workflowTotal}</div>
        </section>
      </div>
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
      <div className={s.detailStack}>
      <section className={s.panel}>
        <div className={s.panelTitle}>Каталог тарифов</div>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead><tr><th>Код</th><th>Название</th><th>Цена / период</th><th>AI-баллы</th><th>Проекты</th><th>Пользователи</th><th>Статус</th><th>Изменён</th><th></th></tr></thead>
            <tbody>
              {adminPlans.map((planItem) => (
                <tr key={planItem.code}>
                  <td><strong>{planItem.code}</strong></td>
                  <td>{planItem.name}</td>
                  <td>{fmtMoney(planItem.priceRub)} / {planItem.periodDays} дней</td>
                  <td>{fmtTokens(planItem.aiPoints)}</td>
                  <td>{planItem.activeProjectsLimit}</td>
                  <td>{planItem.activeUsers} активных / {planItem.users} всего</td>
                  <td>
                    <span className={planItem.public ? statusClass('ACTIVE') : s.badge}>
                      {planItem.legacy ? 'legacy' : planItem.purchasable ? 'публичный' : 'внутренний'}
                    </span>
                  </td>
                  <td>{planItem.updatedAt ? fmtDate(planItem.updatedAt) : 'Конфигурация'}</td>
                  <td>
                    {!planItem.legacy && planItem.code !== 'FREE' && (
                      <button className={s.secondaryButton} onClick={() => setEditingPlan({ ...planItem })}>Изменить</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {editingPlan && (
          <div className={s.detailStack}>
            <div className={s.panelTitle}>{editingPlan.name} · {editingPlan.code}</div>
            <div className={s.formGrid}>
              <Field label="Публичное отображение" hint="Тариф появится на публичной странице, если также разрешены покупки.">
                <select className={s.select} value={editingPlan.public ? 'yes' : 'no'} onChange={(event) => setEditingPlan({ ...editingPlan, public: event.target.value === 'yes' })}>
                  <option value="yes">Показывать</option><option value="no">Скрыть</option>
                </select>
              </Field>
              <Field label="Новые покупки" hint="Можно временно остановить checkout без удаления тарифа.">
                <select className={s.select} value={editingPlan.purchasable ? 'yes' : 'no'} onChange={(event) => setEditingPlan({ ...editingPlan, purchasable: event.target.value === 'yes' })}>
                  <option value="yes">Разрешены</option><option value="no">Запрещены</option>
                </select>
              </Field>
              <Field label="Порядок" hint="Чем меньше число, тем левее карточка.">
                <input className={s.input} type="number" min={1} max={100} value={editingPlan.displayOrder} onChange={(event) => setEditingPlan({ ...editingPlan, displayOrder: Number(event.target.value) })} />
              </Field>
              <Field label="Короткое описание" hint="Текст в верхней части карточки тарифа.">
                <textarea className={s.textarea} rows={2} value={editingPlan.shortDescription} onChange={(event) => setEditingPlan({ ...editingPlan, shortDescription: event.target.value })} />
              </Field>
              <Field label="Расширенное описание" hint="Подробный текст в раскрывающемся блоке.">
                <textarea className={s.textarea} rows={4} value={editingPlan.extendedDescription} onChange={(event) => setEditingPlan({ ...editingPlan, extendedDescription: event.target.value })} />
              </Field>
            </div>
            <div className={s.actions}>
              <button className={s.button} onClick={() => void handleSavePlan()} disabled={planSaveLoading}>Сохранить тариф</button>
              <button className={s.secondaryButton} onClick={() => setEditingPlan(null)} disabled={planSaveLoading}>Отмена</button>
            </div>
          </div>
        )}
        <div className={s.emptyState}>Стабильные коды, цены, AI-баллы и лимиты проектов защищены от случайного редактирования. Изменения карточек фиксируются в audit log.</div>
      </section>
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
      </div>
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
            <button className={s.secondaryButton} onClick={openSelectedUserWorkflows}>Workflow history</button>
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
