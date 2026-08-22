import { useState } from 'react';
import {
  Archive,
  ArchiveRestore,
  ChevronDown,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import type { LocalProject } from '../../store/projects.store';
import s from './Layout.module.css';

interface ProjectSwitcherProps {
  projects: readonly LocalProject[];
  activeProjectId: string;
  showManagementActions: boolean;
  onSelect: (projectId: string) => void;
  onCreate: () => void;
  onRename: (projectId: string, name: string) => Promise<void>;
  onArchive: (project: LocalProject) => Promise<void>;
  onDelete: (project: LocalProject) => void;
}

export default function ProjectSwitcher({
  projects,
  activeProjectId,
  showManagementActions,
  onSelect,
  onCreate,
  onRename,
  onArchive,
  onDelete,
}: ProjectSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? projects[0];

  const startRename = (project: LocalProject) => {
    setRenamingId(project.id);
    setRenameValue(project.name);
  };

  const finishRename = async () => {
    if (!renamingId) return;
    const nextName = renameValue.trim();
    setRenamingId(null);
    if (!nextName) return;
    await onRename(renamingId, nextName);
  };

  return (
    <div className={s.projectSwitcher}>
      <span className={s.projectSwitcherLabel}>Активный проект</span>
      <button
        type="button"
        className={`${s.projectSwitcherTrigger}${open ? ` ${s.projectSwitcherTriggerOpen}` : ''}`}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls="layout-project-switcher-list"
      >
        {activeProject ? (
          <>
            <span className={s.projectSwitcherDot} style={{ background: activeProject.color }} aria-hidden="true" />
            <span className={s.projectSwitcherName}>
              {activeProject.name}{activeProject.status === 'ARCHIVED' ? ' · архив' : ''}
            </span>
          </>
        ) : (
          <span className={s.projectSwitcherName}>Проект не выбран</span>
        )}
        <ChevronDown aria-hidden="true" size={17} strokeWidth={2} />
      </button>

      {open ? (
        <div id="layout-project-switcher-list" className={s.projectSwitcherList}>
          {projects.length === 0 ? (
            <p className={s.projectSwitcherEmpty}>Пока нет проектов</p>
          ) : projects.map((project) => (
            <div
              key={project.id}
              className={`${s.projectSwitcherItem}${project.id === activeProjectId ? ` ${s.projectSwitcherItemActive}` : ''}`}
            >
              {renamingId === project.id ? (
                <input
                  className={s.projectSwitcherRename}
                  value={renameValue}
                  onChange={(event) => setRenameValue(event.target.value)}
                  onBlur={() => void finishRename()}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur();
                    if (event.key === 'Escape') {
                      setRenameValue(project.name);
                      event.currentTarget.blur();
                    }
                  }}
                  aria-label={`Новое название проекта ${project.name}`}
                  autoFocus
                />
              ) : (
                <button
                  type="button"
                  className={s.projectSwitcherSelect}
                  onClick={() => {
                    onSelect(project.id);
                    setOpen(false);
                  }}
                  aria-pressed={project.id === activeProjectId}
                >
                  <span className={s.projectSwitcherDot} style={{ background: project.color }} aria-hidden="true" />
                  <span>{project.name}{project.status === 'ARCHIVED' ? ' · архив' : ''}</span>
                </button>
              )}

              {showManagementActions && renamingId !== project.id ? (
                <div className={s.projectSwitcherActions}>
                  <button
                    type="button"
                    onClick={() => startRename(project)}
                    aria-label={`Переименовать проект ${project.name}`}
                    title="Переименовать"
                  >
                    <Pencil aria-hidden="true" size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => void onArchive(project)}
                    aria-label={`${project.status === 'ARCHIVED' ? 'Вернуть в работу' : 'Архивировать'} проект ${project.name}`}
                    title={project.status === 'ARCHIVED' ? 'Вернуть в работу' : 'Архивировать'}
                  >
                    {project.status === 'ARCHIVED'
                      ? <ArchiveRestore aria-hidden="true" size={14} />
                      : <Archive aria-hidden="true" size={14} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(project)}
                    aria-label={`Удалить проект ${project.name}`}
                    title="Удалить"
                  >
                    <Trash2 aria-hidden="true" size={14} />
                  </button>
                </div>
              ) : null}
            </div>
          ))}

          {showManagementActions ? (
            <button
              type="button"
              className={s.projectSwitcherCreate}
              onClick={() => {
                setOpen(false);
                onCreate();
              }}
            >
              <Plus aria-hidden="true" size={16} />
              Новый проект
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
