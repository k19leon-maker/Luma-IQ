import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { contentApi, ContentItem } from '../../api/content.api';
import { ApiProduct, productsApi } from '../../api/products.api';
import { filesApi, ProjectFile } from '../../api/ai';
import { useProjectsStore } from '../../store/projects.store';
import { useAudienceStore } from '../../store/audience.store';
import { useMaterialsStore, type ProjectMaterial } from '../../store/materials.store';
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

const MATERIAL_ICONS: Record<string, string> = {
  'expert-profile': '👤',
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
  'expert-profile': 'О себе',
  positioning: 'Позиционирование',
  audience: 'Целевая аудитория',
  utp: 'УТП',
  social: 'Соцсети',
  'product-main': 'Основной продукт',
  'product-mini': 'Мини-продукт',
  'lead-magnet': 'Лид-магнит',
  content: 'Контент',
};

const EMPTY_PROJECT_MATERIALS: ProjectMaterial[] = [];

const CONTENT_LABELS: Record<string, { icon: string; type: string }> = {
  POST: { icon: '📱', type: 'Пост' },
  REEL: { icon: '🎬', type: 'Рилс' },
  ARTICLE: { icon: '📝', type: 'Статья' },
  VIDEO_SCRIPT: { icon: '🎥', type: 'Сценарий' },
  CHATBOT_CHAIN: { icon: '🤖', type: 'Цепочка текстов' },
  THREADS: { icon: '🧵', type: 'Threads ИИ' },
  OTHER: { icon: '📄', type: 'Материал' },
};

const PRODUCT_LABELS: Record<string, { icon: string; type: string }> = {
  MAIN: { icon: '🚀', type: 'Основной продукт' },
  MINI: { icon: '⚡', type: 'Мини-продукт' },
  FREE: { icon: '🎁', type: 'Бесплатный продукт' },
};

function fileFromContent(item: ContentItem): FileEntry | null {
  if (item.metadata?.kind === 'ai_dialog') return null;
  const label = CONTENT_LABELS[item.type] ?? CONTENT_LABELS.OTHER;
  if (!item.content.trim()) return null;
  return {
    id: `content_${item.id}`,
    icon: label.icon,
    type: label.type,
    title: item.title || label.type,
    content: item.content,
    date: new Date(item.updatedAt).toLocaleDateString('ru-RU'),
  };
}

function fileFromProduct(item: ApiProduct): FileEntry | null {
  const content = item.shortDescription ?? item.offer ?? item.transformation ?? '';
  if (!content.trim()) return null;
  const label = PRODUCT_LABELS[item.type] ?? PRODUCT_LABELS.MAIN;
  return {
    id: `product_${item.id}`,
    icon: label.icon,
    type: label.type,
    title: item.title || label.type,
    content,
    date: new Date(item.updatedAt).toLocaleDateString('ru-RU'),
  };
}

