import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { historyApi, HistoryItem } from '../../api/history.api';
import { useProjectsStore } from '../../store/projects.store';
import { exportToDocx } from '../../utils/exportDocx';
import FormattedText from '../../components/FormattedText/FormattedText';
import s from './History.module.css';

const TYPE_LABELS: Record<string, string> = {
  POST:          'Пост',
  REEL:          'Рилс',
  ARTICLE:       'Статья',
  VIDEO_SCRIPT:  'Видео',
  CHATBOT_CHAIN: 'Цепочка',
  THREADS:       'Threads ИИ',
  OTHER:         'Другое',
};

const TYPE_FILTERS = [
  { key: '',              label: 'Все' },
  { key: 'POST',          label: 'Посты' },
  { key: 'REEL',          label: 'Рилсы' },
  { key: 'ARTICLE',       label: 'Статьи' },
  { key: 'VIDEO_SCRIPT',  label: 'Видео' },
  { key: 'CHATBOT_CHAIN', label: 'Цепочки' },
  { key: 'THREADS',       label: 'Threads' },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

export default function History() {
  const navigate = useNavigate();
  const { projects } = useProjectsStore();

  const [items, setItems]         = useState<HistoryItem[]>([]);
  const [loading, setLoading]     = useState(true);
  const [typeFilter, setTypeFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [selected, setSelected]   = useState<HistoryItem | null>(null);
  const [copied, setCopied]       = useState(false);

  useEffect(() => {
    setLoading(true);
    historyApi.list(200).then(setItems).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const filtered = items.filter((it) => {
    if (typeFilter    && it.type      !== typeFilter)    return false;
    if (projectFilter && it.projectId !== projectFilter) return false;
    return true;
  });

  function handleCopy(text: string) {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleDownload(item: HistoryItem) {
    const title    = item.title || TYPE_LABELS[item.type] || 'Материал';
    const filename = title.slice(0, 50).replace(/[^\wа-яёa-z\s]/gi, '').trim() || 'history';
    void exportToDocx(title, item.content, filename);
  }

  return (
    <div className={s.root}>
      <div className={s.header}>
        <h2 className={s.title}>История</h2>
      </div>

      <div className={s.filters}>
        <div className={s.chips}>
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.key}
              className={`${s.chip} ${typeFilter === f.key ? s.chipActive : ''}`}
              onClick={() => setTypeFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <select
          className={s.projectSelect}
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
        >
          <option value="">Все проекты</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className={s.empty}><div className={s.emptyIcon}>⏳</div><p className={s.emptyText}>Загрузка...</p></div>
      ) : filtered.length === 0 ? (
        <div className={s.empty}>
          <div className={s.emptyIcon}>📭</div>
          <p className={s.emptyText}>История пуста</p>
          <p className={s.emptyHint}>Создайте первый контент в разделе Посты или Рилсы</p>
          <button className={s.emptyBtn} onClick={() => navigate('/posts')}>
            Перейти к созданию →
          </button>
        </div>
      ) : (
        <div className={s.list}>
          {filtered.map((item) => (
            <div key={item.id} className={s.card}>
              <div className={s.cardTop}>
                <div className={s.cardMeta}>
                  <span className={s.typeBadge}>{TYPE_LABELS[item.type] ?? item.type}</span>
                  {item.provider && <span className={s.platformBadge}>{item.provider}</span>}
                </div>
                <span className={s.cardDate}>{formatDate(item.createdAt)}</span>
              </div>
              {item.title && <div className={s.cardTitle}>{item.title}</div>}
              <div className={s.cardPreview}>{item.content.slice(0, 180)}</div>
              <div className={s.cardFooter}>
                <span className={s.cardProject}>Проект: {item.projectName}</span>
                <div className={s.cardActions}>
                  <button className={s.cardBtn} onClick={() => setSelected(item)}>👁 Открыть</button>
                  <button className={s.cardBtn} onClick={() => handleCopy(item.content)}>📋 Копировать</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {selected && (
        <div className={s.overlay} onClick={() => setSelected(null)}>
          <div className={s.panel} onClick={(e) => e.stopPropagation()}>
            <div className={s.panelHeader}>
              <div>
                <span className={s.typeBadge}>{TYPE_LABELS[selected.type] ?? selected.type}</span>
                {selected.title && <div className={s.panelTitle}>{selected.title}</div>}
              </div>
              <button className={s.closeBtn} onClick={() => setSelected(null)}>✕</button>
            </div>
            <div className={s.panelContent}>
              <FormattedText>{selected.content}</FormattedText>
            </div>
            <div className={s.panelActions}>
              <button className={s.panelBtn} onClick={() => handleCopy(selected.content)}>
                {copied ? '✓ Скопировано' : '📋 Копировать'}
              </button>
              <button className={s.panelBtn} onClick={() => handleDownload(selected)}>
                ⬇️ Скачать .docx
              </button>
              <button className={`${s.panelBtn} ${s.panelBtnClose}`} onClick={() => setSelected(null)}>
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
