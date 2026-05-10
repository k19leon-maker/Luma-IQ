import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { adminApi, AdminUserDetail, AdminUserListItem } from '../../api/admin.api';
import s from './Admin.module.css';

function fmtDate(value: string | null): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value));
}

function planClass(plan: string): string {
  return plan === 'PRO' || plan === 'ANNUAL' ? `${s.badge} ${s.badgePro}` : s.badge;
}

export default function Admin() {
  const [users, setUsers] = useState<AdminUserListItem[]>([]);
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
  const [grantLoading, setGrantLoading] = useState(false);

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
      });
      toast.success(`Доступ ${result.subscription.plan} активирован`);
      setGrantPassword('');
      await loadUsers(result.user.id);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg ?? 'Не удалось выдать PRO');
    } finally {
      setGrantLoading(false);
    }
  }

  return (
    <div className={s.root}>
      <div className={s.header}>
        <div>
          <h1 className={s.title}>Админка</h1>
          <div className={s.subtitle}>Пользователи, подписки и ручной пилотный доступ</div>
        </div>
        <button className={s.button} onClick={() => void loadUsers()} disabled={loading}>
          Обновить
        </button>
      </div>

      <div className={s.grid}>
        <div className={s.panel}>
          <div className={s.panelHeader}>
            <div className={s.statGrid} style={{ flex: 1 }}>
              <div className={s.stat}>
                <div className={s.statLabel}>Пользователи</div>
                <div className={s.statValue}>{total}</div>
              </div>
              <div className={s.stat}>
                <div className={s.statLabel}>Активный PRO</div>
                <div className={s.statValue}>{summary.pro}</div>
              </div>
              <div className={s.stat}>
                <div className={s.statLabel}>LTV всего</div>
                <div className={s.statValue}>{summary.ltv.toLocaleString('ru-RU')} ₽</div>
              </div>
              <div className={s.stat}>
                <div className={s.statLabel}>AI-запросы</div>
                <div className={s.statValue}>{summary.ai}</div>
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
                  <div className={s.sectionTitle}>Выдать доступ</div>
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
                    <button className={s.button} onClick={() => void handleGrant()} disabled={grantLoading || !grantEmail}>
                      {grantLoading ? 'Выдаю...' : 'Активировать'}
                    </button>
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
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
