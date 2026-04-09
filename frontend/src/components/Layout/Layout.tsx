import { NavLink, useLocation } from 'react-router-dom';
import s from './Layout.module.css';

interface NavItem {
  path: string;
  label: string;
  icon: string;
}

const mainNav: NavItem[] = [
  { path: '/chat', label: 'Чат-упаковка', icon: '💬' },
  { path: '/products', label: 'Продукты КПТ', icon: '📦' },
  { path: '/texts', label: 'Генерация текстов', icon: '✍️' },
  { path: '/audience', label: 'Целевая аудитория', icon: '🎯' },
];

const toolsNav: NavItem[] = [
  { path: '/education', label: 'Обучение', icon: '🎓' },
  { path: '/history', label: 'История', icon: '🕐' },
  { path: '/tariff', label: 'Тарифы', icon: '💎' },
  { path: '/settings', label: 'Настройки', icon: '⚙️' },
];

const pageTitles: Record<string, string> = {
  '/chat': 'Чат-упаковка по JTBD',
  '/products': 'Продукты КПТ',
  '/texts': 'Генерация текстов',
  '/audience': 'Целевая аудитория',
  '/education': 'Обучение',
  '/history': 'История',
  '/tariff': 'Тарифы и оплата',
  '/settings': 'Настройки',
};

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const title = pageTitles[location.pathname] ?? 'PSY Boost';

  return (
    <div className={s.root}>
      <aside className={s.sidebar}>
        <div className={s.logo}>
          <div className={s.logoIcon}>P</div>
          <span className={s.logoText}>PSY Boost</span>
        </div>

        <nav className={s.nav}>
          <div className={s.navSection}>
            <div className={s.navLabel}>Инструменты</div>
            {mainNav.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `${s.navLink}${isActive ? ' ' + s.active : ''}`
                }
              >
                <span className={s.navIcon}>{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
          </div>

          <div className={s.navSection}>
            <div className={s.navLabel}>Прочее</div>
            {toolsNav.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `${s.navLink}${isActive ? ' ' + s.active : ''}`
                }
              >
                <span className={s.navIcon}>{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
          </div>
        </nav>

        <div className={s.sidebarFooter}>
          <div className={s.userCard}>
            <div className={s.avatar}>П</div>
            <div>
              <div className={s.userName}>Психолог</div>
              <div className={s.userPlan}>Бесплатный тариф</div>
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
