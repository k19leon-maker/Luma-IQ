import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { adminApi, AdminDashboard, AdminUserDetail, AdminUserListItem } from '../../api/admin.api';
import { useAuthStore } from '../../store/auth.store';
import s from './Admin.module.css';

function fmtDate(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value));
}

function planClass(plan: string): string {
  return plan === 'PRO' || plan === 'ANNUAL' ? `${s.badge} ${s.badgePro}` : s.badge;
}

export default function Admin() {
  const navigate = useNavigate();
  const currentUser = useAuthStore((st) => st.user);
  const setTokens = useAuthStore((st) => st.setTokens);
  const [users, setUsers] = useState<AdminUserListItem[]>([]);
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [total, setTotal] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminUserDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [q, setQ] = useState('');
  const [plan, setPlan] = useState('ALL');

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
  const [createOpen, setCreateOpen] = useState(false);
  const [createEmail, setCreateEmail] = useState('');
  const [createName, setCreateName] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [createPlan, setCreatePlan] = useState<'PRO' | 'ANNUAL'>('PRO');
  const [createMonths, setCreateMonths] = useState(1);
  const [createPaymentSource, setCreatePaymentSource] = useState<'TRIBUTE' | 'MANUAL' | 'PROMO'>('MANUAL');
  const [createPaymentAmount, setCreatePaymentAmount] = useState(0);
  const [createExternalId, setCreateExternalId] = useState('');
  const [createAdminNote, setCreateAdminNote] = useState('');
  const [createLoading, setCreateLoading] = useState(false);
  const [impersonateLoading, setImpersonateLoading] = useState(false);

  async function loadDashboard() {
    try {
      setDashboard(await adminApi.dashboard());
    } catch {
      toast.error('Не удалось загрузить метрики');
    }
  }

  async function loadUsers(nextSelectedId = selectedId) {
    setLoading(true);
    try {
      const data = await adminApi.listUsers({ q: q || undefined, plan, limit: 100 });
      setUsers(data.users);
      setTotal(data.total);
      const id = nextSelectedId ?? data.users[0]?.id ?? null;
      setSelectedId(id);
      if (id) void loadDetail(id);
    } catch {
      toast.error('Не удалось загрузить пользователей');
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(id: string) {
    setDetailLoading(true);
    try {
      const user = await adminApi.getUser(id);
      setSelected(user);
      setGrantEmail(user.email);
      setGrantName(user.name ?? '');
    } catch {
      toast.error('Не удалось загрузить карточку пользователя');
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    void loadDashboard();
    void loadUsers();
  }, []);

  const summary = useMemo(() => {
    const pro = users.filter((u) => u.subscription.plan !== 'FREE' && u.subscription.status === 'ACTIVE').length;
    const ltv = users.reduce((sum, u) => sum + u.ltv, 0);
    const ai = users.reduce((sum, u) => sum + u.aiRequestCount, 0);
    return { pro, ltv, ai };
  }, [users]);

  async function handleSelect(user: AdminUserListItem) {
    setSelectedId(user.id);
    await loadDetail(user.id);
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
      await loadDashboard();
      await loadUsers(result.user.id);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg ?? 'Не удалось выдать PRO');
    } finally {
      setGrantLoading(false);
    }
  }

  async function handleCreateUser() {
    setCreateLoading(true);
    try {
      const result = await adminApi.grantPro({
        email: createEmail,
        name: createName || undefined,
        password: createPassword || undefined,
        plan: createPlan,
        months: createMonths,
        paymentSource: createPaymentSource,
        amount: createPaymentAmount,
        externalId: createExternalId || undefined,
        adminNote: createAdminNote || undefined,
      });
      toast.success(`Пользователь ${result.user.email} создан`);
      setCreateOpen(false);
      setCreateEmail('');
      setCreateName('');
      setCreatePassword('');
      setCreatePlan('PRO');
      setCreateMonths(1);
      setCreatePaymentSource('MANUAL');
      setCreatePaymentAmount(0);
      setCreateExternalId('');
      setCreateAdminNote('');
      await loadDashboard();
      await loadUsers(result.user.id);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg ?? 'Не удалось создать пользователя');
    } finally {
      setCreateLoading(false);
    }
  }

  async function handleImpersonate() {
    if (!selected) return;
    const ok = window.confirm(`Войти в сервис как ${selected.email}? Текущая админская сессия будет заменена.`);
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
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg ?? 'Не удалось войти под пользователем');
    } finally {
      setImpersonateLoading(false);
    }
  }

  return (
    <div className={s.root}>
      <div className={s.header}>
        <div>
          <h1 className={s.title}>Админка</h1>
          <div className={s.subtitle}>Пользователи, подписки и ручной пилотный доступ</div>
        </div>
        <div className={s.headerActions}>
          <button className={s.secondaryButton} onClick={() => setCreateOpen(true)}>
            Добавить пользователя
          </button>
          <button className={s.button} onClick={() => void loadUsers()} disabled={loading}>
            Обновить
          </button>
        </div>
      </div>

      {dashboard && (
        <div className={s.dashboardGrid}>
          <div className={s.stat}>
            <div className={s.statLabel}>Новые за 7 дней</div>
            <div className={s.statValue}>{dashboard.metrics.newUsers7d}</div>
          </div>
          <div className={s.stat}>
            <div className={s.statLabel}>Revenue / LTV</div>
            <div className={s.statValue}>{dashboard.metrics.revenue.toLocaleString('ru-RU')} ₽</div>
          </div>
          <div className={s.stat}>
            <div className={s.statLabel}>Средний LTV</div>
            <div className={s.statValue}>{Math.round(dashboard.metrics.averageLtv).toLocaleString('ru-RU')} ₽</div>
          </div>
          <div className={s.stat}>
            <div className={s.statLabel}>AI сегодня</div>
            <div className={s.statValue}>{dashboard.metrics.aiToday}</div>
          </div>
        </div>
      )}

      <div className={s.grid}>
        <div className={s.panel}>
          <div className={s.panelHeader}>
            <div className={s.statGrid} style={{ flex: 1 }}>
              <div className={s.stat}>
                <div className={s.statLabel}>Пользователи</div>
                <div className={s.statValue}>{dashboard?.metrics.totalUsers ?? total}</div>
              </div>
              <div className={s.stat}>
                <div className={s.statLabel}>Активный PRO</div>
                <div className={s.statValue}>{dashboard?.metrics.activePro ?? summary.pro}</div>
              </div>
              <div className={s.stat}>
                <div className={s.statLabel}>LTV всего</div>
                <div className={s.statValue}>{(dashboard?.metrics.revenue ?? summary.ltv).toLocaleString('ru-RU')} ₽</div>
              </div>
              <div className={s.stat}>
                <div className={s.statLabel}>AI-запросы</div>
                <div className={s.statValue}>{dashboard?.metrics.aiTotal ?? summary.ai}</div>
              </div>
            </div>
          </div>

          <div className={s.panelHeader}>
            <input
              className={s.search}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void loadUsers(null)}
              placeholder="Поиск по email или имени"
            />
            <select className={s.select} value={plan} onChange={(e) => setPlan(e.target.value)}>
              <option value="ALL">Все тарифы</option>
              <option value="FREE">Free</option>
              <option value="PRO">Pro</option>
              <option value="ANNUAL">Annual</option>
            </select>
            <button className={s.button} onClick={() => void loadUsers(null)}>Найти</button>
          </div>

          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Пользователь</th>
                  <th>Этап</th>
                  <th>Подписка</th>
                  <th>Истекает</th>
                  <th>Проекты</th>
                  <th>AI</th>
                  <th>LTV</th>
                  <th>Активность</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr
                    key={user.id}
                    className={`${s.row}${selectedId === user.id ? ' ' + s.rowActive : ''}`}
                    onClick={() => void handleSelect(user)}
                  >
                    <td>
                      <div className={s.email}>{user.email}</div>
                      <div className={s.muted}>
                        {user.name ?? 'Без имени'} · {user.role === 'ADMIN' ? <span className={`${s.badge} ${s.badgeAdmin}`}>ADMIN</span> : 'USER'}
                      </div>
                    </td>
                    <td>{user.currentStage}</td>
                    <td><span className={planClass(user.subscription.plan)}>{user.subscription.plan}</span></td>
                    <td>{fmtDate(user.subscription.expiresAt)}</td>
                    <td>{user.projectCount}</td>
                    <td>{user.aiRequestCount}</td>
                    <td>{user.ltv.toLocaleString('ru-RU')} ₽</td>
                    <td>{fmtDate(user.lastActivityAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && users.length === 0 && <div className={s.empty}>Пользователи не найдены</div>}
            {loading && <div className={s.empty}>Загрузка...</div>}
          </div>
        </div>

        <aside className={s.panel}>
          <div className={s.card}>
            <div className={s.cardTitle}>{detailLoading ? 'Загрузка...' : selected?.email ?? 'Выберите пользователя'}</div>
            {selected && (
              <>
                <div className={s.muted}>{selected.name ?? 'Без имени'} · {selected.isVerified ? 'email подтвержден' : 'email не подтвержден'}</div>
                <div className={s.cardActions}>
                  <button
                    className={s.secondaryButton}
                    onClick={() => void handleImpersonate()}
                    disabled={impersonateLoading || selected.id === currentUser?.id}
                  >
                    {impersonateLoading ? 'Вхожу...' : selected.id === currentUser?.id ? 'Это текущий аккаунт' : 'Войти как пользователь'}
                  </button>
                </div>

                <div className={s.section}>
                  <div className={s.sectionTitle}>Подписка</div>
                  <div className={s.statGrid}>
                    <div className={s.stat}>
                      <div className={s.statLabel}>Тариф</div>
                      <div className={s.statValue}>{selected.subscription.plan}</div>
                    </div>
                    <div className={s.stat}>
                      <div className={s.statLabel}>Статус</div>
                      <div className={s.statValue}>{selected.subscription.status}</div>
                    </div>
                    <div className={s.stat}>
                      <div className={s.statLabel}>Истекает</div>
                      <div className={s.statValue}>{fmtDate(selected.subscription.expiresAt)}</div>
                    </div>
                    <div className={s.stat}>
                      <div className={s.statLabel}>LTV</div>
                      <div className={s.statValue}>{selected.ltv.toLocaleString('ru-RU')} ₽</div>
                    </div>
                  </div>
                </div>

                <div className={s.section}>
                  <div className={s.sectionTitle}>Выдать / продлить доступ</div>
                  <div className={s.form}>
                    <input className={s.input} value={grantEmail} onChange={(e) => setGrantEmail(e.target.value)} placeholder="Email" />
                    <input className={s.input} value={grantName} onChange={(e) => setGrantName(e.target.value)} placeholder="Имя" />
                    <input className={s.input} value={grantPassword} onChange={(e) => setGrantPassword(e.target.value)} placeholder="Пароль для нового аккаунта" />
                    <div className={s.formRow}>
                      <select className={s.select} value={grantPlan} onChange={(e) => setGrantPlan(e.target.value as 'PRO' | 'ANNUAL')}>
                        <option value="PRO">PRO</option>
                        <option value="ANNUAL">ANNUAL</option>
                      </select>
                      <input className={s.input} type="number" min={1} max={24} value={grantMonths} onChange={(e) => setGrantMonths(Number(e.target.value))} />
                    </div>
                    <div className={s.formRow}>
                      <select className={s.select} value={paymentSource} onChange={(e) => setPaymentSource(e.target.value as 'TRIBUTE' | 'MANUAL' | 'PROMO')}>
                        <option value="TRIBUTE">Tribute</option>
                        <option value="MANUAL">Manual</option>
                        <option value="PROMO">Promo</option>
                      </select>
                      <input className={s.input} type="number" min={0} value={paymentAmount} onChange={(e) => setPaymentAmount(Number(e.target.value))} placeholder="Сумма, ₽" />
                    </div>
                    <input className={s.input} value={externalId} onChange={(e) => setExternalId(e.target.value)} placeholder="ID/ссылка оплаты Tribute" />
                    <textarea className={s.textarea} value={adminNote} onChange={(e) => setAdminNote(e.target.value)} placeholder="Заметка администратора" rows={3} />
                    <button className={s.button} onClick={() => void handleGrant()} disabled={grantLoading || !grantEmail}>
                      {grantLoading ? 'Сохраняю...' : 'Создать / активировать'}
                    </button>
                  </div>
                </div>

                <div className={s.section}>
                  <div className={s.sectionTitle}>Платежи и LTV</div>
                  <div className={s.list}>
                    {selected.payments.slice(0, 6).map((payment) => (
                      <div className={s.listItem} key={payment.id}>
                        <div className={s.email}>{Number(payment.amount).toLocaleString('ru-RU')} {payment.currency}</div>
                        <div className={s.muted}>
                          {payment.status} · {payment.source} · {fmtDate(payment.createdAt)}
                          {payment.externalId ? ` · ${payment.externalId}` : ''}
                        </div>
                        {payment.adminNote && <div className={s.note}>{payment.adminNote}</div>}
                      </div>
                    ))}
                    {selected.payments.length === 0 && <div className={s.muted}>Платежей пока нет</div>}
                  </div>
                </div>

                <div className={s.section}>
                  <div className={s.sectionTitle}>Проекты</div>
                  <div className={s.list}>
                    {selected.projects.map((project) => (
                      <div className={s.listItem} key={project.id}>
                        <div className={s.email}>{project.name}</div>
                        <div className={s.muted}>
                          {project.currentStage} · продукты {project.productsCount} · контент {project.generatedTextsCount} · план {project.contentPlanItemsCount}
                        </div>
                      </div>
                    ))}
                    {selected.projects.length === 0 && <div className={s.muted}>Проектов пока нет</div>}
                  </div>
                </div>

                <div className={s.section}>
                  <div className={s.sectionTitle}>AI usage за 30 дней</div>
                  <div className={s.list}>
                    {selected.aiUsage.slice(0, 7).map((item) => (
                      <div className={s.listItem} key={item.id}>
                        <div className={s.email}>{item.date}</div>
                        <div className={s.muted}>{item.count} запросов</div>
                      </div>
                    ))}
                    {selected.aiUsage.length === 0 && <div className={s.muted}>AI-запросов пока нет</div>}
                  </div>
                </div>

                <div className={s.section}>
                  <div className={s.sectionTitle}>Последние AI-запросы</div>
                  <div className={s.list}>
                    {selected.aiRequestLogs.slice(0, 8).map((item) => (
                      <div className={s.listItem} key={item.id}>
                        <div className={s.email}>{item.provider} · {item.status}</div>
                        <div className={s.muted}>{item.section ?? 'general'} · {fmtDate(item.createdAt)}{item.isMock ? ' · mock' : ''}</div>
                        {item.error && <div className={s.note}>{item.error}</div>}
                      </div>
                    ))}
                    {selected.aiRequestLogs.length === 0 && <div className={s.muted}>Подробных AI-логов пока нет</div>}
                  </div>
                </div>

                <div className={s.section}>
                  <div className={s.sectionTitle}>Activity events</div>
                  <div className={s.list}>
                    {selected.events.slice(0, 10).map((event) => (
                      <div className={s.listItem} key={event.id}>
                        <div className={s.email}>{event.type}</div>
                        <div className={s.muted}>{fmtDate(event.createdAt)}</div>
                      </div>
                    ))}
                    {selected.events.length === 0 && <div className={s.muted}>Событий пока нет</div>}
                  </div>
                </div>
              </>
            )}
          </div>
        </aside>
      </div>

      {dashboard && (
        <div className={s.bottomGrid}>
          <div className={s.panel}>
            <div className={s.card}>
              <div className={s.sectionTitle}>AI analytics</div>
              <div className={s.list}>
                {dashboard.ai.byProvider.map((item) => (
                  <div className={s.listItem} key={item.provider}>
                    <div className={s.email}>{item.provider}</div>
                    <div className={s.muted}>{item.count} запросов за 30 дней</div>
                  </div>
                ))}
                {dashboard.ai.byProvider.length === 0 && <div className={s.muted}>AI-логов пока нет</div>}
              </div>
            </div>
          </div>
          <div className={s.panel}>
            <div className={s.card}>
              <div className={s.sectionTitle}>Последние события</div>
              <div className={s.list}>
                {dashboard.recentEvents.map((event) => (
                  <div className={s.listItem} key={event.id}>
                    <div className={s.email}>{event.type}</div>
                    <div className={s.muted}>{event.user?.email ?? 'system'} · {fmtDate(event.createdAt)}</div>
                  </div>
                ))}
                {dashboard.recentEvents.length === 0 && <div className={s.muted}>Событий пока нет</div>}
              </div>
            </div>
          </div>
        </div>
      )}

      {createOpen && (
        <div className={s.modalBackdrop} onMouseDown={() => setCreateOpen(false)}>
          <div className={s.modal} onMouseDown={(e) => e.stopPropagation()}>
            <div className={s.modalHeader}>
              <div>
                <div className={s.modalTitle}>Добавить пользователя</div>
                <div className={s.muted}>Создайте пилотный аккаунт и сразу откройте доступ.</div>
              </div>
              <button className={s.iconButton} onClick={() => setCreateOpen(false)} aria-label="Закрыть">×</button>
            </div>

            <div className={s.form}>
              <input className={s.input} value={createEmail} onChange={(e) => setCreateEmail(e.target.value)} placeholder="Email" autoFocus />
              <input className={s.input} value={createName} onChange={(e) => setCreateName(e.target.value)} placeholder="Имя" />
              <input className={s.input} value={createPassword} onChange={(e) => setCreatePassword(e.target.value)} placeholder="Пароль от 8 символов" />
              <div className={s.formRow}>
                <select className={s.select} value={createPlan} onChange={(e) => setCreatePlan(e.target.value as 'PRO' | 'ANNUAL')}>
                  <option value="PRO">PRO</option>
                  <option value="ANNUAL">ANNUAL</option>
                </select>
                <input className={s.input} type="number" min={1} max={24} value={createMonths} onChange={(e) => setCreateMonths(Number(e.target.value))} />
              </div>
              <div className={s.formRow}>
                <select className={s.select} value={createPaymentSource} onChange={(e) => setCreatePaymentSource(e.target.value as 'TRIBUTE' | 'MANUAL' | 'PROMO')}>
                  <option value="MANUAL">Manual</option>
                  <option value="TRIBUTE">Tribute</option>
                  <option value="PROMO">Promo</option>
                </select>
                <input className={s.input} type="number" min={0} value={createPaymentAmount} onChange={(e) => setCreatePaymentAmount(Number(e.target.value))} placeholder="Сумма, ₽" />
              </div>
              <input className={s.input} value={createExternalId} onChange={(e) => setCreateExternalId(e.target.value)} placeholder="ID/ссылка оплаты" />
              <textarea className={s.textarea} value={createAdminNote} onChange={(e) => setCreateAdminNote(e.target.value)} placeholder="Заметка администратора" rows={3} />
              <div className={s.modalActions}>
                <button className={s.secondaryButton} onClick={() => setCreateOpen(false)}>Отмена</button>
                <button className={s.button} onClick={() => void handleCreateUser()} disabled={createLoading || !createEmail || !createPassword}>
                  {createLoading ? 'Создаю...' : 'Создать'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
