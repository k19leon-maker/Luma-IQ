import { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { LogOut, Menu, Undo2 } from 'lucide-react';
import { useAuthStore } from '../../store/auth.store';
import { consumeAdminAccessTokenBackup, hasAdminAccessTokenBackup } from '../../api/token-session';
import { authApi } from '../../api/auth.api';
import { SectionUsageLimitsView, useBillingMe } from '../UsageLimits/UsageLimits';
import { useProjectsStore, type LocalProject } from '../../store/projects.store';
import { useProgressStore } from '../../store/progress.store';
import { useTasksStore } from '../../store/tasks.store';
import { useUnpackingStore } from '../../store/unpacking.store';
import AddToPlanModal from '../AddToPlanModal/AddToPlanModal';
import { ErrorBoundary } from '../ErrorBoundary/ErrorBoundary';
import { appPath, stripAppPrefix } from '../../utils/appRoutes';
import { getGlobalNavigationSection } from '../../config/app-navigation';
import GlobalSidebar from './GlobalSidebar';
import SectionSidebar from './SectionSidebar';
import { resolveNavigation } from './navigation-resolver';
import type { GlobalNavigationSectionId } from './navigation.types';
import s from './Layout.module.css';

const pageTitles: Record<string, string> = {
  '/strategy/unpacking':    'Распаковка',
  '/strategy/about':        'О себе',
  '/ai-dialog':             'Диалог с ИИ',
  '/strategy/positioning':  'Позиционирование',
  '/strategy/audience':     'Целевая аудитория',
  '/strategy/castdev':      'CustDev',
  '/strategy/cases':        'Кейсы',
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
  '/analytics':       'Аналитика',
  '/education':       'Обучение',
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

/* ── Layout ────────────────────────────────────────────────────── */

interface LayoutProps { children: React.ReactNode; }

export default function Layout({ children }: LayoutProps) {
  const location  = useLocation();
  const navigate  = useNavigate();
  const appLocationPath = stripAppPrefix(location.pathname);
  const navigationState = resolveNavigation(location.pathname);
  const activeNavigationSection = navigationState.globalSectionId
    ? getGlobalNavigationSection(navigationState.globalSectionId)
    : undefined;
  const activeSectionHasSubNavigation = navigationState.mode === 'app'
    && navigationState.hasSubNavigation
    && Boolean(activeNavigationSection);
  const user      = useAuthStore((st) => st.user);
  const setTokens = useAuthStore((st) => st.setTokens);
  const logout    = useAuthStore((st) => st.logout);
  const [hasAdminBackup, setHasAdminBackup] = useState(() => hasAdminAccessTokenBackup());
  const {
    billing,
    loading: billingLoading,
    error: billingError,
  } = useBillingMe(Boolean(user?.id), user?.id);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [menuSectionId, setMenuSectionId] = useState<GlobalNavigationSectionId | null>(null);
  const [sectionDrawerOpen, setSectionDrawerOpen] = useState(false);
  const sectionDrawerTriggerRef = useRef<HTMLButtonElement>(null);
  const sectionDrawerInvokerRef = useRef<HTMLElement | null>(null);
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

  const closeSectionDrawer = useCallback((restoreFocus = true) => {
    setSectionDrawerOpen(false);
    if (restoreFocus) {
      const trigger = sectionDrawerInvokerRef.current;
      window.requestAnimationFrame(() => trigger?.focus());
    }
  }, []);

  const openSectionDrawer = useCallback((
    sectionId: GlobalNavigationSectionId,
    trigger: HTMLElement,
  ) => {
    sectionDrawerInvokerRef.current = trigger;
    setMenuSectionId(sectionId);
    setSectionDrawerOpen(true);
  }, []);

  useEffect(() => {
    setSectionDrawerOpen(false);
    setMenuSectionId(null);
  }, [location.pathname]);

  useEffect(() => {
    if (!sectionDrawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeSectionDrawer();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeSectionDrawer, sectionDrawerOpen]);

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
  const title = projectMatch
    ? (projects.find((p) => p.id === projectMatch[1])?.name ?? 'Проект')
    : (appLocationPath.startsWith('/strategy/cases') ? 'Кейсы' : (pageTitles[appLocationPath] ?? 'LumaIQ'));

  /* New project modal */
  const [showModal,       setShowModal]       = useState(false);
  const [newProjectName,  setNewProjectName]  = useState('');
  const [createError,     setCreateError]     = useState('');
  const [createLoading,   setCreateLoading]   = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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

  const handleSelectProject = useCallback((projectId: string) => {
    if (!projectId || projectId === activeProjectId) return;
    setActiveProjectId(projectId);
    if (navigationState.globalSectionId === 'projects') {
      navigate(appPath('/dashboard'));
    }
  }, [activeProjectId, navigate, navigationState.globalSectionId, setActiveProjectId]);

  const handleRenameProject = useCallback(async (projectId: string, name: string) => {
    try {
      await renameProject(projectId, name);
      toast.success('Название проекта обновлено');
    } catch {
      toast.error('Не удалось переименовать проект');
    }
  }, [renameProject]);

  const handleArchiveProject = useCallback(async (project: LocalProject) => {
    const archived = project.status !== 'ARCHIVED';
    try {
      await setProjectArchived(project.id, archived);
      toast.success(archived ? 'Проект перемещён в архив' : 'Проект снова активен');
    } catch {
      toast.error('Не удалось изменить статус проекта. Проверьте лимит тарифа.');
    }
  }, [setProjectArchived]);

  const handleDeleteProject = useCallback((project: LocalProject) => {
    toast((toastInstance) => (
      <span style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span>Удалить проект «{project.name}»?</span>
        <span style={{ display: 'flex', gap: 8 }}>
          <button
            style={{ background: '#f25c5c', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 12px', cursor: 'pointer' }}
            onClick={() => {
              toast.dismiss(toastInstance.id);
              void removeProject(project.id).catch(() => toast.error('Не удалось удалить проект'));
            }}
          >
            Удалить
          </button>
          <button
            style={{ background: '#2d2d4e', color: '#e8e8f8', border: 'none', borderRadius: 4, padding: '4px 12px', cursor: 'pointer' }}
            onClick={() => toast.dismiss(toastInstance.id)}
          >
            Отмена
          </button>
        </span>
      </span>
    ), { duration: 6000 });
  }, [removeProject]);

  /* User avatar */
  const initials = user?.name
    ? user.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
    : user?.email?.[0]?.toUpperCase() ?? 'П';
  const userPlanLabel = billing?.plan.name ?? (user as { tariff?: string })?.tariff ?? 'Бесплатный';
  const menuNavigationSection = menuSectionId
    ? getGlobalNavigationSection(menuSectionId)
    : undefined;
  const showSectionSidebar = Boolean(menuNavigationSection?.hasSubNavigation);

  const goToAccountSection = (path: string) => {
    setAccountMenuOpen(false);
    navigate(appPath(path));
  };

  return (
    <div className={s.root}>
      <GlobalSidebar
        activeSectionId={navigationState.globalSectionId}
        openSectionId={sectionDrawerOpen ? menuSectionId : null}
        unfinishedTasksCount={unfinishedTasksCount}
        onLogoClick={() => {
          closeSectionDrawer(false);
          navigate(appPath('/dashboard'));
        }}
        onOpenSection={(sectionId, trigger) => {
          if (sectionDrawerOpen && menuSectionId === sectionId) {
            closeSectionDrawer();
            return;
          }
          openSectionDrawer(sectionId, trigger);
        }}
        onNavigate={() => closeSectionDrawer(false)}
      >
        {hasAdminBackup ? (
          <button
            type="button"
            className={s.globalAdminReturn}
            onClick={() => void restoreAdminSession()}
            aria-label="Вернуться в админку"
          >
            <Undo2 aria-hidden="true" size={19} strokeWidth={1.9} />
            <span className={s.globalTooltip} role="tooltip">Вернуться в админку</span>
          </button>
        ) : null}
        <div
          className={s.accountMenuWrap}
          ref={accountMenuRef}
          onMouseEnter={cancelAccountMenuClose}
          onMouseLeave={scheduleAccountMenuClose}
        >
          {accountMenuOpen ? (
            <div className={s.accountMenu} role="menu">
              <div className={s.accountMenuHeader}>
                <strong>{user?.name ?? user?.email ?? 'Пользователь'}</strong>
                <span>{userPlanLabel}</span>
              </div>
              <button className={s.accountMenuItem} role="menuitem" onClick={() => goToAccountSection('/settings#profile')}>
                Мой профиль
              </button>
              <button className={s.accountMenuItem} role="menuitem" onClick={() => goToAccountSection('/limits')}>
                Лимиты
              </button>
              <button className={s.accountMenuItem} role="menuitem" onClick={() => goToAccountSection('/pricing')}>
                Тариф и оплата
              </button>
              {user?.role === 'ADMIN' ? (
                <button className={s.accountMenuItem} role="menuitem" onClick={() => { setAccountMenuOpen(false); navigate('/admin'); }}>
                  Админка
                </button>
              ) : null}
              <button
                className={`${s.accountMenuItem} ${s.accountMenuLogout}`}
                role="menuitem"
                onClick={() => {
                  setAccountMenuOpen(false);
                  void logout().then(() => navigate('/auth', { replace: true }));
                }}
              >
                <LogOut aria-hidden="true" size={15} strokeWidth={1.9} />
                Выйти
              </button>
            </div>
          ) : null}
          <button
            type="button"
            className={`${s.globalUserButton}${accountMenuOpen || isProfilePage ? ` ${s.globalUserButtonActive}` : ''}`}
            onClick={() => {
              cancelAccountMenuClose();
              setAccountMenuOpen((open) => !open);
            }}
            aria-label={`Профиль: ${user?.name ?? user?.email ?? 'Пользователь'}`}
            aria-expanded={accountMenuOpen}
            aria-haspopup="menu"
            aria-current={isProfilePage ? 'page' : undefined}
          >
            <span className={s.avatar}>{initials}</span>
            <span className={s.globalTooltip} role="tooltip">
              {user?.name ?? user?.email ?? 'Профиль'}
            </span>
          </button>
        </div>
      </GlobalSidebar>

      {showSectionSidebar && menuNavigationSection ? (
        <SectionSidebar
          section={menuNavigationSection}
          activeSubsectionId={menuNavigationSection.id === navigationState.globalSectionId
            ? navigationState.subsectionId
            : null}
          projects={projects}
          activeProjectId={activeProjectId}
          onSelectProject={handleSelectProject}
          onCreateProject={() => {
            closeSectionDrawer(false);
            setShowModal(true);
          }}
          onRenameProject={handleRenameProject}
          onArchiveProject={handleArchiveProject}
          onDeleteProject={handleDeleteProject}
          billing={billing}
          billingLoading={billingLoading}
          billingError={billingError}
          drawerOpen={sectionDrawerOpen}
          onClose={() => closeSectionDrawer()}
          onNavigate={() => closeSectionDrawer(false)}
        />
      ) : null}

      {showSectionSidebar && menuNavigationSection ? (
        <button
          type="button"
          className={`${s.sectionSidebarBackdrop}${sectionDrawerOpen ? ` ${s.sectionSidebarBackdropVisible}` : ''}`}
          onClick={() => closeSectionDrawer()}
          aria-label={`Закрыть меню раздела ${menuNavigationSection.label}`}
          tabIndex={sectionDrawerOpen ? 0 : -1}
        />
      ) : null}

      {/* ── Main ─────────────────────────────────────────────────── */}
      <div className={s.main}>
        {activeSectionHasSubNavigation && activeNavigationSection ? (
          <button
            ref={sectionDrawerTriggerRef}
            type="button"
            className={s.sectionSidebarTrigger}
            onClick={(event) => openSectionDrawer(activeNavigationSection.id, event.currentTarget)}
            aria-label={`Открыть меню раздела ${activeNavigationSection.label}`}
            aria-controls="section-sidebar"
            aria-expanded={sectionDrawerOpen && menuSectionId === activeNavigationSection.id}
          >
            <Menu aria-hidden="true" size={18} strokeWidth={1.9} />
            <span>{activeNavigationSection.label}</span>
          </button>
        ) : null}
        <main
          className={appLocationPath === '/dashboard' || isAiWorkspace ? `${s.contentFull}${isAiDialog ? ' ' + s.contentAiDialog : ''}${isScrollableAiWorkspace ? ' ' + s.contentFullScrollable : ''}` : s.content}
          aria-label={title}
        >
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
              <SectionUsageLimitsView
                section="projects"
                billing={billing}
                loading={billingLoading}
                error={billingError}
              />
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
