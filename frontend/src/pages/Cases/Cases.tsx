import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  casesApi,
  type CaseStudy,
  type CaseStudyStatus,
  type CreateCaseStudyInput,
  type UpdateCaseStudyInput,
} from '../../api/cases';
import CaseCreateDialog from '../../components/Cases/CaseCreateDialog';
import CaseEditor, { type CaseDraft } from '../../components/Cases/CaseEditor';
import CaseList from '../../components/Cases/CaseList';
import { useProjectsStore } from '../../store/projects.store';
import { appPath } from '../../utils/appRoutes';
import s from './Cases.module.css';

type Filter = 'all' | CaseStudyStatus;

function toDraft(record: CaseStudy): CaseDraft {
  return {
    title: record.title,
    beforeText: record.beforeText,
    actionsText: record.actionsText,
    afterText: record.afterText,
    clientTask: record.clientTask,
    clientProblem: record.clientProblem,
    desiredResult: record.desiredResult,
    marketingInsight: record.marketingInsight,
    status: record.status,
  };
}

function getErrorMessage(error: unknown, fallback: string): string {
  const responseError = error as { response?: { data?: { error?: string } }; message?: string };
  return responseError.response?.data?.error || responseError.message || fallback;
}

export default function Cases() {
  const { caseId } = useParams<{ caseId?: string }>();
  const navigate = useNavigate();
  const activeProjectId = useProjectsStore((state) => state.activeProjectId);
  const [cases, setCases] = useState<CaseStudy[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selected, setSelected] = useState<CaseStudy | null>(null);
  const [draft, setDraft] = useState<CaseDraft | null>(null);

  const dirty = useMemo(() => {
    if (!selected || !draft) return false;
    return JSON.stringify(toDraft(selected)) !== JSON.stringify(draft);
  }, [draft, selected]);

  const visibleCases = useMemo(
    () => filter === 'all' ? cases : cases.filter((record) => record.status === filter),
    [cases, filter],
  );

  const chooseRecord = useCallback((record: CaseStudy, replace = false) => {
    setSelected(record);
    setDraft(toDraft(record));
    navigate(appPath(`/strategy/cases/${record.id}`), { replace });
  }, [navigate]);

  const closeCreateDialog = useCallback(() => setCreateDialogOpen(false), []);

  useEffect(() => {
    if (!activeProjectId) {
      setCases([]);
      setSelected(null);
      setDraft(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    casesApi.list(activeProjectId)
      .then(async (items) => {
        if (cancelled) return;
        setCases(items);
        if (caseId) {
          const fromList = items.find((item) => item.id === caseId);
          if (fromList) {
            setSelected(fromList);
            setDraft(toDraft(fromList));
            return;
          }
          try {
            const direct = await casesApi.get(activeProjectId, caseId);
            if (!cancelled) {
              setCases((current) => [direct, ...current]);
              setSelected(direct);
              setDraft(toDraft(direct));
            }
          } catch {
            if (!cancelled) {
              toast.error('Кейс не найден');
              navigate(appPath('/strategy/cases'), { replace: true });
            }
          }
          return;
        }

        setSelected(items[0] ?? null);
        setDraft(items[0] ? toDraft(items[0]) : null);
      })
      .catch((error) => {
        if (!cancelled) toast.error(getErrorMessage(error, 'Не удалось загрузить кейсы'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [activeProjectId, caseId, navigate]);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  function confirmDiscard(): boolean {
    return !dirty || window.confirm('Есть несохранённые изменения. Продолжить без сохранения?');
  }

  function handleSelect(record: CaseStudy) {
    if (!confirmDiscard()) return;
    chooseRecord(record);
  }

  function handleAdd() {
    if (!activeProjectId || !confirmDiscard()) return;
    setCreateDialogOpen(true);
  }

  async function handleCreate(input: CreateCaseStudyInput) {
    if (!activeProjectId || creating) return;
    setCreating(true);
    try {
      const created = await casesApi.create(activeProjectId, input);
      setCases((current) => [created, ...current]);
      setFilter('all');
      closeCreateDialog();
      chooseRecord(created);
      toast.success('Черновик кейса создан');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Не удалось создать кейс'));
    } finally {
      setCreating(false);
    }
  }

  function handleDraftChange(patch: UpdateCaseStudyInput) {
    setDraft((current) => current ? { ...current, ...patch } : current);
  }

  async function persist(patch?: UpdateCaseStudyInput) {
    if (!activeProjectId || !selected || !draft || saving) return;
    setSaving(true);
    try {
      const payload: UpdateCaseStudyInput = patch ?? draft;
      const updated = await casesApi.update(activeProjectId, selected.id, payload);
      setCases((current) => current.map((record) => record.id === updated.id ? updated : record));
      setSelected(updated);
      setDraft(toDraft(updated));
      toast.success('Кейс сохранён');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Не удалось сохранить кейс'));
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleStatus() {
    if (!draft) return;
    await persist({ ...draft, status: draft.status === 'ready' ? 'draft' : 'ready' });
  }

  async function handleDelete() {
    if (!activeProjectId || !selected) return;
    if (!window.confirm(`Удалить кейс «${selected.title}»? Это действие нельзя отменить.`)) return;
    try {
      await casesApi.remove(activeProjectId, selected.id);
      const remaining = cases.filter((record) => record.id !== selected.id);
      setCases(remaining);
      setSelected(remaining[0] ?? null);
      setDraft(remaining[0] ? toDraft(remaining[0]) : null);
      navigate(appPath('/strategy/cases'), { replace: true });
      toast.success('Кейс удалён');
    } catch (error) {
      toast.error(getErrorMessage(error, 'Не удалось удалить кейс'));
    }
  }

  function handleBack() {
    if (!confirmDiscard()) return;
    setSelected(null);
    setDraft(null);
    navigate(appPath('/strategy/cases'));
  }

  if (!activeProjectId) {
    return (
      <div className={s.noProject}>
        <h1>Кейсы</h1>
        <p>Выберите или создайте проект, чтобы собирать его клиентские кейсы.</p>
      </div>
    );
  }

  return (
    <div className={`${s.page} ${caseId ? s.mobileDetailOpen : ''}`}>
      <CaseList
        cases={visibleCases}
        selectedId={selected?.id ?? null}
        filter={filter}
        loading={loading}
        onFilterChange={setFilter}
        onSelect={handleSelect}
        onAdd={handleAdd}
      />

      <section className={s.detailColumn} aria-label="Карточка кейса">
        {selected && draft ? (
          <CaseEditor
            record={selected}
            draft={draft}
            saving={saving}
            dirty={dirty}
            onChange={handleDraftChange}
            onSave={() => void persist()}
            onToggleStatus={() => void handleToggleStatus()}
            onDelete={() => void handleDelete()}
            onBack={handleBack}
          />
        ) : (
          <div className={s.detailEmpty}>
            <div className={s.emptyIcon} aria-hidden="true">▤</div>
            <h2>Соберите первый кейс</h2>
            <p>Опишите исходную ситуацию, вашу работу и результат клиента. Ручное создание не расходует AI-баллы.</p>
            <button type="button" className={s.primaryButton} onClick={handleAdd}>
              Добавить кейс
            </button>
          </div>
        )}
      </section>

      <CaseCreateDialog
        open={createDialogOpen}
        saving={creating}
        onClose={closeCreateDialog}
        onCreate={(input) => void handleCreate(input)}
      />
    </div>
  );
}
