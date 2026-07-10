import { useEffect, useRef } from 'react';
import s from './Positioning.module.css';

export const POSITIONING_MODELS = [
  {
    title: 'По нише',
    type: 'Нишевое позиционирование',
    note: 'Хорошо работает, когда ниша уже понятна и у эксперта есть сильные кейсы в одном рынке.',
    detail: 'Сужает рынок до понятного сегмента. Подходит, если у эксперта уже есть повторяемые кейсы в одной нише и понятный язык аудитории.',
    pros: 'Проще объяснять ценность, быстрее собирать доверие, легче делать контент под одну аудиторию.',
    cons: 'Можно слишком рано сузиться и потерять соседние платежеспособные сегменты.',
    money: 'Чек растет, если ниша платежеспособная и проблема дорогая.',
  },
  {
    title: 'По задаче / результату',
    type: 'По задаче клиента',
    note: 'Часто лучше продает, потому что говорит языком результата клиента, а не профессии эксперта.',
    detail: 'Ставит в центр не профессию эксперта, а конкретную задачу, ради которой клиент готов платить.',
    pros: 'Хорошо цепляет спрос, помогает быстро объяснить зачем покупать.',
    cons: 'Если результат слишком широкий, позиционирование снова становится generic.',
    money: 'Обычно дает сильный коммерческий фокус и понятную связь с продуктами.',
  },
  {
    title: 'По проблеме',
    type: 'Проблемное позиционирование',
    note: 'Полезно, когда аудитория остро осознает боль и ищет решение прямо сейчас.',
    detail: 'Работает от боли: человек узнает свою ситуацию и понимает, что эксперт специализируется именно на ней.',
    pros: 'Высокое узнавание, сильные хуки, хороший прогрев через контент.',
    cons: 'Может звучать слишком тревожно, если перегнуть с болью.',
    money: 'Сильнее всего работает там, где проблема уже стоит дорого для клиента.',
  },
  {
    title: 'По механизму',
    type: 'По авторскому механизму',
    note: 'Усиливает доверие и премиальность, если у эксперта есть понятная методология.',
    detail: 'Фокус на способе решения: метод, система, процесс, технология, авторский подход.',
    pros: 'Добавляет экспертность, отличает от “я просто консультирую”.',
    cons: 'Механизм должен быть понятным, иначе он усложнит продажу.',
    money: 'Поднимает чек, если механизм выглядит внедряемым и снижает риск для клиента.',
  },
  {
    title: 'По аудитории',
    type: 'По целевой аудитории',
    note: 'Помогает быстро сузиться и стать “своим” для конкретного сегмента.',
    detail: 'Показывает, для кого именно работает эксперт. Полезно, если аудитория хочет видеть “своего” специалиста.',
    pros: 'Проще писать контент, собирать кейсы и делать офферы под одну группу.',
    cons: 'Если аудитория описана слишком широко, модель не дает отличия.',
    money: 'Чек зависит от платежеспособности выбранного сегмента.',
  },
  {
    title: 'По роли / авторитету',
    type: 'По экспертной роли',
    note: 'Работает для премиального образа и сильной экспертной позиции.',
    detail: 'Формирует роль эксперта на рынке: архитектор, стратег, наставник, внедренец, редактор, продюсер.',
    pros: 'Создает статус, помогает выйти из товарного сравнения по цене.',
    cons: 'Нужны доказательства: кейсы, цифры, опыт, публичность или методология.',
    money: 'Хорошо работает для премиальных услуг и консультационных форматов.',
  },
  {
    title: 'По трансформации',
    type: 'По трансформации',
    note: 'Показывает путь из текущего состояния в желаемое и хорошо связывается с продуктами.',
    detail: 'Описывает переход клиента из точки А в точку Б. Хорошо подходит для упаковки воронки и продуктовой линейки.',
    pros: 'Дает понятную драматургию, сильные кейсы и ясное обещание.',
    cons: 'Трансформация должна быть конкретной, иначе будет звучать как мотивационный лозунг.',
    money: 'Повышает ценность, если точка Б измерима и важна для бизнеса или жизни клиента.',
  },
];

