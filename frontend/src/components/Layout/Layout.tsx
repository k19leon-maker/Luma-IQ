import { useState, useRef, useEffect, useCallback } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../store/auth.store';
import { consumeAdminAccessTokenBackup, hasAdminAccessTokenBackup } from '../../api/token-session';
import { authApi } from '../../api/auth.api';
import { billingApi, type BillingMe } from '../../api/billing.api';
import { SectionUsageLimits, type SectionUsageLimitsSection } from '../UsageLimits/UsageLimits';
import { useProjectsStore } from '../../store/projects.store';
import { useProgressStore } from '../../store/progress.store';
import { useTasksStore } from '../../store/tasks.store';
import { useUnpackingStore } from '../../store/unpacking.store';
import AddToPlanModal from '../AddToPlanModal/AddToPlanModal';
import { ErrorBoundary } from '../ErrorBoundary/ErrorBoundary';
import { appPath, stripAppPrefix } from '../../utils/appRoutes';
import s from './Layout.module.css';

/* ── Types ─────────────────────────────────────────────────────── */

interface NavItem {
  path: string;
  label: string;
  icon: string;
}

const strategyNav: NavItem[] = [
  { path: '/strategy/about',        label: 'О себе',               icon: '👤' },
  { path: '/strategy/positioning',  label: 'Позиционирование',      icon: '🧭' },
  { path: '/strategy/audience',     label: 'Целевая аудитория',    icon: '🎯' },
  { path: '/strategy/castdev',      label: 'CustDev',              icon: '🎙️' },
  { path: '/strategy/utp',          label: 'Создание УТП',         icon: '💎' },
];

const packagingNav: NavItem[] = [
  { path: '/strategy/social',       label: 'Инста',                icon: '📱' },
  { path: '/tg-channel',            label: 'ТГ-канал',             icon: '✈️' },
  { path: '/threads',               label: 'Тредс',                icon: '🧵' },
  { path: '/chatbot-chains',        label: 'Чат бот',              icon: '🤖' },
];

const productNav: NavItem[] = [
  { path: '/products/main',        label: 'Основной продукт', icon: '🚀' },
  { path: '/products/mini',        label: 'Мини-продукт',     icon: '⚡' },
  { path: '/products/lead-magnet', label: 'Лид-магнит',       icon: '🎁' },
];

const contentNav: NavItem[] = [
  { path: '/posts',           label: 'Посты',               icon: '📱' },
  { path: '/reels',           label: 'Рилсы',               icon: '🎬' },
  { path: '/articles',        label: 'Статьи',              icon: '📝' },
  { path: '/video-scripts',   label: 'Сценарии видео',      icon: '🎥' },
];

const filesNav: NavItem[] = [
  { path: '/files/materials', label: 'Материалы',  icon: '📁' },
  { path: '/files/products',  label: 'Продукты',   icon: '📦' },
];

const pageTitles: Record<string, string> = {
  '/strategy/unpacking':    'Распаковка',
  '/strategy/about':        'О себе',
  '/ai-dialog':             'Диалог с ИИ',
  '/strategy/positioning':  'Позиционирование',
  '/strategy/audience':     'Целевая аудитория',
  '/strategy/castdev':      'CustDev',
  '/strategy/utp':          'Создание УТП',
  '/strategy/social':       'Упаковка Instagram',
  '/products/main':         'Основной продукт',
  '/products/mini':         'Мини-продукт',
  '/products/lead-magnet':  'Лид-магнит',
  '/posts':           'Посты',
  '/reels':           'Рилсы',
  '/articles':        'Статьи',
  '/video-scripts':   'Сценарии видео',
  '/chatbot-chains':  'Чат бот',
  '/threads':         'Тредс',
  '/tg-channel':      'ТГ-канал',
  '/tasks':           'План задач',
  '/content-plan':    'Контент-план',
  '/files/materials': 'Материалы',
  '/files/products':  'Продукты',
  '/history':         'История',
  '/settings':        'Мой профиль',
  '/limits':          'Лимиты',
  '/admin':           'Админка',
};

