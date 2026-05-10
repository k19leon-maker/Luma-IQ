import { useState, useRef, useEffect, useCallback } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/auth.store';
import { authApi } from '../../api/auth.api';
import { useProjectsStore } from '../../store/projects.store';
import { useProgressStore } from '../../store/progress.store';
import { useUnpackingStore } from '../../store/unpacking.store';
import AddToPlanModal from '../AddToPlanModal/AddToPlanModal';
import ModelSelector from '../ModelSelector/ModelSelector';
import { ErrorBoundary } from '../ErrorBoundary/ErrorBoundary';
import s from './Layout.module.css';

/* ── Types ─────────────────────────────────────────────────────── */

interface NavItem {
  path: string;
  label: string;
  icon: string;
}

const strategyNav: NavItem[] = [
  { path: '/strategy/unpacking',    label: 'Распаковка',           icon: '🔍' },
  { path: '/strategy/audience',     label: 'Целевая аудитория',    icon: '🎯' },
  { path: '/strategy/utp',          label: 'Создание УТП',         icon: '💎' },
  { path: '/strategy/social',       label: 'Оформление соц сетей', icon: '📱' },
  { path: '/strategy/product-main', label: 'Основной продукт',     icon: '🚀' },
  { path: '/strategy/product-mini', label: 'Мини-продукт',         icon: '⚡' },
  { path: '/strategy/lead-magnet',  label: 'Лид-магнит',           icon: '🎁' },
];

const contentNav: NavItem[] = [
  { path: '/posts',           label: 'Посты',               icon: '📱' },
  { path: '/reels',           label: 'Рилсы',               icon: '🎬' },
  { path: '/articles',        label: 'Статьи',              icon: '📝' },
  { path: '/video-scripts',   label: 'Сценарии видео',      icon: '🎥' },
  { path: '/chatbot-chains',  label: 'Цепочка текстов',     icon: '🤖' },
];

const filesNav: NavItem[] = [
  { path: '/files/materials', label: 'Материалы',  icon: '📁' },
  { path: '/files/products',  label: 'Продукты',   icon: '📦' },
];

const pageTitles: Record<string, string> = {
  '/strategy/unpacking':    'Распаковка',
  '/strategy/audience':     'Целевая аудитория',
  '/strategy/utp':          'Создание УТП',
  '/strategy/social':       'Оформление соц. сетей',
  '/strategy/product-main': 'Основной продукт',
  '/strategy/product-mini': 'Мини-продукт',
  '/strategy/lead-magnet':  'Лид-магнит',
  '/posts':           'Посты',
  '/reels':           'Рилсы',
  '/articles':        'Статьи',
  '/video-scripts':   'Сценарии видео',
  '/chatbot-chains':  'Цепочка текстов',
  '/tasks':           'План задач',
  '/content-plan':    'Контент-план',
  '/files/materials': 'Материалы',
  '/files/products':  'Продукты',
  '/history':         'История',
  '/settings':        'Настройки',
  '/admin':           'Админка',
};

/* ── Email verification banner ─────────────────────────────── */

function EmailBanner({ email }: { email: string }) {
  const [sending, setSending] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  async function resend() {
    setSending(true);
    try {
      await authApi.resendVerification();
      toast.success('Письмо отправлено на ' + email);
    } catch {
      toast.error('Не удалось отправить письмо');
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{
      background: '#FFF8E7', borderBottom: '1px solid #F0E0A0',
      padding: '10px 20px', display: 'flex', alignItems: 'center',
      gap: 12, fontSize: 13, color: '#7A6000',
    }}>
      <span>📧 Подтвердите email <b>{email}</b>, чтобы получить доступ ко всем функциям.</span>
      <button onClick={resend} disabled={sending} style={{
        background: 'none', border: '1px solid #D4A847', borderRadius: 6,
        padding: '3px 10px', cursor: sending ? 'not-allowed' : 'pointer',
        color: '#7A6000', fontSize: 12, fontWeight: 500,
      }}>
        {sending ? 'Отправка...' : 'Отправить письмо'}
      </button>
      <button onClick={() => setDismissed(true)} style={{
        background: 'none', border: 'none', cursor: 'pointer',
        color: '#AAA', fontSize: 16, marginLeft: 'auto', lineHeight: 1,
      }}>×</button>
    </div>
  );
}

/* ── Collapsible section component ────────────────────────────── */

function Section({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={s.navSection}>
      <button className={s.sectionHeader} onClick={() => setOpen((v) => !v)}>
        <span className={s.sectionTitle}>{title}</span>
        <span className={`${s.arrow}${open ? ' ' + s.arrowOpen : ''}`}>▾</span>
      </button>
      {open && <div className={s.sectionBody}>{children}</div>}
    </div>
  );
}

/* ── Layout ────────────────────────────────────────────────────── */

interface LayoutProps { children: React.ReactNode; }

