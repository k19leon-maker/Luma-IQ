import { useState, useEffect } from 'react';
import { useContentPlanStore, ContentType } from '../../store/contentPlan.store';
import s from './AddToPlanModal.module.css';

const TYPE_LABELS: Record<ContentType, string> = {
  post:         'Пост',
  reel:         'Рилс',
  article:      'Статья',
  video_script: 'Видео-сценарий',
  chatbot:      'Цепочка бота',
  custom:       'Другое',
};

const DAY_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

const MONTH_RU = [
  'января','февраля','марта','апреля','мая','июня',
  'июля','августа','сентября','октября','ноября','декабря',
];

function toISO(d: Date) {
  return d.toISOString().slice(0, 10);
}

function formatDayBtn(iso: string): { day: string; num: number } {
  const d = new Date(iso);
  return { day: DAY_SHORT[d.getDay()], num: d.getDate() };
}

function formatDateLabel(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTH_RU[d.getMonth()]} ${d.getFullYear()}`;
}

function getWeekDays(): string[] {
  const today = new Date();
  const day = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1));
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return toISO(d);
  });
}

function todayISO() {
  return toISO(new Date());
}

export default function AddToPlanModal() {
  const { modalOpen, pendingItem, addItemApi, closeAddModal } = useContentPlanStore();

  const [selectedDate, setSelectedDate] = useState(todayISO);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [platform, setPlatform] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (modalOpen && pendingItem) {
      setSelectedDate(todayISO());
      setShowDatePicker(false);
      setPlatform(pendingItem.platform ?? '');
      setSaving(false);
      setError('');
    }
  }, [modalOpen, pendingItem]);

  if (!modalOpen || !pendingItem) return null;

  const weekDays = getWeekDays();
  const hasPlatform = !!pendingItem.platform;
  const preview = pendingItem.preview
    ?? pendingItem.content?.split('\n').filter(Boolean).slice(0, 2).join('\n')
    ?? '';

  async function handleAdd() {
    if (!pendingItem) return;
    setSaving(true);
    setError('');
    try {
      const result = await addItemApi({
        id:        crypto.randomUUID(),
        date:      selectedDate,
        type:      pendingItem.type,
        title:     pendingItem.title,
        content:   pendingItem.content,
        platform:  (hasPlatform ? pendingItem.platform : platform) || undefined,
        status:    'draft',
        projectId: pendingItem.projectId,
        sourceId:  pendingItem.sourceId,
      });
      pendingItem.onAdded?.(result);
      closeAddModal();
    } catch {
      setError('Не удалось сохранить материал. Проверьте соединение и повторите.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={s.overlay} onClick={() => { if (!saving) closeAddModal(); }}>
      <div className={s.modal} onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className={s.header}>
          <span className={s.headerTitle}>Добавить в контент-план</span>
          <button className={s.closeBtn} onClick={closeAddModal} disabled={saving}>✕</button>
        </div>

        <div className={s.body}>
          {/* Type badge + title */}
          <div className={s.typeBadge}>{TYPE_LABELS[pendingItem.type]}</div>
          <div className={s.previewTitle}>{pendingItem.title}</div>
          {preview && <div className={s.previewText}>{preview}</div>}

          {/* Date selection */}
          <div className={s.sectionLabel}>Дата публикации</div>
          <div className={s.weekDays}>
            {weekDays.map((iso) => {
              const { day, num } = formatDayBtn(iso);
              const isSelected = iso === selectedDate;
              const isTodayDay = iso === todayISO();
              return (
                <button
                  key={iso}
                  className={`${s.dayBtn} ${isSelected ? s.dayBtnActive : ''} ${isTodayDay && !isSelected ? s.dayBtnToday : ''}`}
                  onClick={() => { setSelectedDate(iso); setShowDatePicker(false); }}
                >
                  <span className={s.dayBtnName}>{day}</span>
                  <span className={s.dayBtnNum}>{num}</span>
                </button>
              );
            })}
          </div>

          {!showDatePicker && (
            <button className={s.otherDateBtn} onClick={() => setShowDatePicker(true)}>
              Выбрать другую дату
            </button>
          )}
          {showDatePicker && (
            <input
              className={s.input}
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          )}

          {/* Selected date label */}
          <div className={s.selectedDateLabel}>
            Выбрано: {formatDateLabel(selectedDate)}
          </div>

          {/* Platform — only if not preset */}
          {!hasPlatform && (
            <>
              <div className={s.sectionLabel}>Площадка</div>
              <div className={s.platformBtns}>
                {['Telegram', 'Instagram', 'YouTube', 'ВКонтакте'].map((p) => (
                  <button
                    key={p}
                    className={`${s.platformBtn} ${platform === p ? s.platformBtnActive : ''}`}
                    onClick={() => setPlatform(p)}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <input
                className={s.input}
                value={platform}
                onChange={(e) => setPlatform(e.target.value)}
                placeholder="Или введите вручную..."
                style={{ marginTop: 8 }}
              />
            </>
          )}
        </div>

        {error && <div className={s.error} role="alert">{error}</div>}

        <div className={s.footer}>
          <button className={s.cancelBtn} onClick={closeAddModal} disabled={saving}>Отмена</button>
          <button className={s.addBtn} onClick={() => void handleAdd()} disabled={saving}>
            {saving ? 'Сохраняю…' : 'Добавить в план'}
          </button>
        </div>
      </div>
    </div>
  );
}
