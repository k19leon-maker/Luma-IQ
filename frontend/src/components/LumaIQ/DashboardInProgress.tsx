import { useNavigate } from 'react-router-dom';
import { useProjectsStore } from '../../store/projects.store';
import { useAudienceStore } from '../../store/audience.store';
import { useTasksStore } from '../../store/tasks.store';
import { useContentPlanStore, ContentType } from '../../store/contentPlan.store';
import { ApiProduct } from '../../api/products.api';
import type { SectionFlags, NextStep } from '../../pages/Dashboard/Dashboard';

// ─── Icons ────────────────────────────────────────────────────────────────────

function StarIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l7.1-1.01L12 2z"
        fill="#D4A847" stroke="#D4A847" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}



function ExportIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlusCircleIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="10" stroke="#C8C5BC" strokeWidth="1.5" />
      <path d="M12 8v8M8 12h8" stroke="#C8C5BC" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────


function formatUpdated(dateStr: string): string {
  const d = new Date(dateStr);
  const diffMin = (Date.now() - d.getTime()) / 60000;
  if (diffMin < 60)      return 'только что';
  if (diffMin < 1440)    return 'сегодня';
  if (diffMin < 2880)    return 'вчера';
  const MM = ['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];
  return `${d.getDate()} ${MM[d.getMonth()]}`;
}

function formatDate(dateStr: string): { day: string; month: string } {
  const [, mm, dd] = dateStr.split('-');
  const MM = ['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];
  return { day: String(parseInt(dd ?? '1', 10)), month: MM[parseInt(mm ?? '1', 10) - 1] ?? '' };
}

const TYPE_BADGE: Record<ContentType | string, { bg: string; color: string; label: string }> = {
  post:         { bg: '#E6F1FB', color: '#185FA5', label: 'Пост'    },
  reel:         { bg: '#FBEAF0', color: '#D4537E', label: 'Рилс'    },
  article:      { bg: '#EAF3DE', color: '#3B6D11', label: 'Статья'  },
  video_script: { bg: '#F3EAFB', color: '#6D11A8', label: 'Видео'   },
  chatbot:      { bg: '#FBF3EA', color: '#A85211', label: 'Чат-бот' },
  custom:       { bg: '#F0F0F0', color: '#666',    label: 'Другое'  },
};


// ─── Metric card ──────────────────────────────────────────────────────────────

function MetricCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div style={{ flex: 1, borderRadius: 10, padding: '16px 20px', backgroundColor: '#F5F4F0' }}>
      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase', color: '#999', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: '#1a1a1a', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>{sub}</div>
    </div>
  );
}

// ─── Product card ─────────────────────────────────────────────────────────────

const PRODUCT_META = {
  MAIN: { label: 'Основной продукт', route: '/products/main' },
  MINI: { label: 'Мини-продукт',     route: '/products/mini' },
  FREE: { label: 'Лид-магнит',       route: '/products/lead-magnet'  },
} as const;

function ProductCard({ product, type, onNavigate }: {
  product?: ApiProduct;
  type: 'MAIN' | 'MINI' | 'FREE';
  onNavigate: (route: string) => void;
}) {
  const meta = PRODUCT_META[type];

  if (product) {
    return (
      <div style={{ borderRadius: 10, padding: '16px', display: 'flex', flexDirection: 'column', gap: 8, backgroundColor: '#F5F4F0' }}>
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#999' }}>{meta.label}</div>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1a1a1a', lineHeight: 1.3 }}>{product.title || '—'}</div>
        <div style={{ fontSize: 12, color: '#888', flex: 1 }}>{product.shortDescription ?? product.format ?? ''}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#1a1a1a' }}>{product.priceText ?? ''}</span>
          <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, backgroundColor: '#dcfce7', color: '#166534' }}>Готово</span>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => onNavigate(meta.route)}
      style={{ borderRadius: 10, padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, border: '1.5px dashed #D3D1C7', backgroundColor: 'transparent', cursor: 'pointer', minHeight: 130 }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#D4A847'; (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(212,168,71,0.04)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#D3D1C7'; (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent'; }}
    >
      <PlusCircleIcon />
      <span style={{ fontSize: 13, color: '#999' }}>{meta.label}</span>
    </button>
  );
}

// ─── Main content ─────────────────────────────────────────────────────────────

