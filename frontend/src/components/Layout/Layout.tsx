import { useState, useRef, useEffect, useCallback } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/auth.store';
import { useProjectsStore } from '../../store/projects.store';
import AddToPlanModal from '../AddToPlanModal/AddToPlanModal';
import s from './Layout.module.css';

/* ── Types ─────────────────────────────────────────────────────── */

interface NavItem {
  path: string;
  label: string;
  icon: string;
  needsStrategy?: boolean;
}

const packagingNav: NavItem[] = [
  { path: '/strategy',     label: 'Стратегия',       icon: '🎯' },
  { path: '/product-main', label: 'Основной продукт', icon: '🚀', needsStrategy: true },
  { path: '/product-mini', label: 'Мини-продукт',     icon: '⚡', needsStrategy: true },
  { path: '/product-free', label: 'Бесплатный продукт', icon: '🎁', needsStrategy: true },
];

const contentNav: NavItem[] = [
  { path: '/posts',           label: 'Посты',               icon: '📱', needsStrategy: true },
  { path: '/reels',           label: 'Рилсы',               icon: '🎬', needsStrategy: true },
  { path: '/articles',        label: 'Статьи',              icon: '📝', needsStrategy: true },
  { path: '/video-scripts',   label: 'Сценарии видео',      icon: '🎥', needsStrategy: true },
  { path: '/chatbot-chains',  label: 'Цепочка текстов',     icon: '🤖', needsStrategy: true },
];

const filesNav: NavItem[] = [
  { path: '/files/materials', label: 'Материалы',  icon: '📁' },
  { path: '/files/products',  label: 'Продукты',   icon: '📦' },
];

const pageTitles: Record<string, string> = {
  '/strategy':        'Стратегия',
  '/product-main':    'Основной продукт',
  '/product-mini':    'Мини-продукт',
  '/product-free':    'Бесплатный продукт',
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
};

// Pages that show the "complete strategy first" banner.
// Content pages (/posts и т.д.) используют full-bleed layout — banner там не нужен.
const SHOW_STRATEGY_BANNER = new Set([
  '/product-main', '/product-mini', '/product-free',
]);

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

  const showBanner = SHOW_STRATEGY_BANNER.has(location.pathname);

  /* Projects from store */
  const projects           = useProjectsStore((s) => s.projects);
  const activeProjectId    = useProjectsStore((s) => s.activeProjectId);
  const loadProjects       = useProjectsStore((s) => s.loadProjects);
  const addProject         = useProjectsStore((s) => s.addProject);
  const removeProject      = useProjectsStore((s) => s.removeProject);
  const renameProject      = useProjectsStore((s) => s.renameProject);
  const setActiveProjectId = useProjectsStore((s) => s.setActiveProjectId);

  useEffect(() => { void loadProjects(); }, []); // eslint-disable-line

  const projectMatch = location.pathname.match(/^\/projects\/(.+)$/);
  const title = projectMatch
    ? (projects.find((p) => p.id === projectMatch[1])?.name ?? 'Проект')
    : (pageTitles[location.pathname] ?? 'PSY Boost');

  /* New project modal */
  const [showModal,      setShowModal]      = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
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
    if (!name) return;
    setNewProjectName('');
    setShowModal(false);
    const proj = await addProject(name);
    navigate(`/projects/${proj.id}`);
  };

  /* User avatar */
  const initials = user?.name
    ? user.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
    : user?.email?.[0]?.toUpperCase() ?? 'П';

  return (
    <div className={s.root}>
      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside className={s.sidebar}>
        <div className={s.logo}>
          <div className={s.logoIcon}>P</div>
          <span className={s.logoText}>PSY Boost</span>
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
                    onClick={() => { setActiveProjectId(p.id); navigate(`/projects/${p.id}`); }}
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
                        if (confirm(`Удалить проект «${p.name}»?`)) void removeProject(p.id);
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

          {/* Упаковка */}
          <Section title="Упаковка">
            {packagingNav.map((item) => (
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
        <header className={s.topbar}>
          <h1 className={s.topbarTitle}>{title}</h1>
          <div className={s.topbarActions} />
        </header>
        <main className={s.content}>
          {showBanner && (
            <div className={s.strategyBanner}>
              💡 Для лучшего результата рекомендуем начать со{' '}
              <NavLink to="/strategy" className={s.bannerLink}>Стратегии</NavLink>
            </div>
          )}
          {children}
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
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void handleCreateProject()}
            />
            <div className={s.modalActions}>
              <button className={s.modalCancel} onClick={() => setShowModal(false)}>
                Отмена
              </button>
              <button
                className={s.modalCreate}
                onClick={() => void handleCreateProject()}
                disabled={!newProjectName.trim()}
              >
                Создать и начать стратегию
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