export function extractVariantTitle(text: string): string {
  return text.split('\n')[0]?.replace(/^#+\s*/, '').trim() || 'Вариант позиционирования';
}

export function stripLeadingLabel(text: string): string {
  return text.replace(/^#+\s*/, '').replace(/^\d+[\).]\s*/, '').trim();
}

export function getFieldValue(text: string, label: string): string {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(`${escaped}:\\s*([^\\n]+)`, 'i'));
  return match?.[1]?.trim() ?? '';
}

export function variantSummary(text: string): string {
  return getFieldValue(text, 'Формулировка') || stripLeadingLabel(text).split('\n').slice(0, 2).join(' ');
}

export function variantType(text: string): string {
  return getFieldValue(text, 'Тип') || 'Стратегический вариант';
}

export function parseVariants(content: string): string[] {
  const chunks = content
    .split(/\n(?=###\s+)/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (chunks.length > 1) return chunks;
  return content
    .split(/\n(?=\d+[\).]\s+)/)
    .map((item) => item.trim())
    .filter((item) => item.length > 80);
}

export function buildStatement(data: {
  role: string;
  audience: string;
  problem: string;
  result: string;
  mechanism: string;
  differentiation: string;
  proof: string;
  selectedVariant: string;
}): string {
  return [
    data.role ? `Кто вы: ${data.role}` : '',
    data.audience ? `Для кого: ${data.audience}` : '',
    data.problem ? `Проблема: ${data.problem}` : '',
    data.result ? `Результат: ${data.result}` : '',
    data.mechanism ? `Механизм: ${data.mechanism}` : '',
    data.differentiation ? `Отличие: ${data.differentiation}` : '',
    data.proof ? `Почему доверять: ${data.proof}` : '',
  ].filter(Boolean).join('\n');
}

function cleanMarkdownLabel(value: string): string {
  return value.replace(/^#+\s*/, '').replace(/\*\*/g, '').trim();
}

function renderLineWithAccent(line: string) {
  const labelMatch = line.match(/^([^:]{2,42}):\s*(.+)$/);
  if (!labelMatch) return line;
  return <><strong>{labelMatch[1]}:</strong> {labelMatch[2]}</>;
}

function updateTextLine(source: string, index: number, nextLine: string) {
  const lines = source.split('\n');
  lines[index] = nextLine;
  return lines.join('\n');
}

export function MarkdownBlock({ content, compact = false }: { content: string; compact?: boolean }) {
  if (!content.trim()) return null;
  const lines = content.split('\n').map((line) => line.trim()).filter(Boolean);
  return (
    <div className={`${s.richText} ${compact ? s.richTextCompact : ''}`}>
      {lines.map((line, index) => {
        if (/^##+\s+/.test(line)) {
          return <h3 key={`${line}-${index}`}>{cleanMarkdownLabel(line)}</h3>;
        }
        if (/^[-—]\s+/.test(line)) {
          return <p className={s.bulletLine} key={`${line}-${index}`}>{renderLineWithAccent(line.replace(/^[-—]\s+/, ''))}</p>;
        }
        if (/^\d+[\).]\s+/.test(line)) {
          return <p className={s.bulletLine} key={`${line}-${index}`}>{renderLineWithAccent(line.replace(/^\d+[\).]\s+/, ''))}</p>;
        }
        return <p key={`${line}-${index}`}>{renderLineWithAccent(line)}</p>;
      })}
    </div>
  );
}

export function Field({ label, value, onChange, placeholder }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.style.height = 'auto';
    ref.current.style.height = `${ref.current.scrollHeight}px`;
  }, [value]);

  return (
    <label className={s.field}>
      <span>{label}</span>
      <textarea ref={ref} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} rows={2} />
    </label>
  );
}

export function EditableVariantPreview({ value, onChange }: {
  value: string;
  onChange: (value: string) => void;
}) {
  const lines = value.split('\n');

  if (!value.trim()) {
    return <p className={s.placeholderText}>Выберите вариант слева, чтобы посмотреть и отредактировать его.</p>;
  }

  return (
    <div className={s.editablePreview}>
      {lines.map((line, index) => {
        const heading = line.match(/^###\s*(.+)$/);
        const labelMatch = line.match(/^([^:]{2,34}):\s*(.*)$/);

        if (heading) {
          return (
            <AutoGrowInput
              className={s.editableHeading}
              key={`${index}-heading`}
              value={heading[1]}
              onChange={(next) => onChange(updateTextLine(value, index, `### ${next}`))}
            />
          );
        }

        if (labelMatch) {
          return (
            <label className={s.editableFact} key={`${index}-${labelMatch[1]}`}>
              <strong>{labelMatch[1]}:</strong>
              <AutoGrowInput
                value={labelMatch[2]}
                onChange={(next) => onChange(updateTextLine(value, index, `${labelMatch[1]}: ${next}`))}
              />
            </label>
          );
        }

        if (!line.trim()) {
          return <div className={s.editableSpacer} key={`${index}-empty`} />;
        }

        return (
          <AutoGrowInput
            key={`${index}-plain`}
            value={line}
            onChange={(next) => onChange(updateTextLine(value, index, next))}
          />
        );
      })}
    </div>
  );
}

function AutoGrowInput({ value, onChange, className }: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.style.height = 'auto';
    ref.current.style.height = `${ref.current.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      className={className}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      rows={1}
    />
  );
}

export function EmptyState({ onRun }: { onRun: () => void }) {
  return (
    <div className={s.empty}>
      <div className={s.emptyTitle}>Варианты еще не готовы</div>
      <p>Сгенерируйте варианты позиционирования на основе раздела «О себе».</p>
      <button className={s.primaryButton} onClick={() => void onRun()}>Сгенерировать варианты</button>
    </div>
  );
}
