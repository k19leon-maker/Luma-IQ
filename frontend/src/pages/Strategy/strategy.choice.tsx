import { useState } from 'react';
import type { AudienceAnswers } from '../../store/audience.store';

interface PositioningLike {
  audience?: string;
  problem?: string;
  result?: string;
}

export function ChoiceCard({
  title,
  options,
  onConfirm,
}: {
  title: string;
  options: string[];
  onConfirm: (value: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div style={{ background: '#fff', border: '1px solid #E5E3DC', borderRadius: 12, padding: 20, marginBottom: 16 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: '#D4A847', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 14 }}>
        👆 {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {options.map((opt, i) => (
          <button
            key={i}
            onClick={() => setSelected(opt)}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px',
              borderRadius: 8, border: selected === opt ? '1.5px solid #D4A847' : '1px solid #E5E3DC',
              background: selected === opt ? '#FFF8E8' : '#F5F4F0', cursor: 'pointer', textAlign: 'left',
            }}
          >
            <span style={{ color: selected === opt ? '#D4A847' : '#aaa', fontSize: 14, marginTop: 1, flexShrink: 0 }}>
              {selected === opt ? '●' : '○'}
            </span>
            <span style={{ fontSize: 13, color: '#1a1a1a', lineHeight: 1.5 }}>{opt}</span>
          </button>
        ))}
      </div>
      <button
        onClick={() => { if (selected) onConfirm(selected); }}
        disabled={!selected}
        style={{
          padding: '9px 20px', borderRadius: 8, border: 'none',
          background: selected ? '#D4A847' : '#F0EEE8', color: selected ? '#fff' : '#bbb',
          fontSize: 13, fontWeight: 500, cursor: selected ? 'pointer' : 'not-allowed',
        }}
      >
        ✅ Подтвердить выбор
      </button>
    </div>
  );
}

function stripMd(s: string): string {
  return s.replace(/\*+/g, '').replace(/__/g, '').trim();
}

function cleanChoiceLine(line: string): string {
  return stripMd(line)
    .replace(/^[\s#.)🥇🥈🥉—\-–:«»]+/, '')
    .replace(/^(?:топ\s*)?(?:сегмент|подсегмент|запрос|вариант)\s*\d*\s*[—\-–:.)]*/i, '')
    .replace(/^[«"“”]+|[»"“”]+$/g, '')
    .trim();
}

export function parseRequestChoiceOptions(text: string): string[] {
  const matches: string[] = [];
  const push = (value: string | undefined) => {
    const cleaned = cleanChoiceLine(value ?? '').split(/\s+—\s+почему/i)[0].trim();
    if (cleaned.length >= 8 && cleaned.length <= 180 && !/^(почему|логика|вывод|итого)/i.test(cleaned)) {
      matches.push(cleaned);
    }
  };

  for (const m of text.matchAll(/(?:^|\n)\s*[🥇🥈🥉]\s*(?:\*{0,2}(?:запрос\s*\d*)\*{0,2}\s*[—\-–:])?\s*([^\n]+)/gim)) {
    push(m[1]);
  }

  if (matches.length < 2) {
    for (const m of text.matchAll(/(?:^|\n)\s*(?:\d+[.)]|[-•])\s*(?:\*{0,2}(?:запрос\s*\d*)\*{0,2}\s*[—\-–:])?\s*([^\n]+)/gim)) {
      push(m[1]);
    }
  }

  if (matches.length < 2) {
    for (const m of text.matchAll(/(?:^|\n)\s*\*{0,2}запрос\s*\d+\*{0,2}\s*[—\-–:]\s*([^\n]+)/gim)) {
      push(m[1]);
    }
  }

  return Array.from(new Set(matches)).slice(0, 3);
}

