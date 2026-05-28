
// ─── Icons ────────────────────────────────────────────────────────────────────

function StarIcon({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2l2.9 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l7.1-1.01L12 2z"
        fill="#D4A847"
        stroke="#D4A847"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
      <path
        d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

import { useProjectsStore } from '../../store/projects.store';

// ─── Steps ────────────────────────────────────────────────────────────────────

const STEPS = [
  { num: 1, label: 'О себе' },
  { num: 2, label: 'Позиционирование' },
  { num: 3, label: 'Целевая аудитория' },
  { num: 4, label: 'Создать УТП' },
  { num: 5, label: 'Основной продукт' },
];

// ─── MainContent ──────────────────────────────────────────────────────────────

function MainContent({ onStartAbout }: { onStartAbout: () => void }) {
  const activeId    = useProjectsStore((s) => s.activeProjectId);
  const projectName = useProjectsStore((s) => s.projects.find((p) => p.id === activeId)?.name ?? 'Мой проект');

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', backgroundColor: '#fff', overflow: 'hidden' }}>

      {/* Top bar */}
      <header style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '20px 32px',
        borderBottom: '1px solid #F0EEE8',
      }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 500, color: '#1a1a1a', lineHeight: 1.2, margin: 0 }}>
            {projectName}
          </h1>
          <p style={{ fontSize: 13, color: '#888', marginTop: 4, margin: '4px 0 0' }}>
            Создан сегодня · 0% выполнено
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 16px',
            borderRadius: 8,
            border: '1px solid #D3D1C7',
            backgroundColor: '#fff',
            color: '#1a1a1a',
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
          }}>
            <SettingsIcon />
            Настройки
          </button>
        </div>
      </header>

      {/* Center content */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 32px 48px',
      }}>

        {/* Star icon */}
        <div style={{
          width: 72,
          height: 72,
          borderRadius: 16,
          backgroundColor: '#F5F4F0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 24,
        }}>
          <StarIcon size={32} />
        </div>

        {/* Heading */}
        <h2 style={{
          fontSize: 22,
          fontWeight: 500,
          color: '#1a1a1a',
          textAlign: 'center',
          margin: '0 0 12px',
          lineHeight: 1.3,
        }}>
          Добро пожаловать в LumaIQ
        </h2>

        {/* Subtitle */}
        <p style={{
          fontSize: 15,
          color: '#666',
          textAlign: 'center',
          maxWidth: 420,
          lineHeight: 1.6,
          margin: '0 0 40px',
        }}>
          Начните с раздела «О себе»: добавьте базовую информацию об эксперте,
          чтобы LumaIQ дальше точнее собрал стратегию, продукты и контент.
        </p>

        {/* Steps */}
        <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 40 }}>
          {STEPS.map((step, idx) => (
            <div key={step.num} style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 88 }}>
                <div style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  backgroundColor: '#D4A847',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 500,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 8,
                  flexShrink: 0,
                }}>
                  {step.num}
                </div>
                <span style={{
                  fontSize: 13,
                  color: '#1a1a1a',
                  textAlign: 'center',
                  lineHeight: 1.3,
                  padding: '0 4px',
                }}>
                  {step.label}
                </span>
              </div>

              {idx < STEPS.length - 1 && (
                <div style={{
                  width: 32,
                  height: 1,
                  backgroundColor: '#E5E3DC',
                  marginBottom: 20,
                  flexShrink: 0,
                }} />
              )}
            </div>
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <button
            onClick={onStartAbout}
            style={{
              padding: '12px 24px',
              borderRadius: 8,
              border: 'none',
              backgroundColor: '#D4A847',
              color: '#fff',
              fontSize: 15,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Начать с раздела «О себе» →
          </button>
          <button style={{
            background: 'none',
            border: 'none',
            color: '#888',
            fontSize: 14,
            cursor: 'pointer',
            textDecoration: 'underline',
            textUnderlineOffset: 3,
            padding: 0,
          }}>
            Посмотреть пример
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── DashboardEmpty ───────────────────────────────────────────────────────────

interface DashboardEmptyProps {
  onStartUnpacking?: () => void;
}

export default function DashboardEmpty({ onStartUnpacking }: DashboardEmptyProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, height: '100%', overflow: 'hidden' }}>
      <MainContent onStartAbout={() => onStartUnpacking?.()} />
    </div>
  );
}