export default function Layout({ children }: LayoutProps) {
  const location  = useLocation();
  const navigate  = useNavigate();
  const user      = useAuthStore((st) => st.user);

  const switchProgress    = useProgressStore((st) => st.switchProject);
  const switchUnpacking   = useUnpackingStore((st) => st.switchProject);

  /* Projects from store */
  const projects           = useProjectsStore((s) => s.projects);
  const activeProjectId    = useProjectsStore((s) => s.activeProjectId);
  const loadProjects       = useProjectsStore((s) => s.loadProjects);
  const addProject         = useProjectsStore((s) => s.addProject);
  const removeProject      = useProjectsStore((s) => s.removeProject);
  const renameProject      = useProjectsStore((s) => s.renameProject);
  const setActiveProjectId = useProjectsStore((s) => s.setActiveProjectId);
  const projectsLoading    = useProjectsStore((s) => s.loading);

  useEffect(() => { void loadProjects(); }, []); // eslint-disable-line

  // Sync per-project stores when active project changes
  useEffect(() => {
    if (!activeProjectId) return;
    switchProgress(activeProjectId);
    switchUnpacking(activeProjectId);
  }, [activeProjectId]); // eslint-disable-line

  const projectMatch = location.pathname.match(/^\/projects\/(.+)$/);
  const title = projectMatch
    ? (projects.find((p) => p.id === projectMatch[1])?.name ?? 'Проект')
    : (pageTitles[location.pathname] ?? 'LumaIQ');

  /* New project modal */
  const [showModal,       setShowModal]       = useState(false);
  const [newProjectName,  setNewProjectName]  = useState('');
  const [createError,     setCreateError]     = useState('');
  const [createLoading,   setCreateLoading]   = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  /* Rename inline */
  const [renamingId,    setRenamingId]    = useState<string | null>(null);
  const [renameVal,     setRenameVal]     = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (renamingId) setTimeout(() => renameInputRef.current?.focus(), 50);
  }, [renamingId]);

  const commitRename = useCallback(() => {
    if (!renamingId) return;
    const val = renameVal.trim();
    if (val) void renameProject(renamingId, val);
    setRenamingId(null);
  }, [renamingId, renameVal, renameProject]);

  useEffect(() => {
    if (showModal) {
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [showModal]);

  const handleCreateProject = async () => {
    const name = newProjectName.trim();
    if (!name || createLoading) return;
    setCreateError('');
    setCreateLoading(true);
    try {
      const proj = await addProject(name);
      setNewProjectName('');
      setShowModal(false);
      navigate(`/projects/${proj.id}`);
    } catch {
      setCreateError('Не удалось создать проект. Проверьте соединение с сервером.');
    } finally {
      setCreateLoading(false);
    }
  };

  /* User avatar */
  const initials = user?.name
    ? user.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
    : user?.email?.[0]?.toUpperCase() ?? 'П';

  return (
    <div className={s.root}>
      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside className={s.sidebar}>
        <div className={s.logo} onClick={() => navigate('/dashboard')}>
          <div className={s.logoIcon}>✦</div>
          <span className={s.logoText}>
            <span style={{ color: '#D4A847' }}>Luma</span>IQ
          </span>
        </div>

        <nav className={s.nav}>

          {/* Проекты */}
          <Section title="Проекты">
            {projects.map((p) => (
              <div
                key={p.id}
                className={`${s.projectItem}${p.id === activeProjectId ? ' ' + s.projectActive : ''}`}
              >
                {renamingId === p.id ? (
                  <input
                    ref={renameInputRef}
                    className={s.renameInput}
                    value={renameVal}
                    onChange={(e) => setRenameVal(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename();
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                  />
                ) : (
                  <button
                    className={s.projectBtn}
                    onClick={() => { setActiveProjectId(p.id); navigate('/dashboard'); }}
                  >
                    <span className={s.projectDot} style={{ background: p.color }} />
                    <span className={s.projectName}>{p.name}</span>
                  </button>
                )}
                {renamingId !== p.id && (
                  <div className={s.projectActions}>
                    <button
                      className={s.projectActionBtn}
                      title="Переименовать"
                      onClick={(e) => { e.stopPropagation(); setRenamingId(p.id); setRenameVal(p.name); }}
                    >✎</button>
                    <button
                      className={s.projectActionBtn}
                      title="Удалить"
                      onClick={(e) => {
                        e.stopPropagation();
                        toast((t) => (
                          <span style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <span>Удалить проект «{p.name}»?</span>
                            <span style={{ display: 'flex', gap: 8 }}>
                              <button
                                style={{ background: '#f25c5c', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 12px', cursor: 'pointer' }}
                                onClick={() => { toast.dismiss(t.id); void removeProject(p.id); }}
                              >Удалить</button>
                              <button
                                style={{ background: '#2d2d4e', color: '#e8e8f8', border: 'none', borderRadius: 4, padding: '4px 12px', cursor: 'pointer' }}
                                onClick={() => toast.dismiss(t.id)}
                              >Отмена</button>
                            </span>
                          </span>
                        ), { duration: 6000 });
                      }}
                    >✕</button>
                  </div>
                )}
              </div>
            ))}
            <button className={s.newProjectBtn} onClick={() => setShowModal(true)}>
              + Новый проект
            </button>
          </Section>


          {/* План задач */}
          <div className={s.navSection}>
            <NavLink
              to="/tasks"
              className={({ isActive }) =>
                `${s.navLink} ${s.standaloneLink}${isActive ? ' ' + s.active : ''}`
              }
            >
              <span className={s.navIcon}>📋</span>
              <span className={s.navLinkLabel}>План задач</span>
            </NavLink>
          </div>

          {/* Стратегия */}
          <Section title="Стратегия">
            {strategyNav.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `${s.navLink}${isActive ? ' ' + s.active : ''}`
                }
              >
                <span className={s.navIcon}>{item.icon}</span>
                <span className={s.navLinkLabel}>{item.label}</span>
              </NavLink>
            ))}
          </Section>

          {/* Контент */}
          <Section title="Контент">
            {contentNav.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `${s.navLink}${isActive ? ' ' + s.active : ''}`
                }
              >
                <span className={s.navIcon}>{item.icon}</span>
                <span className={s.navLinkLabel}>{item.label}</span>
              </NavLink>
            ))}
          </Section>

          {/* Контент-план — отдельный пункт */}
          <div className={s.navSection}>
            <NavLink
              to="/content-plan"
              className={({ isActive }) =>
                `${s.navLink} ${s.standaloneLink}${isActive ? ' ' + s.active : ''}`
              }
            >
              <span className={s.navIcon}>📅</span>
              <span className={s.navLinkLabel}>Контент-план</span>
            </NavLink>
          </div>

          {/* Мои файлы */}
          <Section title="Мои файлы">
            {filesNav.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `${s.navLink}${isActive ? ' ' + s.active : ''}`
                }
              >
                <span className={s.navIcon}>{item.icon}</span>
                <span className={s.navLinkLabel}>{item.label}</span>
              </NavLink>
            ))}
          </Section>

          {/* Одиночные пункты */}
          <div className={s.navSection}>
            {user?.role === 'ADMIN' && (
              <NavLink
                to="/admin"
                className={({ isActive }) =>
                  `${s.navLink} ${s.standaloneLink}${isActive ? ' ' + s.active : ''}`
                }
              >
                <span className={s.navIcon}>🛠</span>
                <span className={s.navLinkLabel}>Админка</span>
              </NavLink>
            )}
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                `${s.navLink} ${s.standaloneLink}${isActive ? ' ' + s.active : ''}`
              }
            >
              <span className={s.navIcon}>⚙️</span>
              <span className={s.navLinkLabel}>Настройки</span>
            </NavLink>
            <NavLink
              to="/history"
              className={({ isActive }) =>
                `${s.navLink} ${s.standaloneLink}${isActive ? ' ' + s.active : ''}`
              }
            >
              <span className={s.navIcon}>🕐</span>
              <span className={s.navLinkLabel}>История</span>
            </NavLink>
          </div>

        </nav>

        <div className={s.sidebarFooter}>
          <div className={s.userCard}>
            <div className={s.avatar}>{initials}</div>
            <div>
              <div className={s.userName}>{user?.name ?? user?.email ?? 'Психолог'}</div>
              <div className={s.userPlan}>{(user as { tariff?: string })?.tariff ?? 'Бесплатный тариф'}</div>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Main ─────────────────────────────────────────────────── */}
      <div className={s.main}>
        {/* Email verification banner */}
        {user && user.isVerified === false && (
          <EmailBanner email={user.email} />
        )}
        {location.pathname !== '/dashboard' && (
          <header className={s.topbar}>
            <h1 className={s.topbarTitle}>{title}</h1>
            <div className={s.topbarActions}>
              <ModelSelector />
            </div>
          </header>
        )}
        <main className={location.pathname === '/dashboard' ? s.contentFull : s.content}>
          {projectsLoading && projects.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 14 }}>
              Загрузка…
            </div>
          ) : (
            <ErrorBoundary key={activeProjectId}>
              {children}
            </ErrorBoundary>
          )}
        </main>
      </div>

      {/* ── Add to plan modal ────────────────────────────────────── */}
      <AddToPlanModal />

      {/* ── Модальное окно ───────────────────────────────────────── */}
      {showModal && (
        <div className={s.modalOverlay} onClick={() => setShowModal(false)}>
          <div className={s.modal} onClick={(e) => e.stopPropagation()}>
            <div className={s.modalTitle}>Новый проект</div>
            <input
              ref={inputRef}
              className={s.modalInput}
              placeholder="Название проекта"
              value={newProjectName}
              onChange={(e) => { setNewProjectName(e.target.value); setCreateError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && void handleCreateProject()}
              disabled={createLoading}
            />
            {createError && (
              <div className={s.modalError}>{createError}</div>
            )}
            <div className={s.modalActions}>
              <button className={s.modalCancel} onClick={() => { setShowModal(false); setCreateError(''); }} disabled={createLoading}>
                Отмена
              </button>
              <button
                className={s.modalCreate}
                onClick={() => void handleCreateProject()}
                disabled={!newProjectName.trim() || createLoading}
              >
                {createLoading ? 'Создаём…' : 'Создать и начать стратегию'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
