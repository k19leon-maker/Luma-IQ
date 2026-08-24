import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { GLOBAL_NAVIGATION } from '../../config/app-navigation';
import { appPath } from '../../utils/appRoutes';
import NavigationIcon from './NavigationIcon';
import type { GlobalNavigationSectionId } from './navigation.types';
import s from './Layout.module.css';

interface GlobalSidebarProps {
  activeSectionId: GlobalNavigationSectionId | null;
  openSectionId: GlobalNavigationSectionId | null;
  unfinishedTasksCount: number;
  onLogoClick: () => void;
  onOpenSection: (
    sectionId: GlobalNavigationSectionId,
    trigger: HTMLButtonElement,
  ) => void;
  onNavigate: () => void;
  children: ReactNode;
}

const DIVIDER_BEFORE = new Set<GlobalNavigationSectionId>([
  'projects',
  'analytics',
  'settings',
]);

export default function GlobalSidebar({
  activeSectionId,
  openSectionId,
  unfinishedTasksCount,
  onLogoClick,
  onOpenSection,
  onNavigate,
  children,
}: GlobalSidebarProps) {
  const [navTooltip, setNavTooltip] = useState<{ label: string; top: number } | null>(null);

  const showNavTooltip = (target: HTMLElement, label: string) => {
    const rect = target.getBoundingClientRect();
    setNavTooltip({ label, top: rect.top + rect.height / 2 });
  };

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

      <nav
        className={s.globalNav}
        aria-label="Разделы Luma IQ"
        onScroll={() => setNavTooltip(null)}
      >
        {GLOBAL_NAVIGATION.map((section) => {
          const current = section.id === activeSectionId;
          const menuOpen = section.id === openSectionId;
          const highlighted = menuOpen || (!openSectionId && current);
          const taskCount = section.id === 'tasks' ? unfinishedTasksCount : 0;
          const className = `${s.globalNavItem}${highlighted ? ` ${s.globalNavItemActive}` : ''}`;
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
            </>
          );
          const tooltipLabel = `${section.label}${section.comingSoon ? ' — в разработке' : ''}`;

          return (
            <div
              key={section.id}
              className={DIVIDER_BEFORE.has(section.id) ? s.globalNavGroupStart : undefined}
            >
              {section.hasSubNavigation ? (
                <button
                  type="button"
                  className={className}
                  data-navigation-section={section.id}
                  aria-label={`Открыть меню раздела ${section.label}`}
                  aria-haspopup="menu"
                  aria-controls="section-sidebar"
                  aria-expanded={menuOpen}
                  onMouseEnter={(event) => showNavTooltip(event.currentTarget, tooltipLabel)}
                  onMouseLeave={() => setNavTooltip(null)}
                  onFocus={(event) => showNavTooltip(event.currentTarget, tooltipLabel)}
                  onBlur={() => setNavTooltip(null)}
                  onClick={(event) => onOpenSection(section.id, event.currentTarget)}
                >
                  {content}
                </button>
              ) : (
                <Link
                  to={appPath(section.path)}
                  className={className}
                  data-navigation-section={section.id}
                  aria-label={section.comingSoon ? `${section.label} — раздел в разработке` : section.label}
                  aria-current={current ? 'page' : undefined}
                  onMouseEnter={(event) => showNavTooltip(event.currentTarget, tooltipLabel)}
                  onMouseLeave={() => setNavTooltip(null)}
                  onFocus={(event) => showNavTooltip(event.currentTarget, tooltipLabel)}
                  onBlur={() => setNavTooltip(null)}
                  onClick={onNavigate}
                >
                  {content}
                </Link>
              )}
            </div>
          );
        })}
      </nav>

      {navTooltip ? (
        <span
          className={`${s.globalTooltip} ${s.globalTooltipVisible} ${s.globalNavTooltip}`}
          style={{ top: navTooltip.top }}
          role="tooltip"
        >
          {navTooltip.label}
        </span>
      ) : null}

      <div className={s.globalSidebarFooter}>{children}</div>
    </aside>
  );
}
