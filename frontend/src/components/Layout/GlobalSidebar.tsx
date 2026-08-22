import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { GLOBAL_NAVIGATION } from '../../config/app-navigation';
import { appPath } from '../../utils/appRoutes';
import NavigationIcon from './NavigationIcon';
import type { GlobalNavigationSectionId } from './navigation.types';
import s from './Layout.module.css';

interface GlobalSidebarProps {
  activeSectionId: GlobalNavigationSectionId | null;
  unfinishedTasksCount: number;
  onLogoClick: () => void;
  children: ReactNode;
}

const DIVIDER_BEFORE = new Set<GlobalNavigationSectionId>([
  'projects',
  'analytics',
  'settings',
]);

export default function GlobalSidebar({
  activeSectionId,
  unfinishedTasksCount,
  onLogoClick,
  children,
}: GlobalSidebarProps) {
  return (
    <aside className={s.globalSidebar} aria-label="Основная навигация">
      <button
        type="button"
        className={s.globalLogo}
        onClick={onLogoClick}
        aria-label="Luma IQ — проекты"
      >
        <img
          src="/assets/luma-iq/01_logos/luma-iq-favicon.svg"
          width="34"
          height="34"
          alt=""
          aria-hidden="true"
          draggable={false}
        />
        <span className={s.globalTooltip} role="tooltip">Luma IQ</span>
      </button>

      <nav className={s.globalNav} aria-label="Разделы Luma IQ">
        {GLOBAL_NAVIGATION.map((section) => {
          const active = section.id === activeSectionId;
          const taskCount = section.id === 'tasks' ? unfinishedTasksCount : 0;
          const content = (
            <>
              <NavigationIcon icon={section.icon} />
              {taskCount > 0 ? (
                <span
                  className={s.globalTaskBadge}
                  aria-label={`Незавершённых задач: ${taskCount}`}
                >
                  {taskCount > 99 ? '99+' : taskCount}
                </span>
              ) : null}
              <span className={s.globalTooltip} role="tooltip">
                {section.label}{section.comingSoon ? ' — в разработке' : ''}
              </span>
            </>
          );

          return (
            <div
              key={section.id}
              className={DIVIDER_BEFORE.has(section.id) ? s.globalNavGroupStart : undefined}
            >
              <Link
                to={appPath(section.path)}
                className={`${s.globalNavItem}${active ? ` ${s.globalNavItemActive}` : ''}`}
                aria-label={section.comingSoon ? `${section.label} — раздел в разработке` : section.label}
                aria-current={active ? 'page' : undefined}
              >
                {content}
              </Link>
            </div>
          );
        })}
      </nav>

      <div className={s.globalSidebarFooter}>{children}</div>
    </aside>
  );
}