function fileFromProjectFile(item: ProjectFile): FileEntry | null {
  const content = item.textContent || item.summary || '';
  if (!content.trim()) return null;
  return {
    id: `upload_${item.id}`,
    materialId: item.id,
    icon: '📎',
    type: item.extension?.replace('.', '').toUpperCase() || 'Файл',
    title: item.originalName,
    content,
    summary: item.summary ?? undefined,
    summaryStatus: item.status === 'ready' ? 'fresh' : item.status,
    date: new Date(item.updatedAt).toLocaleDateString('ru-RU'),
  };
}

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
  const projectMaterials = useMaterialsStore((s) => activeProjectId ? (s.projects[activeProjectId] ?? EMPTY_PROJECT_MATERIALS) : EMPTY_PROJECT_MATERIALS);
  const loadMaterialsFromDb = useMaterialsStore((s) => s.loadFromDb);
  const refreshSummary = useMaterialsStore((s) => s.refreshSummary);
  const [generatedFiles, setGeneratedFiles] = useState<FileEntry[]>([]);
  const [uploadedFiles, setUploadedFiles] = useState<ProjectFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (activeProjectId) void loadMaterialsFromDb(activeProjectId);
  }, [activeProjectId, loadMaterialsFromDb]);

  useEffect(() => {
    if (!activeProjectId) {
      setGeneratedFiles([]);
      return;
    }

    let cancelled = false;
    Promise.all([
      contentApi.list(activeProjectId),
      productsApi.list(activeProjectId),
      filesApi.list(activeProjectId),
    ]).then(([contentItems, productItems, projectFiles]) => {
      if (cancelled) return;
      const contentFiles = contentItems.map(fileFromContent).filter((item): item is FileEntry => Boolean(item));
      const productFiles = productItems.map(fileFromProduct).filter((item): item is FileEntry => Boolean(item));
      setGeneratedFiles([...contentFiles, ...productFiles]);
      setUploadedFiles(projectFiles);
    }).catch(() => {
      if (!cancelled) {
        setGeneratedFiles([]);
        setUploadedFiles([]);
      }
    });

    return () => { cancelled = true; };
  }, [activeProjectId]);

  async function handleUpload(files: FileList | null) {
    if (!activeProjectId || !files?.length) return;
    setUploading(true);
    try {
      const saved: ProjectFile[] = [];
      for (const file of Array.from(files)) {
        saved.push(await filesApi.upload(activeProjectId, file));
      }
      setUploadedFiles((current) => [...saved, ...current]);
      toast.success(saved.length === 1 ? 'Файл добавлен в материалы проекта' : `Файлы добавлены: ${saved.length}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось загрузить файл');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function removeUploadedFile(fileId: string) {
    try {
      await filesApi.remove(fileId);
      setUploadedFiles((current) => current.filter((file) => file.id !== fileId));
      toast.success('Файл удален');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось удалить файл');
    }
  }

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
      const strategyFiles: FileEntry[] = [];
      if (audienceAnswers) {
        const seg = audienceAnswers.chosenSegment || audienceAnswers.segments || '';
        if (seg) {
          const text = Object.entries(audienceAnswers)
            .filter(([, v]) => v)
            .map(([k, v]) => `${k}:\n${v}`)
            .join('\n\n');
          strategyFiles.push({ id: 'strategy_main', icon: '🎯', type: 'Стратегия', title: `Стратегия — ${seg.split('\n')[0]?.slice(0, 50) ?? ''}`, content: text, date: '' });
        }
      }
      const uploadFiles = uploadedFiles.map(fileFromProjectFile).filter((item): item is FileEntry => Boolean(item));
      const extraFiles = [...uploadFiles, ...generatedFiles, ...strategyFiles]
        .filter((file) => !materialFiles.some((item) => item.title === file.title || item.id === file.id));
      return [...materialFiles, ...extraFiles];
    },
    [audienceAnswers, generatedFiles, projectMaterials, uploadedFiles],
  );

  return (
    <div className={s.root}>
      <div className={s.header}>
        <div>
          <h2 className={s.title}>Материалы</h2>
          <p className={s.desc}>
            {files.length > 0
              ? `${files.length} документ${files.length === 1 ? '' : files.length < 5 ? 'а' : 'ов'} — knowledge base проекта`
              : 'Созданные материалы появятся здесь'}
          </p>
        </div>
        <button className={s.uploadBtn} onClick={() => fileInputRef.current?.click()} disabled={!activeProjectId || uploading}>
          {uploading ? 'Загружаю...' : '+ Загрузить файл'}
        </button>
        <input
          ref={fileInputRef}
          className={s.hiddenInput}
          type="file"
          multiple
          accept=".txt,.md,.csv,.doc,.docx,.pdf,.xls,.xlsx"
          onChange={(event) => void handleUpload(event.target.files)}
        />
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
                file.id.startsWith('upload_') ? (
                  <button
                    className={`${s.actionBtn} ${s.dangerBtn}`}
                    onClick={() => void removeUploadedFile(file.materialId!)}
                  >
                    Удалить
                  </button>
                ) : (
                  <button
                    className={s.actionBtn}
                    onClick={() => void refreshSummary(activeProjectId, file.materialId!)}
                    disabled={file.summaryStatus === 'updating'}
                  >
                    {file.summaryStatus === 'updating' ? 'Обновляю...' : 'Обновить саммари'}
                  </button>
                )
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