const aiWorkspacePaths = new Set([
  '/ai-dialog',
  '/strategy/audience',
  '/products/main',
  '/products/mini',
  '/products/lead-magnet',
  '/posts',
  '/reels',
  '/articles',
  '/video-scripts',
  '/chatbot-chains',
  '/threads',
  '/tg-channel',
]);

const scrollableAiWorkspacePaths = new Set([
  '/posts',
  '/reels',
  '/articles',
  '/video-scripts',
  '/chatbot-chains',
  '/threads',
  '/tg-channel',
]);

function getLocalLimitsSection(path: string): SectionUsageLimitsSection | null {
  if (path === '/ai-dialog') return 'ai_chat';
  if (path === '/posts' || path === '/reels' || path === '/chatbot-chains' || path === '/threads' || path === '/tg-channel' || path === '/content-plan') return 'content';
  if (path === '/articles') return 'longreads';
  if (path === '/video-scripts') return 'youtube_scripts';
  if (path === '/strategy/about' || path === '/strategy/positioning' || path === '/strategy/audience' || path === '/strategy/castdev' || path === '/strategy/utp' || path === '/strategy/social') return 'strategy';
  if (path === '/products/main' || path === '/products/mini' || path === '/products/lead-magnet') return 'products';
  return null;
}

function lastActiveProjectKey(userId: string): string {
  return `lumaiq:last-active-project:${userId}`;
}

function readLastActiveProjectId(userId?: string): string {
  if (!userId) return '';
  try {
    return localStorage.getItem(lastActiveProjectKey(userId)) ?? '';
  } catch {
    return '';
  }
}

