import { useState, useRef, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useProgressStore } from '../../store/progress.store';
import { useAuthStore } from '../../store/auth.store';
import s from './Layout.module.css';

interface StageItem {
  path: string;
  label: string;
  icon: string;
  requiresStrategy?: boolean;
}

interface Project {
  id: string;
  name: string;
  color: string;
}

const INITIAL_PROJECTS: Project[] = [
  { id: 'p1', name: 'Ссоры в паре',         color: '#7c6cfc' },
  { id: 'p2', name: 'Тревога у подростков', color: '#4caf82' },
  { id: 'p3', name: 'Выгорание мам',        color: '#f0a030' },
];

const PROJECT_COLORS = ['#7c6cfc', '#4caf82', '#f0a030', '#e05c5c', '#5cb8e0', '#c45cf0'];

const stages: StageItem[] = [
  { path: '/strategy',     label: 'Стратегия',        icon: '🎯' },
  { path: '/product-main', label: 'Основной продукт',  icon: '🚀', requiresStrategy: true },
  { path: '/product-mini', label: 'Короткий продукт',  icon: '⚡', requiresStrategy: true },
  { path: '/lead-magnet',  label: 'Лид-магнит',        icon: '📄', requiresStrategy: true },
  { path: '/reels',        label: 'Рилсы',             icon: '🎬', requiresStrategy: true },
  { path: '/posts',        label: 'Посты',             icon: '📱', requiresStrategy: true },
];

const bottomNav = [
  { path: '/history',  label: 'История',   icon: '🕐' },
  { path: '/settings', label: 'Настройки', icon: '⚙️' },
];

const pageTitles: Record<string, string> = {
  '/strategy':     'Стратегия',
  '/product-main': 'Основной продукт',
  '/product-mini': 'Короткий продукт',
  '/lead-magnet':  'Лид-магнит',
  '/reels':        'Рилсы',
  '/posts':        'Посты',
  '/history':      'История',
  '/settings':     'Настройки',
};

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const location  = useLocation();
  const navigate  = useNavigate();
  const title     = pageTitles[location.pathname] ?? 'PSY Boost';

  const strategyCompleted = useProgressStore((st) => st.strategyCompleted);
  const user              = useAuthStore((st) => st.user);

  const [projectsOpen,   setProjectsOpen]   = useState(true);
  const [stagesOpen,     setStagesOpen]     = useState(true);
  const [projects,       setProjects]       = useState<Project[]>(INITIAL_PROJECTS);
  const [activeProjectId, setActiveProjectId] = useState('p1');

  const [showModal,       setShowModal]       = useState(false);
  const [newProjectName,  setNewProjectName]  = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showModal) {
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [showModal]);

  const handleCreateProject = () => {
    const name = newProjectName.trim();
    if (!name) return;
    const id    = `p-${Date.now()}`;
    const color = PROJECT_COLORS[projects.length % PROJECT_COLORS.length];
    setProjects((prev) => [...prev, { id, name, color }]);
    setActiveProjectId(id);
    setNewProjectName('');
    setShowModal(false);
    navigate('/strategy');
  };

  const initials = user?.name
    ? user.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
    : user?.email?.[0]?.toUpperCase() ?? 'П';

  const currentStage = stages.find((st) => st.path === location.pathname);
  const showBanner   = !!(currentStage?.requiresStrategy && !strategyCompleted);

  return (
    <div className={s.root}>
      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside className={s.sidebar}>
        <div className={s.logo}>
          <div className={s.logoIcon}>P</div>
          <span className={s.logoText}>PSY Boost</span>
        </div>

        <nav className={s.nav}>

          {/* ── Проекты ── */}
          <div className={s.navSection}>
            <button
              className={s.sectionHeader}
              onClick={() => setProjectsOpen((v) => !v)}
            >
              <span className={s.sectionTitle}>Проекты</span>
              <span className={`${s.arrow}${projectsOpen ? ' ' + s.arrowOpen : ''}`}>▾</span>
            </button>

            {projectsOpen && (
              <div className={s.sectionBody}>
                {projects.map((p) => (
                  <button
                    key={p.id}
                    className={`${s.projectItem}${p.id === activeProjectId ? ' ' + s.projectActive : ''}`}
                    onClick={() => setActiveProjectId(p.id)}
                  >
                    <span className={s.projectDot} style={{ background: p.color }} />
                    <span className={s.projectName}>{p.name}</span>
                  </button>
                ))}
                <button className={s.newProjectBtn} onClick={() => setShowModal(true)}>
                  + Новый проект
                </button>
              </div>
            )}
          </div>

          {/* ── Этапы упаковки ── */}
          <div className={s.navSection}>
            <button
              className={s.sectionHeader}
              onClick={() => setStagesOpen((v) => !v)}
            >
              <span className={s.sectionTitle}>Этапы упаковки</span>
              <span className={`${s.arrow}${stagesOpen ? ' ' + s.arrowOpen : ''}`}>▾</span>
            </button>

            {stagesOpen && (
              <div className={s.sectionBody}>
                {stages.map((item) => {
                  const isHint = !!(item.requiresStrategy && !strategyCompleted);
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      className={({ isActive }) =>
                        `${s.navLink}${isActive ? ' ' + s.active : ''}${isHint ? ' ' + s.hintLocked : ''}`
                      }
                    >
                      <span className={s.navIcon}>{item.icon}</span>
                      <span className={s.navLinkLabel}>{item.label}</span>
                      {isHint && <span className={s.lockIcon}>🔒</span>}
                    </NavLink>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Прочее ── */}
          <div className={s.navSection}>
            {bottomNav.map((item) => (
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
              💡 Рекомендуем сначала пройти{' '}
              <NavLink to="/strategy" className={s.bannerLink}>Стратегию</NavLink>
              {' '}— это поможет ИИ точнее сгенерировать материалы под вашу аудиторию
            </div>
          )}
          {children}
        </main>
      </div>

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
              onKeyDown={(e) => e.key === 'Enter' && handleCreateProject()}
            />
            <div className={s.modalActions}>
              <button className={s.modalCancel} onClick={() => setShowModal(false)}>
                Отмена
              </button>
              <button
                className={s.modalCreate}
                onClick={handleCreateProject}
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