function MainContent({
  products, flags, completedCount, completionPct, nextStep, onContinue,
}: {
  products: ApiProduct[];
  flags: SectionFlags;
  completedCount: number;
  completionPct: number;
  nextStep: NextStep;
  onContinue: () => void;
}) {
  const navigate    = useNavigate();
  const activeId    = useProjectsStore((s) => s.activeProjectId);
  const currentProj = useProjectsStore((s) => s.currentProject);
  const projects    = useProjectsStore((s) => s.projects);
  const projectName = currentProj?.name ?? projects.find((p) => p.id === activeId)?.name ?? 'Мой проект';
  const updatedAt   = currentProj?.updatedAt ? formatUpdated(currentProj.updatedAt) : 'сегодня';

  const audienceData  = useAudienceStore((s) => s.get(activeId));
  const segment       = audienceData.answers.chosenSegment    ?? '';
  const subsegment    = audienceData.answers.chosenSubsegment ?? '';
  const hasAudienceData = !!(segment || subsegment);

  const allItems    = useContentPlanStore((s) => s.items);
  const contentRows = allItems.filter((i) => !i.projectId || i.projectId === activeId).slice(0, 5);
  const contentCount = allItems.filter((i) => !i.projectId || i.projectId === activeId).length;

  const tasks       = useTasksStore((s) => s.tasks);
  const activeCount = tasks.filter((t) => t.column !== 'done').length;

  const productMain = products.find((p) => p.type === 'MAIN');
  const productMini = products.find((p) => p.type === 'MINI');
  const productFree = products.find((p) => p.type === 'FREE');
  const productsCount = [productMain, productMini, productFree].filter(Boolean).length;

  const strategyDone = [flags.unpacking, flags.audience, flags.utp, flags.social].filter(Boolean).length;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#fff', overflowY: 'auto' }}>

      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 32px', borderBottom: '1px solid #F0EEE8', flexShrink: 0 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 500, color: '#1a1a1a', margin: 0, lineHeight: 1.2 }}>{projectName}</h1>
          <p style={{ fontSize: 13, color: '#888', margin: '4px 0 0' }}>Обновлено {updatedAt} · {completionPct}% выполнено</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: '1px solid #D3D1C7', backgroundColor: '#fff', color: '#1a1a1a', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            <ExportIcon /> Экспорт
          </button>
          <button onClick={onContinue} style={{ padding: '8px 18px', borderRadius: 8, border: 'none', backgroundColor: '#1a1a1a', color: '#fff', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            Продолжить →
          </button>
        </div>
      </header>

      <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 28 }}>

        {/* Metrics */}
        <div style={{ display: 'flex', gap: 14 }}>
          <MetricCard label="Стратегия" value={`${completedCount}/7`}          sub="разделов"      />
          <MetricCard label="Продуктов" value={`${productsCount}/3`}            sub="настроено"     />
          <MetricCard label="Контент"   value={String(contentCount || 0)}       sub="постов готово" />
          <MetricCard label="Задач"     value={String(activeCount)}             sub="активных"      />
        </div>

        {/* AI banner */}
        <div style={{ borderRadius: 12, backgroundColor: '#1a1a1a', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: 'rgba(212,168,71,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <StarIcon size={18} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13.5, fontWeight: 600, color: '#fff', margin: 0, lineHeight: 1.4 }}>
              AI рекомендует: заполнить {nextStep.label}
            </p>
            <p style={{ fontSize: 12, color: '#888', margin: '3px 0 0', lineHeight: 1.4 }}>{nextStep.hint}</p>
          </div>
          <button
            onClick={() => navigate(nextStep.route)}
            style={{ flexShrink: 0, padding: '8px 16px', borderRadius: 8, border: 'none', backgroundColor: '#D4A847', color: '#1a1a1a', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            {nextStep.btnText}
          </button>
        </div>

        {/* Packaging block */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1a1a1a', margin: 0 }}>Упаковка</h2>
            <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, border: '1px solid #D4A847', color: '#D4A847' }}>В процессе</span>
            <button onClick={() => navigate('/strategy/unpacking')} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#D4A847', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
              Открыть стратегию →
            </button>
          </div>

          <div style={{ borderRadius: 10, padding: '20px', display: 'flex', gap: 20, backgroundColor: '#F5F4F0' }}>
            {/* Left */}
            <div style={{ flex: 3, minWidth: 0 }}>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#999', marginBottom: 4 }}>
                Сегмент · Подсегмент
              </div>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: '#1a1a1a', margin: '0 0 6px', lineHeight: 1.3 }}>
                {hasAudienceData
                  ? `${segment}${subsegment ? ' · ' + subsegment : ''}`
                  : 'Не определено — заполните раздел ЦА'}
              </h3>
              <p style={{ fontSize: 13, color: '#888', margin: '0 0 14px', lineHeight: 1.6 }}>
                {hasAudienceData
                  ? (audienceData.answers.wants ?? 'Данные загружены')
                  : 'После анализа целевой аудитории здесь появится описание вашего идеального клиента'}
              </p>

              {/* Tags */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
                {['Психолог', 'Онлайн', 'Личная практика'].map((tag) => (
                  <span key={tag} style={{ padding: '4px 12px', borderRadius: 20, fontSize: 11.5, fontWeight: 500, backgroundColor: '#fff', color: '#888', border: '1px solid #E5E3DC' }}>
                    {tag}
                  </span>
                ))}
              </div>

              {/* Progress bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: '#E5E3DC', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 3, backgroundColor: '#D4A847', width: `${Math.round(strategyDone / 4 * 100)}%`, transition: 'width 0.4s ease' }} />
                </div>
                <span style={{ fontSize: 11, color: '#999', flexShrink: 0 }}>{strategyDone} из 4</span>
              </div>
            </div>

            {/* Divider */}
            <div style={{ width: 1, backgroundColor: '#E5E3DC', flexShrink: 0 }} />

            {/* Right */}
            <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#999', marginBottom: 3 }}>УТП</div>
                {flags.utp
                  ? <div style={{ fontSize: 13, color: '#1a1a1a' }}>Заполнено ✓</div>
                  : <div style={{ fontSize: 13, color: '#bbb', fontStyle: 'italic' }}>Не заполнено</div>
                }
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#999', marginBottom: 3 }}>Тональность</div>
                <div style={{ fontSize: 13, color: '#555' }}>Тёплая, экспертная</div>
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#999', marginBottom: 3 }}>Каналы</div>
                <div style={{ fontSize: 13, color: '#555' }}>Instagram, Telegram</div>
              </div>
            </div>
          </div>
        </div>

        {/* Products block */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1a1a1a', margin: 0 }}>Продукты</h2>
            <span style={{ fontSize: 13, color: '#999' }}>{productsCount} из 3</span>
            <button onClick={() => navigate('/products/main')} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#D4A847', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
              Настроить →
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 14 }}>
            <ProductCard product={productMain} type="MAIN" onNavigate={(r) => navigate(r)} />
            <ProductCard product={productMini} type="MINI" onNavigate={(r) => navigate(r)} />
            <ProductCard product={productFree} type="FREE" onNavigate={(r) => navigate(r)} />
          </div>
        </div>

        {/* Content plan block */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1a1a1a', margin: 0 }}>Контент-план</h2>
            {contentCount > 0 && (
              <span style={{ fontSize: 13, fontWeight: 600, color: '#D4A847' }}>{contentCount} постов</span>
            )}
            <button onClick={() => navigate('/content-plan')} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#D4A847', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
              Весь план →
            </button>
          </div>

          {contentRows.length > 0 ? (
            <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid #F0EEE8' }}>
              {contentRows.map((row, idx) => {
                const { day, month } = formatDate(row.date);
                const badge = TYPE_BADGE[row.type] ?? TYPE_BADGE.custom;
                return (
                  <div key={row.id} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 20px', backgroundColor: '#fff', borderBottom: idx < contentRows.length - 1 ? '1px solid #F0EEE8' : 'none' }}>
                    <div style={{ width: 32, textAlign: 'center', flexShrink: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: '#1a1a1a', lineHeight: 1 }}>{day}</div>
                      <div style={{ fontSize: 10, color: '#999', textTransform: 'uppercase', marginTop: 2 }}>{month}</div>
                    </div>
                    <div style={{ flex: 1, fontSize: 13.5, color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.title}</div>
                    <div style={{ fontSize: 12, color: '#bbb', flexShrink: 0, width: 80, textAlign: 'right' }}>{row.platform ?? ''}</div>
                    <span style={{ flexShrink: 0, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, backgroundColor: badge.bg, color: badge.color }}>{badge.label}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ borderRadius: 10, border: '1.5px dashed #E5E3DC', padding: '28px', textAlign: 'center', color: '#bbb', fontSize: 13 }}>
              Нет записей в контент-плане — добавьте контент в разделах Посты, Рилсы или Статьи
            </div>
          )}
        </div>

        <div style={{ height: 8 }} />
      </div>
    </div>
  );
}

// ─── DashboardInProgress ─────────────────────────────────────────────────────

interface DashboardInProgressProps {
  products:       ApiProduct[];
  flags:          SectionFlags;
  completedCount: number;
  completionPct:  number;
  nextStep:       NextStep;
  onContinue?:    () => void;
}

export default function DashboardInProgress({
  products, flags, completedCount, completionPct, nextStep, onContinue,
}: DashboardInProgressProps) {
  const navigate = useNavigate();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, height: '100%', overflow: 'hidden' }}>
      <MainContent
        products={products}
        flags={flags}
        completedCount={completedCount}
        completionPct={completionPct}
        nextStep={nextStep}
        onContinue={() => { onContinue?.(); navigate(nextStep.route); }}
      />
    </div>
  );
}
