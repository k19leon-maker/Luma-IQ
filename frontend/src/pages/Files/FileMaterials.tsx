import { useEffect, useMemo } from 'react';
import { useProjectsStore } from '../../store/projects.store';
import { useAudienceStore, AudienceAnswers } from '../../store/audience.store';
import { useMaterialsStore } from '../../store/materials.store';
import s from './Files.module.css';

interface FileEntry {
  id:      string;
  materialId?: string;
  icon:    string;
  type:    string;
  title:   string;
  content: string;
  date:    string;
  summary?: string;
  summaryStatus?: string;
  linkedCount?: number;
  versionsCount?: number;
}

function tryParse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as T; } catch { return null; }
}

function gatherFiles(projectId: string, audienceAnswers?: Partial<AudienceAnswers>): FileEntry[] {
  const files: FileEntry[] = [];

  // Posts
  const posts = tryParse<{ id: string; theme?: string; postType?: string; editedContent?: string; content?: string }[]>(
    localStorage.getItem(`posts_${projectId}`)
  );
  (posts ?? []).forEach((p) => {
    const body = p.editedContent ?? p.content ?? '';
    if (body.trim()) files.push({ id: `post_${p.id}`, icon: '📱', type: 'Пост', title: p.theme || p.postType || 'Пост', content: body, date: '' });
  });

  // Articles
  const articles = tryParse<{ id: string; editedTitle?: string; editedContent?: string; content?: string; createdAt?: string }[]>(
    localStorage.getItem(`articles_${projectId}`)
  );
  (articles ?? []).forEach((a) => {
    const body = a.editedContent ?? a.content ?? '';
    if (body.trim()) files.push({ id: `art_${a.id}`, icon: '📝', type: 'Статья', title: a.editedTitle || 'Статья', content: body, date: a.createdAt ?? '' });
  });

  // Video scripts
  const scripts = tryParse<{ id: string; editedTitle?: string; editedContent?: string; content?: string; createdAt?: string }[]>(
    localStorage.getItem(`video_scripts_${projectId}`)
  );
  (scripts ?? []).forEach((sc) => {
    const body = sc.editedContent ?? sc.content ?? '';
    if (body.trim()) files.push({ id: `vs_${sc.id}`, icon: '🎥', type: 'Сценарий', title: sc.editedTitle || 'Сценарий', content: body, date: sc.createdAt ?? '' });
  });

  // Reels (global)
  const reels = tryParse<{ id: string; editedTitle?: string; hookText?: string; editedContent?: string; content?: string }[]>(
    localStorage.getItem('reels_session')
  );
  (reels ?? []).forEach((r) => {
    const body = r.editedContent ?? r.content ?? '';
    if (body.trim()) files.push({ id: `reel_${r.id}`, icon: '🎬', type: 'Рилс', title: r.editedTitle || r.hookText?.slice(0, 50) || 'Рилс', content: body, date: '' });
  });

  // Chatbot chain — stored as a single object with messages array
  const chain = tryParse<{ messages?: { id: string; index?: number; editedContent?: string; content?: string }[] }>(
    localStorage.getItem(`chatbot_chain_${projectId}`)
  );
  if (chain?.messages?.length) {
    const full = chain.messages
      .map((m) => (m.editedContent ?? m.content ?? '').trim())
      .filter(Boolean)
      .join('\n\n---\n\n');
    if (full) files.push({ id: 'chain_full', icon: '🤖', type: 'Цепочка текстов', title: `Цепочка (${chain.messages.length} сообщ.)`, content: full, date: '' });
  }

  // Products main/mini/free
  const productTypes: ['main' | 'mini' | 'free', string, string][] = [
    ['main', '🚀', 'Основной продукт'],
    ['mini', '⚡', 'Мини-продукт'],
    ['free', '🎁', 'Бесплатный продукт'],
  ];
  for (const [type, icon, label] of productTypes) {
    const items = tryParse<{ id: string; title: string; content: string; date?: string }[]>(
      localStorage.getItem(`products_${type}_${projectId}`)
    );
    (items ?? []).forEach((item) => {
      if (item.content?.trim()) files.push({ id: `prod_${item.id}`, icon, type: label, title: item.title || label, content: item.content, date: item.date ?? '' });
    });
  }

  // Strategy — from per-project audience store
  if (audienceAnswers) {
    const seg = audienceAnswers.chosenSegment || audienceAnswers.segments || '';
    if (seg) {
      const text = Object.entries(audienceAnswers)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}:\n${v}`)
        .join('\n\n');
      files.push({ id: 'strategy_main', icon: '🎯', type: 'Стратегия', title: `Стратегия — ${seg.split('\n')[0]?.slice(0, 50) ?? ''}`, content: text, date: '' });
    }
  }

  return files;
}

const MATERIAL_ICONS: Record<string, string> = {
  positioning: '🧭',
  audience: '🎯',
  utp: '💎',
  social: '📣',
  'product-main': '🚀',
  'product-mini': '⚡',
  'lead-magnet': '🎁',
  content: '📄',
};

const MATERIAL_TYPES: Record<string, string> = {
  positioning: 'Позиционирование',
  audience: 'Целевая аудитория',
  utp: 'УТП',
  social: 'Соцсети',
  'product-main': 'Основной продукт',
  'product-mini': 'Мини-продукт',
  'lead-magnet': 'Лид-магнит',
  content: 'Контент',
};

function download(title: string, content: string) {
  const blob = new Blob([`${title}\n\n${content}`], { type: 'text/plain;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${title.replace(/[^а-яёa-z0-9\s]/gi, '').trim().slice(0, 50) || 'document'}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function FileMaterials() {
  const activeProjectId = useProjectsStore((s) => s.activeProjectId);
  const audienceAnswers = useAudienceStore((s) => s.projects[activeProjectId ?? '']?.answers);
  const projectMaterials = useMaterialsStore((s) => s.projects[activeProjectId ?? ''] ?? []);
  const loadMaterialsFromDb = useMaterialsStore((s) => s.loadFromDb);
  const refreshSummary = useMaterialsStore((s) => s.refreshSummary);

  useEffect(() => {
    if (activeProjectId) void loadMaterialsFromDb(activeProjectId);
  }, [activeProjectId, loadMaterialsFromDb]);

  const files = useMemo(
    () => {
      const materialFiles: FileEntry[] = projectMaterials.map((item) => ({
        id: `mat_${item.id}`,
        materialId: item.id,
        icon: MATERIAL_ICONS[item.kind] ?? '📄',
        type: MATERIAL_TYPES[item.kind] ?? 'Материал',
        title: item.title,
        content: item.content,
        date: new Date(item.updatedAt).toLocaleDateString('ru-RU'),
        summary: item.summary,
        summaryStatus: item.summaryStatus,
        linkedCount: item.linkedMaterialIds?.length ?? 0,
        versionsCount: item.versions?.length ?? 0,
      }));
      const legacyFiles = gatherFiles(activeProjectId, audienceAnswers)
        .filter((file) => !materialFiles.some((item) => item.title === file.title || item.id === file.id));
      return [...materialFiles, ...legacyFiles];
    },
    [activeProjectId, audienceAnswers, projectMaterials],
  );

  return (
    <div className={s.root}>
      <div className={s.header}>
        <h2 className={s.title}>Материалы</h2>
        <p className={s.desc}>
          {files.length > 0
            ? `${files.length} документ${files.length === 1 ? '' : files.length < 5 ? 'а' : 'ов'} — knowledge base проекта`
            : 'Созданные материалы появятся здесь'}
        </p>
      </div>

      {files.length === 0 ? (
        <div className={s.card} style={{ justifyContent: 'center', color: 'var(--text-muted)', fontSize: 14 }}>
          Нет материалов. Создайте первый контент в разделах Упаковка или Контент.
        </div>
      ) : (
        <div className={s.list}>
          {files.map((file) => (
            <div key={file.id} className={s.card}>
              <span className={s.fileIcon}>{file.icon}</span>
              <div className={s.fileInfo}>
                <div className={s.fileName}>{file.title}</div>
                <div className={s.fileMeta}>
                  {file.type}{file.date ? ` · ${file.date}` : ''}
                  {' · '}{file.content.length} симв.
                  {file.summaryStatus ? ` · ${
                    file.summaryStatus === 'fresh' ? 'саммари актуально' :
                    file.summaryStatus === 'updating' ? 'саммари обновляется' :
                    file.summaryStatus === 'pending' ? 'саммари в очереди' :
                    'саммари требует обновления'
                  }` : ''}
                  {file.linkedCount ? ` · связей ${file.linkedCount}` : ''}
                  {file.versionsCount ? ` · версий ${file.versionsCount}` : ''}
                </div>
                <div className={s.preview}>
                  {(file.summary || file.content).replace(/\n+/g, ' ').slice(0, 140)}…
                </div>
              </div>
              {file.materialId && (
                <button
                  className={s.actionBtn}
                  onClick={() => void refreshSummary(activeProjectId, file.materialId!)}
                  disabled={file.summaryStatus === 'updating'}
                >
                  {file.summaryStatus === 'updating' ? 'Обновляю...' : 'Обновить саммари'}
                </button>
              )}
              <button className={s.actionBtn} onClick={() => download(file.title, file.content)}>
                ⬇️ Скачать
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
