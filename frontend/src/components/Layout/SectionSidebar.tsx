import { useEffect, useRef } from 'react';
import { ChevronRight, X } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import type { LocalProject } from '../../store/projects.store';
import { appPath } from '../../utils/appRoutes';
import NavigationIcon from './NavigationIcon';
import ProjectSwitcher from './ProjectSwitcher';
import SidebarBalance from './SidebarBalance';
import type { BillingMe } from '../../api/billing.api';
import type {
  GlobalNavigationSection,
  SectionNavigationItem,
} from './navigation.types';
import s from './Layout.module.css';

interface SectionSidebarProps {
  section: GlobalNavigationSection;
  activeSubsectionId: string | null;
  projects: readonly LocalProject[];
  activeProjectId: string;
  onSelectProject: (projectId: string) => void;
  onCreateProject: () => void;
  onRenameProject: (projectId: string, name: string) => Promise<void>;
  onArchiveProject: (project: LocalProject) => Promise<void>;
  onDeleteProject: (project: LocalProject) => void;
  billing: BillingMe | null;
  billingLoading: boolean;
  billingError: boolean;
  drawerOpen: boolean;
  onClose: () => void;
  onNavigate: () => void;
}

function subsectionPath(item: SectionNavigationItem, activeProjectId: string): string {
  if (item.id === 'project-details') {
    return activeProjectId ? `/projects/${activeProjectId}` : '/dashboard';
  }
  return item.path;
}

export default function SectionSidebar({
  section,
  activeSubsectionId,
  projects,
  activeProjectId,
  onSelectProject,
  onCreateProject,
  onRenameProject,
  onArchiveProject,
  onDeleteProject,
  billing,
  billingLoading,
  billingError,
  drawerOpen,
  onClose,
  onNavigate,
}: SectionSidebarProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!drawerOpen) return;
    const timer = window.setTimeout(() => closeButtonRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, [drawerOpen]);

  return (
    <aside
      className={`${s.sectionSidebar}${drawerOpen ? ` ${s.sectionSidebarDrawerOpen}` : ''}`}
      aria-label={`Навигация раздела ${section.label}`}
    >
      <div className={s.sectionSidebarHeader}>
        <span className={s.sectionSidebarIcon} aria-hidden="true">
          <NavigationIcon icon={section.icon} size={20} />
        </span>
        <h2>{section.label}</h2>
        <button
          ref={closeButtonRef}
          type="button"
          className={s.sectionSidebarClose}
          onClick={onClose}
          aria-label={`Закрыть меню раздела ${section.label}`}
        >
          <X aria-hidden="true" size={19} strokeWidth={1.8} />
        </button>
      </div>

      <div className={s.sectionSidebarBody}>
        {section.projectScoped ? (
          <ProjectSwitcher
            projects={projects}
            activeProjectId={activeProjectId}
            showManagementActions={section.id === 'projects'}
            onSelect={(projectId) => {
              onSelectProject(projectId);
              onNavigate();
            }}
            onCreate={onCreateProject}
            onRename={onRenameProject}
            onArchive={onArchiveProject}
            onDelete={onDeleteProject}
          />
        ) : null}

        <nav className={s.sectionSidebarNav} aria-label={`Подразделы: ${section.label}`}>
          {(section.children ?? []).map((item) => {
            const active = item.id === activeSubsectionId;
            return (
              <NavLink
                key={item.id}
                to={appPath(subsectionPath(item, activeProjectId))}
                className={`${s.sectionSidebarLink}${active ? ` ${s.sectionSidebarLinkActive}` : ''}`}
                aria-current={active ? 'page' : undefined}
                onClick={onNavigate}
              >
                <span>{item.label}</span>
                <ChevronRight aria-hidden="true" size={15} strokeWidth={1.8} />
              </NavLink>
            );
          })}
        </nav>
      </div>

      <SidebarBalance
        billing={billing}
        loading={billingLoading}
        error={billingError}
      />
    </aside>
  );
}