function parseChoiceOptions(stepId: number, text: string): string[] {
  if (stepId === 9) {
    const requestOptions = parseRequestChoiceOptions(text);
    if (requestOptions.length >= 2) return requestOptions;
  }

  const patterns = [
    /(?:подсегмент|сегмент|запрос|вариант)\s+\d+\s*[—\-–:]+\s*\*{0,2}([^\n*:]{3,})/gi,
    /(?:^|\n)\s*\*{0,2}[🥇🥈🥉]\s*\*{0,2}\s*(?:(?:сегмент|запрос|вариант)\s+\d+\s*[—\-–]\s*)?([^\n*:]{3,})/gim,
    /(?:^|\n)\s*\d+[.)]\s*\*{0,2}([^\n*]{5,80})/gm,
    /\*\*([^*\n]{5,60})\*\*/g,
  ];

  for (const pattern of patterns) {
    const matches = [...text.matchAll(pattern)]
      .map((m) => stripMd(m[1]).split(':')[0].trim())
      .filter((value) => value.length > 3);
    if (matches.length >= 2) return matches.slice(0, 5);
  }

  return text.split('\n')
    .map((line) => line.replace(/^[\s*#\d.)🥇🥈🥉—\-–:«»]+/, '').replace(/\*+/g, '').trim())
    .filter((line) => line.length > 10 && line.length < 120)
    .slice(0, 5);
}

function filterOutQuestions(options: string[]): string[] {
  return options.filter((opt) => {
    if (opt.includes('?')) return false;
    if (/^(кто|что|как|когда|почему|зачем|какой|какая|какие|уточни|можете|расскажи|поясни)/i.test(opt)) return false;
    return true;
  });
}

export function normalizeChoiceOptions(stepId: number, text: string): string[] {
  const options = parseChoiceOptions(stepId, text);
  return stepId === 9 ? options : filterOutQuestions(options);
}

export function buildChoiceOptionsFallback(
  stepId: number,
  answers: Partial<AudienceAnswers>,
  positioning: PositioningLike | null,
): string[] {
  if (stepId === 9) {
    const fromTop = parseRequestChoiceOptions(answers.top3requests ?? '');
    if (fromTop.length >= 2) return fromTop;

    const fromRequests = parseRequestChoiceOptions(answers.requests ?? '');
    if (fromRequests.length >= 2) return fromRequests.slice(0, 3);

    return [
      'Самый срочный запрос клиента',
      'Запрос с самой сильной эмоциональной болью',
      'Запрос, по которому клиент быстрее готов купить решение',
    ];
  }

  return buildFallbackOptions(stepId, positioning);
}

function buildFallbackOptions(stepId: number, positioning: PositioningLike | null): string[] {
  const audience = positioning?.audience || 'основная аудитория проекта';
  const problem = positioning?.problem || 'ключевая проблема';
  const result = positioning?.result || 'желаемый результат';

  if (stepId === 3) {
    return [
      `${audience}: высокая срочность проблемы «${problem}»`,
      `${audience}: уже пробовали решить проблему, но не получили ${result}`,
      `${audience}: осознали проблему и готовы к работе`,
    ];
  }

  if (stepId === 5) {
    return [
      `Нужен быстрый первый шаг по теме «${problem}»`,
      `Есть повторяющийся сценарий, который мешает получить ${result}`,
      `Нужна понятная система действий без перегруза`,
    ];
  }

  return [
    `Как справиться с проблемой «${problem}»`,
    `Что делать, чтобы получить ${result}`,
    `С чего начать работу над этой задачей`,
  ];
}

export function isAffirmativeChoice(text: string): boolean {
  return /^(да|ок|окей|выбираю|хочу выбрать|берем|берём|подтверждаю|согласен|согласна|продолжаем|продолжай|готов|готова|готов продолжать|готова продолжать|двигаемся дальше|идем дальше|идём дальше|давай дальше)/i.test(text.trim());
}

export function looksLikeContinueIntent(text: string): boolean {
  return /(продолж|готов|дальше|двигаемся|идем|идём|выбираю|берем|берём|подтверждаю)/i.test(text.trim());
}

export function extractChoiceCandidate(text: string, stepId: number): string | null {
  const bold = [...text.matchAll(/\*\*([^*\n]{4,140})\*\*/g)].map((m) => m[1].trim()).filter(Boolean);
  if (bold.length) return bold[bold.length - 1];

  const quoted = [...text.matchAll(/[«"]([^»"\n]{4,140})[»"]/g)].map((m) => m[1].trim()).filter(Boolean);
  if (quoted.length) return quoted[quoted.length - 1];

  const label = stepId === 3 ? 'сегмент' : stepId === 5 ? 'подсегмент' : 'запрос';
  const byLabel = text.match(new RegExp(`${label}\\s*[—:-]\\s*([^\\n.?!]{4,140})`, 'i'))?.[1]?.trim();
  if (byLabel) return byLabel;

  const direct = text
    .replace(/^(добавь|добавить|предложи|хочу выбрать|выбираю|берем|берём)\s+/i, '')
    .replace(new RegExp(`^${label}\\s*`, 'i'), '')
    .trim();
  if (direct.length >= 8 && direct.length <= 140 && !direct.includes('?')) return direct;

  return null;
}

export function previousChoiceSourceKey(stepId: number): keyof AudienceAnswers | null {
  if (stepId === 3) return 'top3segments';
  if (stepId === 5) return 'subsegments';
  if (stepId === 9) return 'top3requests';
  return null;
}