function saveLastActiveProjectId(userId: string | undefined, projectId: string): void {
  if (!userId || !projectId) return;
  try {
    localStorage.setItem(lastActiveProjectKey(userId), projectId);
  } catch {
    // localStorage can be unavailable in private or restricted browser modes.
  }
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
  const appLocationPath = stripAppPrefix(location.pathname);
  const user      = useAuthStore((st) => st.user);
  const setTokens = useAuthStore((st) => st.setTokens);
  const [hasAdminBackup, setHasAdminBackup] = useState(() => hasAdminAccessTokenBackup());
  const [billing, setBilling] = useState<BillingMe | null>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const accountMenuCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const switchProgress    = useProgressStore((st) => st.switchProject);
  const loadProgressFromDb = useProgressStore((st) => st.loadFromDb);
  const switchUnpacking   = useUnpackingStore((st) => st.switchProject);
  const unfinishedTasksCount = useTasksStore((st) => st.tasks.filter((t) => !t.done && t.column !== 'done').length);

  /* Projects from store */
  const projects           = useProjectsStore((s) => s.projects);
  const activeProjectId    = useProjectsStore((s) => s.activeProjectId);
  const loadProjects       = useProjectsStore((s) => s.loadProjects);
  const addProject         = useProjectsStore((s) => s.addProject);
  const removeProject      = useProjectsStore((s) => s.removeProject);
  const renameProject      = useProjectsStore((s) => s.renameProject);
  const setProjectArchived = useProjectsStore((s) => s.setProjectArchived);
  const setActiveProjectId = useProjectsStore((s) => s.setActiveProjectId);
  const projectsLoading    = useProjectsStore((s) => s.loading);
  const activeProjectRestoreRef = useRef({ userId: '', preferredProjectId: '', applied: false });

  useEffect(() => {
    if (!user?.id) return;
    activeProjectRestoreRef.current = {
      userId: user.id,
      preferredProjectId: readLastActiveProjectId(user.id),
      applied: false,
    };
    void loadProjects();
  }, [user?.id, loadProjects]);

  useEffect(() => {
    if (!user?.id) {
      setBilling(null);
      return;
    }

    let cancelled = false;
    billingApi.getMe()
      .then((next) => {
        if (!cancelled) setBilling(next);
      })
      .catch(() => {
        if (!cancelled) setBilling(null);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !activeProjectId) return;
    const restoreState = activeProjectRestoreRef.current;
    if (restoreState.userId !== user.id || !restoreState.applied) return;
    saveLastActiveProjectId(user.id, activeProjectId);
  }, [activeProjectId, user?.id]);

  useEffect(() => {
    if (!user?.id || projectsLoading || projects.length === 0) return;
    const restoreState = activeProjectRestoreRef.current;
    if (restoreState.userId !== user.id || restoreState.applied) return;

    const preferredProjectId = restoreState.preferredProjectId;
    if (preferredProjectId && projects.some((project) => project.id === preferredProjectId)) {
      if (activeProjectId !== preferredProjectId) setActiveProjectId(preferredProjectId);
    }

    restoreState.applied = true;
  }, [activeProjectId, projects, projectsLoading, setActiveProjectId, user?.id]);

  const restoreAdminSession = useCallback(async () => {
    const backup = consumeAdminAccessTokenBackup();
    if (!backup) return;
    setHasAdminBackup(false);

    const restored = backup.mode === 'server-cookie'
      ? await authApi.restoreAdminImpersonation()
      : backup.accessToken
        ? { tokens: { accessToken: backup.accessToken, csrfToken: backup.csrfToken } }
        : null;
    if (!restored) {
      toast.error('Не удалось восстановить админскую сессию');
      navigate(appPath('/dashboard'), { replace: true });
      return;
    }

    const restoredUser = await setTokens(restored.tokens.accessToken, restored.tokens.csrfToken);
    if (restoredUser?.role !== 'ADMIN') {
      toast.error('Не удалось восстановить админскую сессию');
      navigate(appPath('/dashboard'), { replace: true });
      return;
    }

    activeProjectRestoreRef.current = {
      userId: restoredUser.id,
      preferredProjectId: readLastActiveProjectId(restoredUser.id),
      applied: false,
    };
    await loadProjects();
    toast.success('Вы вернулись в админку');
    navigate('/admin', { replace: true });
  }, [loadProjects, navigate, setTokens]);

  useEffect(() => {
    const syncBackup = () => setHasAdminBackup(hasAdminAccessTokenBackup());
    window.addEventListener('admin-session-backup-changed', syncBackup);
    return () => window.removeEventListener('admin-session-backup-changed', syncBackup);
  }, []);

  useEffect(() => {
    if (!accountMenuOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (accountMenuRef.current?.contains(event.target as Node)) return;
      setAccountMenuOpen(false);
    }
    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [accountMenuOpen]);

  useEffect(() => {
    return () => {
      if (accountMenuCloseTimerRef.current) {
        clearTimeout(accountMenuCloseTimerRef.current);
      }
    };
  }, []);

  const cancelAccountMenuClose = () => {
    if (accountMenuCloseTimerRef.current) {
      clearTimeout(accountMenuCloseTimerRef.current);
      accountMenuCloseTimerRef.current = null;
    }
  };

  const scheduleAccountMenuClose = () => {
    cancelAccountMenuClose();
    accountMenuCloseTimerRef.current = setTimeout(() => {
      setAccountMenuOpen(false);
      accountMenuCloseTimerRef.current = null;
    }, 180);
  };

  // Sync per-project stores when active project changes
  useEffect(() => {
    if (!activeProjectId) return;
    switchProgress(activeProjectId);
    void loadProgressFromDb(activeProjectId);
    switchUnpacking(activeProjectId);
  }, [activeProjectId, loadProgressFromDb, switchProgress, switchUnpacking]);

  const projectMatch = appLocationPath.match(/^\/projects\/(.+)$/);
  const isAiWorkspace = aiWorkspacePaths.has(appLocationPath);
  const isAiDialog = appLocationPath === '/ai-dialog';
  const isProfilePage = appLocationPath === '/settings';
  const isScrollableAiWorkspace = scrollableAiWorkspacePaths.has(appLocationPath);
  const localLimitsSection = getLocalLimitsSection(appLocationPath);
  const title = projectMatch
    ? (projects.find((p) => p.id === projectMatch[1])?.name ?? 'Проект')
    : (pageTitles[appLocationPath] ?? 'LumaIQ');

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
    if (billing && billing.publicLimits.projectsRemaining <= 0) {
      setCreateError('Лимит проектов на вашем тарифе исчерпан. Чтобы создать новый проект, увеличьте лимиты.');
      return;
    }
    setCreateError('');
    setCreateLoading(true);
    try {
      const proj = await addProject(name);
      setNewProjectName('');
      setShowModal(false);
      navigate(appPath(`/projects/${proj.id}`));
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
  const userPlanLabel = billing?.plan.name ?? (user as { tariff?: string })?.tariff ?? 'Бесплатный';

  const goToAccountSection = (path: string) => {
    setAccountMenuOpen(false);
    navigate(appPath(path));
  };

  return (
    <div className={s.root}>
      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside className={s.sidebar}>
        <div className={s.logo} onClick={() => navigate(appPath('/dashboard'))}>
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
                    onClick={() => { setActiveProjectId(p.id); navigate(appPath('/dashboard')); }}
                  >
                    <span className={s.projectDot} style={{ background: p.color }} />
                    <span className={s.projectName}>{p.name}{p.status === 'ARCHIVED' ? ' · архив' : ''}</span>
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
                      title={p.status === 'ARCHIVED' ? 'Вернуть в работу' : 'Архивировать'}
                      onClick={(e) => {
                        e.stopPropagation();
                        void setProjectArchived(p.id, p.status !== 'ARCHIVED')
                          .then(() => toast.success(p.status === 'ARCHIVED' ? 'Проект снова активен' : 'Проект перемещён в архив'))
                          .catch(() => toast.error('Не удалось изменить статус проекта. Проверьте лимит тарифа.'));
                      }}
                    >{p.status === 'ARCHIVED' ? '↥' : '⌁'}</button>
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
              to={appPath('/ai-dialog')}
              className={({ isActive }) =>
                `${s.navLink} ${isProfilePage ? s.standaloneLink : s.aiDialogLink}${isActive ? ' ' + s.active : ''}`
              }
            >
              <span className={s.navIcon}>AI</span>
              <span className={s.navLinkLabel}>Диалог с ИИ</span>
            </NavLink>
            <NavLink
              to={appPath('/tasks')}
              className={({ isActive }) =>
                `${s.navLink} ${s.standaloneLink}${isActive ? ' ' + s.active : ''}`
              }
            >
              <span className={s.navIcon}>📋</span>
              <span className={s.navLinkLabel}>План задач</span>
              {unfinishedTasksCount > 0 && (
                <span className={s.taskBadge} aria-label={`Незавершенных задач: ${unfinishedTasksCount}`}>
                  {unfinishedTasksCount > 99 ? '99+' : unfinishedTasksCount}
                </span>
              )}
            </NavLink>
            <NavLink
              to={appPath('/content-plan')}
              className={({ isActive }) =>
                `${s.navLink} ${s.standaloneLink}${isActive ? ' ' + s.active : ''}`
              }
            >
              <span className={s.navIcon}>📅</span>
              <span className={s.navLinkLabel}>Контент-план</span>
            </NavLink>
          </div>

          {/* Стратегия */}
          <Section title="Стратегия">
            {strategyNav.map((item) => (
              <NavLink
                key={item.path}
                to={appPath(item.path)}
                className={({ isActive }) =>
                  `${s.navLink}${isActive ? ' ' + s.active : ''}`
                }
              >
                <span className={s.navIcon}>{item.icon}</span>
                <span className={s.navLinkLabel}>{item.label}</span>
              </NavLink>
            ))}
          </Section>

          {/* Упаковка */}
          <Section title="Упаковка">
            {packagingNav.map((item) => (
              <NavLink
                key={item.path}
                to={appPath(item.path)}
                className={({ isActive }) =>
                  `${s.navLink}${isActive ? ' ' + s.active : ''}`
                }
              >
                <span className={s.navIcon}>{item.icon}</span>
                <span className={s.navLinkLabel}>{item.label}</span>
              </NavLink>
            ))}
          </Section>

          {/* Конструктор продуктов */}
          <Section title="Конструктор продуктов">
            {productNav.map((item) => (
              <NavLink
                key={item.path}
                to={appPath(item.path)}
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
                to={appPath(item.path)}
                className={({ isActive }) =>
                  `${s.navLink}${isActive ? ' ' + s.active : ''}`
                }
              >
                <span className={s.navIcon}>{item.icon}</span>
                <span className={s.navLinkLabel}>{item.label}</span>
              </NavLink>
            ))}
          </Section>

          {/* Мои файлы */}
          <Section title="Мои файлы">
            {filesNav.map((item) => (
              <NavLink
                key={item.path}
                to={appPath(item.path)}
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
              to={appPath('/history')}
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
          {hasAdminBackup && (
            <div className={s.impersonationCard}>
              <div className={s.impersonationLabel}>Просмотр как</div>
              <div className={s.impersonationEmail}>{user?.email}</div>
              <button onClick={restoreAdminSession}>Вернуться в админку</button>
            </div>
          )}
          <div
            className={s.accountMenuWrap}
            ref={accountMenuRef}
            onMouseEnter={cancelAccountMenuClose}
            onMouseLeave={scheduleAccountMenuClose}
          >
            {accountMenuOpen && (
              <div className={s.accountMenu}>
                <button className={s.accountMenuItem} onClick={() => goToAccountSection('/settings#profile')}>
                  <span>Мой профиль</span>
                </button>
                <div className={s.accountMenuItemWrap}>
                  <button className={s.accountMenuItem} onClick={() => goToAccountSection('/limits')}>
                    <span>Лимиты</span>
                  </button>
                </div>
                <button className={s.accountMenuItem} onClick={() => goToAccountSection('/pricing')}>
                  <span>Тариф и оплата</span>
                </button>
              </div>
            )}
            <button
              className={`${s.userCard}${accountMenuOpen || isProfilePage ? ' ' + s.userCardActive : ''}`}
              onClick={() => {
                cancelAccountMenuClose();
                setAccountMenuOpen((open) => !open);
              }}
              aria-expanded={accountMenuOpen}
              aria-haspopup="menu"
              aria-current={isProfilePage ? 'page' : undefined}
            >
              <div className={s.avatar}>{initials}</div>
              <div className={s.userMeta}>
                <div className={s.userName}>{user?.name ?? user?.email ?? 'Психолог'}</div>
                <div className={s.userPlan}>{userPlanLabel}</div>
              </div>
              <span className={s.accountGear} aria-hidden="true">⚙</span>
            </button>
          </div>
        </div>
      </aside>

      {/* ── Main ─────────────────────────────────────────────────── */}
      <div className={s.main}>
        <header className={s.topbar} aria-label={title}>
          <div className={s.topbarSpacer} aria-hidden="true" />
          <div className={s.topbarLimits}>
            <SectionUsageLimits section={localLimitsSection ?? 'overview'} />
          </div>
        </header>
        <main className={appLocationPath === '/dashboard' || isAiWorkspace ? `${s.contentFull}${isAiDialog ? ' ' + s.contentAiDialog : ''}${isScrollableAiWorkspace ? ' ' + s.contentFullScrollable : ''}` : s.content}>
          {projectsLoading && projects.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', fontSize: 14 }}>
              Загрузка…
            </div>
          ) : (
            <ErrorBoundary key={`${activeProjectId ?? 'no-project'}:${appLocationPath}`}>
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
            <div className={s.modalLimits}>
              <SectionUsageLimits section="projects" />
            </div>
            <div className={s.modalActions}>
              <button className={s.modalCancel} onClick={() => { setShowModal(false); setCreateError(''); }} disabled={createLoading}>
                Отмена
              </button>
              <button
                className={s.modalCreate}
                onClick={() => void handleCreateProject()}
                disabled={!newProjectName.trim() || createLoading || Boolean(billing && billing.publicLimits.projectsRemaining <= 0)}
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
