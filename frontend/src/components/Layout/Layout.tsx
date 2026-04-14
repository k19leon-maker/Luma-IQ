import { NavLink, useLocation } from 'react-router-dom';
import { useProgressStore } from '../../store/progress.store';
import { useAuthStore } from '../../store/auth.store';
import s from './Layout.module.css';

interface StageItem {
  path: string;
  label: string;
  icon: string;
  requiresStrategy?: boolean;
}

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
  const location = useLocation();
  const title = pageTitles[location.pathname] ?? 'PSY Boost';
  const strategyCompleted = useProgressStore((s) => s.strategyCompleted);
  const user = useAuthStore((s) => s.user);

  const initials = user?.name
    ? user.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
    : user?.email?.[0]?.toUpperCase() ?? 'П';

  return (
    <div className={s.root}>
      <aside className={s.sidebar}>
        <div className={s.logo}>
          <div className={s.logoIcon}>P</div>
          <span className={s.logoText}>PSY Boost</span>
        </div>

        <nav className={s.nav}>
          <div className={s.navSection}>
            <div className={s.navLabel}>Этапы упаковки</div>

            {stages.map((item) => {
              const locked = item.requiresStrategy && !strategyCompleted;

              if (locked) {
                return (
                  <div key={item.path} className={`${s.navLink} ${s.locked}`}>
                    <span className={s.navIcon}>{item.icon}</span>
                    <span className={s.navLinkLabel}>{item.label}</span>
                    <span className={s.lockIcon}>🔒</span>
                  </div>
                );
              }

              return (
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
              );
            })}
          </div>

          <div className={s.navSection}>
            <div className={s.navLabel}>Прочее</div>
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

      <div className={s.main}>
        <header className={s.topbar}>
          <h1 className={s.topbarTitle}>{title}</h1>
          <div className={s.topbarActions} />
        </header>
        <main className={s.content}>{children}</main>
      </div>
    </div>
  );
}
