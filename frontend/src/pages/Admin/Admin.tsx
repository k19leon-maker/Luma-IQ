import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { adminApi, AdminDashboard, AdminUserDetail, AdminUserListItem } from '../../api/admin.api';
import { useAuthStore } from '../../store/auth.store';
import s from './Admin.module.css';

type Page = 'dashboard' | 'users' | 'usage' | 'subscriptions' | 'ai' | 'projects' | 'workflows' | 'errors' | 'settings' | 'user-detail';
type SortKey = 'aiCostUsd' | 'tokens' | 'ltv' | 'lastActivityAt' | 'createdAt' | 'aiRequestCount';

const PAGES: Array<{ id: Page; label: string }> = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'users', label: 'Users' },
  { id: 'usage', label: 'Usage & Costs' },
  { id: 'subscriptions', label: 'Subscriptions' },
  { id: 'ai', label: 'AI Analytics' },
  { id: 'projects', label: 'Projects' },
  { id: 'workflows', label: 'Workflows' },
  { id: 'errors', label: 'Errors' },
  { id: 'settings', label: 'Settings' },
];

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
  if (plan === 'PRO' || plan === 'ANNUAL') return `${s.badge} ${s.badgePro}`;
  return s.badge;
}

function statusClass(status: string): string {
  if (status === 'ACTIVE') return `${s.badge} ${s.badgeSuccess}`;
  if (status === 'EXPIRED' || status === 'FAILED') return `${s.badge} ${s.badgeDanger}`;
  return s.badge;
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

export default function Admin() {
  const navigate = useNavigate();
  const currentUser = useAuthStore((st) => st.user);
  const setTokens = useAuthStore((st) => st.setTokens);
  const isAdmin = currentUser?.role === 'ADMIN';

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
  const [sortKey, setSortKey] = useState<SortKey>('aiCostUsd');
  const [createOpen, setCreateOpen] = useState(false);
  const [impersonateLoading, setImpersonateLoading] = useState(false);

  const [grantEmail, setGrantEmail] = useState('');
  const [grantName, setGrantName] = useState('');
  const [grantPassword, setGrantPassword] = useState('');
  const [grantPlan, setGrantPlan] = useState<'PRO' | 'ANNUAL'>('PRO');
  const [grantMonths, setGrantMonths] = useState(1);
  const [paymentSource, setPaymentSource] = useState<'TRIBUTE' | 'MANUAL' | 'PROMO'>('TRIBUTE');
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [externalId, setExternalId] = useState('');
  const [adminNote, setAdminNote] = useState('');
  const [grantLoading, setGrantLoading] = useState(false);

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => {
      if (sortKey === 'createdAt' || sortKey === 'lastActivityAt') return new Date(b[sortKey]).getTime() - new Date(a[sortKey]).getTime();
      return Number(b[sortKey] ?? 0) - Number(a[sortKey] ?? 0);
    });
  }, [users, sortKey]);

  const selectedProjects = selected?.projects ?? [];
  const maxFeatureCost = Math.max(...(dashboard?.ai.byFeature.map((item) => item.costUsd) ?? [0]), 0);
  const maxModelCost = Math.max(...(dashboard?.ai.byModel.map((item) => item.costUsd) ?? [0]), 0);

  async function loadDashboard() {
    try {
      setDashboard(await adminApi.dashboard());
    } catch {
      toast.error('Не удалось загрузить business metrics');
    }
  }

  async function loadUsers() {
    setLoading(true);
    try {
      const data = await adminApi.listUsers({ q: q || undefined, plan, status, limit: 100 });
      setUsers(data.users);
      setTotal(data.total);
    } catch {
      toast.error('Не удалось загрузить users');
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
    } catch {
      toast.error('Не удалось загрузить user detail');
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    void loadDashboard();
    void loadUsers();
  }, []);

  async function refreshAll() {
    await Promise.all([loadDashboard(), loadUsers()]);
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
      toast.success(`Access ${result.subscription.plan} активирован`);
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
    try {
      const currentAccess = localStorage.getItem('accessToken');
      const currentRefresh = localStorage.getItem('refreshToken');
      if (currentAccess && currentRefresh) {
        localStorage.setItem('adminAccessTokenBackup', currentAccess);
        localStorage.setItem('adminRefreshTokenBackup', currentRefresh);
      }
      const { tokens } = await adminApi.impersonateUser(selected.id);
      setTokens(tokens.accessToken, tokens.refreshToken);
      toast.success(`Вы вошли как ${selected.email}`);
      navigate('/dashboard');
    } catch {
      toast.error('Не удалось войти под пользователем');
    } finally {
      setImpersonateLoading(false);
    }
  }

  function renderDashboard() {
    const m = dashboard?.metrics;
    return (
      <>
        <div className={s.metricsGrid}>
          <MetricCard label="Total Users" value={m?.totalUsers ?? '—'} hint={`${m?.newUsers7d ?? 0} new 7d · ${m?.newUsers30d ?? 0} new 30d`} />
          <MetricCard label="Active Users" value={m?.activeUsers30d ?? '—'} hint="30d AI activity" />
          <MetricCard label="MRR / Revenue" value={fmtMoney(m?.revenue ?? 0)} hint={`Avg LTV ${fmtMoney(m?.averageLtv ?? 0)}`} />
          <MetricCard label="AI Cost 30d" value={fmtMoney(m?.totalAiCostUsd ?? 0, 'USD')} hint={`${fmtMoney(m?.avgAiCostPerUserUsd ?? 0, 'USD')} / active user`} />
          <MetricCard label="Requests Today" value={m?.aiToday ?? 0} hint={`${m?.generationsToday ?? 0} generations`} />
          <MetricCard label="Tokens Today" value={fmtTokens(m?.tokensToday ?? 0)} hint="all providers" />
          <MetricCard label="Most Used Feature" value={m?.mostUsedFeature ?? '—'} hint="by requests/cost" />
          <MetricCard label="Estimated Margin" value={fmtMoney(m?.estimatedMarginRub ?? 0)} hint={`${m?.estimatedMarginPercent ?? 0}% gross margin`} />
        </div>

        <div className={s.twoCol}>
          <section className={s.panel}>
            <div className={s.panelTitle}>Revenue vs AI Cost</div>
            <div className={s.economics}>
              <div><span>Revenue</span><strong>{fmtMoney(m?.revenue ?? 0)}</strong></div>
              <div><span>AI Cost</span><strong>{fmtMoney(m?.totalAiCostUsd ?? 0, 'USD')}</strong></div>
              <div><span>Estimated Margin</span><strong>{fmtMoney(m?.estimatedMarginRub ?? 0)}</strong></div>
            </div>
          </section>
          <section className={s.panel}>
            <div className={s.panelTitle}>Feature Cost Breakdown</div>
            {(dashboard?.ai.byFeature ?? []).slice(0, 6).map((item) => (
              <BreakdownBar key={item.featureCode} label={item.featureCode} value={item.costUsd} max={maxFeatureCost} right={`${fmtMoney(item.costUsd, 'USD')} · ${item.requests}`} />
            ))}
            {dashboard?.ai.byFeature.length === 0 && <div className={s.emptyState}>No AI usage yet</div>}
          </section>
        </div>
      </>
    );
  }

  function renderUsers() {
    return (
      <section className={s.panel}>
        <div className={s.filters}>
          <input className={s.search} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void loadUsers()} placeholder="Search by name or email" />
          <select className={s.select} value={plan} onChange={(e) => setPlan(e.target.value)}>
            <option value="ALL">All plans</option><option value="FREE">Free</option><option value="PRO">Pro</option><option value="ANNUAL">Annual</option>
          </select>
          <select className={s.select} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="ALL">All status</option><option value="ACTIVE">Active users</option><option value="INACTIVE">Inactive users</option><option value="HIGH_COST">High cost users</option>
          </select>
          <select className={s.select} value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
            <option value="aiCostUsd">Sort: AI Cost</option><option value="tokens">Sort: Tokens</option><option value="ltv">Sort: LTV</option><option value="aiRequestCount">Sort: Requests</option><option value="lastActivityAt">Sort: Last Activity</option>
          </select>
          <button className={s.button} onClick={() => void loadUsers()}>Apply</button>
        </div>

        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Name</th><th>Email</th><th>Role</th><th>Plan</th><th>Status</th><th>Projects</th><th>AI Requests</th><th>Tokens</th><th>AI Cost</th><th>Revenue / LTV</th><th>Margin</th><th>Last Activity</th><th>Created</th>
              </tr>
            </thead>
            <tbody>
              {sortedUsers.map((user) => (
                <tr key={user.id} onClick={() => void openUser(user)} className={s.row}>
                  <td><strong>{user.name ?? 'No name'}</strong></td>
                  <td>{user.email}</td>
                  <td><span className={user.role === 'ADMIN' ? `${s.badge} ${s.badgeAdmin}` : s.badge}>{user.role}</span></td>
                  <td><span className={planClass(user.subscription.plan)}>{user.subscription.plan}</span></td>
                  <td><span className={statusClass(user.subscription.status)}>{user.subscription.status}</span></td>
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
          {loading && <div className={s.emptyState}>Loading users...</div>}
          {!loading && sortedUsers.length === 0 && <div className={s.emptyState}>No users found</div>}
        </div>
        <div className={s.tableFooter}>{sortedUsers.length} shown · {total} total</div>
      </section>
    );
  }

  function renderUsage() {
    return (
      <div className={s.twoCol}>
        <section className={s.panel}>
          <div className={s.panelTitle}>Cost per Feature</div>
          {(dashboard?.ai.byFeature ?? []).map((item) => (
            <BreakdownBar key={item.featureCode} label={item.featureCode} value={item.costUsd} max={maxFeatureCost} right={`${fmtMoney(item.costUsd, 'USD')} · ${fmtTokens(item.tokens)} tokens`} />
          ))}
        </section>
        <section className={s.panel}>
          <div className={s.panelTitle}>Cost per Model</div>
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
        <div className={s.panelTitle}>Most Expensive Workflows</div>
        <table className={s.table}>
          <thead><tr><th>Workflow / Feature</th><th>Requests</th><th>Tokens</th><th>Total Cost</th><th>Avg Cost</th><th>Avg Time</th></tr></thead>
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
        <div className={s.panelTitle}>Projects {selected ? `· ${selected.email}` : ''}</div>
        {!selected && <div className={s.emptyState}>Open a user to inspect project health and AI usage per project.</div>}
        {selected && (
          <table className={s.table}>
            <thead><tr><th>Project</th><th>Owner</th><th>Stage</th><th>Health</th><th>AI Usage</th><th>Generated Assets</th><th>Last Activity</th></tr></thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.id}>
                  <td><strong>{project.name}</strong></td>
                  <td>{selected.email}</td>
                  <td>{project.currentStage}</td>
                  <td>{project.health}%</td>
                  <td>{project.aiRequests} req · {fmtMoney(project.aiCostUsd, 'USD')}</td>
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
        <div className={s.panelTitle}>Workflow Health</div>
        <table className={s.table}>
          <thead><tr><th>Workflow</th><th>Runs</th><th>Success Rate</th><th>Failures</th><th>Retries</th><th>Avg Duration</th></tr></thead>
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

  function renderSubscriptions() {
    return (
      <section className={s.panel}>
        <div className={s.panelTitle}>Subscriptions</div>
        <div className={s.metricsGridSmall}>
          <MetricCard label="Active paid" value={dashboard?.metrics.activePro ?? 0} />
          <MetricCard label="Total revenue" value={fmtMoney(dashboard?.metrics.revenue ?? 0)} />
          <MetricCard label="Average LTV" value={fmtMoney(dashboard?.metrics.averageLtv ?? 0)} />
          <MetricCard label="Margin" value={`${dashboard?.metrics.estimatedMarginPercent ?? 0}%`} />
        </div>
        {renderUsers()}
      </section>
    );
  }

  function renderErrors() {
    const failed = dashboard?.ai.byStatus.filter((item) => item.status !== 'success' && item.status !== 'SUCCEEDED') ?? [];
    return (
      <section className={s.panel}>
        <div className={s.panelTitle}>Errors & Risk</div>
        <div className={s.metricsGridSmall}>
          {failed.map((item) => <MetricCard key={item.status} label={item.status} value={item.count} />)}
          {failed.length === 0 && <MetricCard label="Failed generations" value="0" hint="No critical failures in aggregate view" />}
        </div>
        <div className={s.emptyState}>Raw event logs are hidden from business UI. Use developer/debug tooling only when investigating incidents.</div>
      </section>
    );
  }

  function renderSettings() {
    return (
      <section className={s.panel}>
        <div className={s.panelTitle}>Access Management</div>
        <div className={s.formGrid}>
          <input className={s.input} value={grantEmail} onChange={(e) => setGrantEmail(e.target.value)} placeholder="Email" />
          <input className={s.input} value={grantName} onChange={(e) => setGrantName(e.target.value)} placeholder="Name" />
          <input className={s.input} value={grantPassword} onChange={(e) => setGrantPassword(e.target.value)} placeholder="Password for new account" />
          <select className={s.select} value={grantPlan} onChange={(e) => setGrantPlan(e.target.value as 'PRO' | 'ANNUAL')}><option value="PRO">PRO</option><option value="ANNUAL">ANNUAL</option></select>
          <input className={s.input} type="number" min={1} max={24} value={grantMonths} onChange={(e) => setGrantMonths(Number(e.target.value))} />
          <select className={s.select} value={paymentSource} onChange={(e) => setPaymentSource(e.target.value as 'TRIBUTE' | 'MANUAL' | 'PROMO')}><option value="TRIBUTE">Tribute</option><option value="MANUAL">Manual</option><option value="PROMO">Promo</option></select>
          <input className={s.input} type="number" min={0} value={paymentAmount} onChange={(e) => setPaymentAmount(Number(e.target.value))} placeholder="Amount, ₽" />
          <input className={s.input} value={externalId} onChange={(e) => setExternalId(e.target.value)} placeholder="Tribute ID / link" />
          <textarea className={s.textarea} value={adminNote} onChange={(e) => setAdminNote(e.target.value)} placeholder="Payment note" rows={3} />
        </div>
        <div className={s.actions}><button className={s.button} onClick={() => void handleGrant()} disabled={grantLoading || !grantEmail}>{grantLoading ? 'Saving...' : 'Create / Extend Access'}</button></div>
      </section>
    );
  }

  function renderUserDetail() {
    if (detailLoading) return <section className={s.panel}><div className={s.emptyState}>Loading user...</div></section>;
    if (!selected) return <section className={s.panel}><div className={s.emptyState}>User not selected</div></section>;
    return (
      <div className={s.detailStack}>
        <div className={s.detailHeader}>
          <button className={s.secondaryButton} onClick={() => setPage(previousPage)}>Back</button>
          <div><h2>{selected.name ?? 'No name'}</h2><p>{selected.email}</p></div>
          <div className={s.actions}>
            <button className={s.secondaryButton} onClick={() => void handleImpersonate()} disabled={impersonateLoading || selected.id === currentUser?.id}>Impersonate</button>
            <button className={s.secondaryButton} disabled>Edit role</button>
            <button className={s.secondaryButton} disabled>Disable</button>
          </div>
        </div>

        <div className={s.metricsGrid}>
          <MetricCard label="Plan" value={selected.subscription.plan} hint={selected.subscription.status} />
          <MetricCard label="Expires" value={fmtDate(selected.subscription.expiresAt)} />
          <MetricCard label="AI Cost" value={fmtMoney(selected.aiCostUsd, 'USD')} hint={`${selected.aiRequestCount} requests`} />
          <MetricCard label="Tokens" value={fmtTokens(selected.tokens)} hint={`${selected.avgTokensPerRequest} avg/request`} />
          <MetricCard label="Revenue / LTV" value={fmtMoney(selected.ltv)} />
          <MetricCard label="Margin" value={`${selected.marginPercent}%`} />
          <MetricCard label="Projects" value={selected.projectCount} />
          <MetricCard label="Generated assets" value={selected.generatedTextCount} />
        </div>

        <div className={s.twoCol}>
          <section className={s.panel}>
            <div className={s.panelTitle}>Feature Usage</div>
            {selected.featureUsage.map((item) => <BreakdownBar key={item.featureCode} label={item.featureCode} value={item.costUsd} max={Math.max(...selected.featureUsage.map((f) => f.costUsd), 0)} right={`${item.requests} req · ${fmtMoney(item.costUsd, 'USD')}`} />)}
            {selected.featureUsage.length === 0 && <div className={s.emptyState}>No AI usage yet</div>}
          </section>
          <section className={s.panel}>
            <div className={s.panelTitle}>Subscription & Tribute Notes</div>
            <div className={s.list}>
              {selected.payments.slice(0, 6).map((payment) => (
                <div className={s.listItem} key={payment.id}>
                  <strong>{Number(payment.amount).toLocaleString('ru-RU')} {payment.currency}</strong>
                  <span>{payment.source} · {payment.status} · {fmtDate(payment.createdAt)}</span>
                  {payment.adminNote && <p>{payment.adminNote}</p>}
                </div>
              ))}
              {selected.payments.length === 0 && <div className={s.emptyState}>No payments yet</div>}
            </div>
          </section>
        </div>

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
    if (page === 'errors') return renderErrors();
    if (page === 'settings') return renderSettings();
    return renderUserDetail();
  }

  return (
    <div className={s.root}>
      <header className={s.header}>
        <div>
          <h1 className={s.title}>Luma IQ Control Center</h1>
          <div className={s.subtitle}>Business intelligence, AI economics, users and access management</div>
        </div>
        <div className={s.headerActions}>
          {isAdmin && <button className={s.secondaryButton} onClick={() => setCreateOpen(true)}>Add user</button>}
          <button className={s.button} onClick={() => void refreshAll()}>Refresh</button>
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
              <div><h3>Add user / Grant access</h3><p>Manual access for Tribute, promo or pilot users.</p></div>
              <button className={s.iconButton} onClick={() => setCreateOpen(false)}>×</button>
            </div>
            {renderSettings()}
          </div>
        </div>
      )}
    </div>
  );
}
