import ReactMarkdown from 'react-markdown';
import s from './FormattedText.module.css';

interface FormattedTextProps {
  children: string;
  compact?: boolean;
  inverse?: boolean;
  className?: string;
}

function normalizeAiText(value: string): string {
  const text = value
    .replace(/```(?:markdown|md|text)?/gi, '')
    .replace(/```/g, '')
    .replace(/\r\n/g, '\n')
    .trim();

  const lines = text.split('\n');
  const out: string[] = [];

  for (const rawLine of lines) {
    let line = rawLine.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      if (out[out.length - 1] !== '') out.push('');
      continue;
    }

    line = trimmed
      .replace(/^•\s+/, '- ')
      .replace(/^(Когда|Хочу|Чтобы|Почему|Ситуация|Боль|Запрос|Результат|Вывод|CTA):\s*/i, '**$1:** ');

    if (/^(🥇|🥈|🥉)\s*(Сегмент|Подсегмент|Запрос)\s+\d+\s*[—\-–:]/i.test(line)) {
      if (out[out.length - 1] !== '') out.push('');
      out.push(`### ${line}`);
      out.push('');
      continue;
    }

    if (/^(Сегмент|Подсегмент|Запрос)\s+\d+\s*[—\-–:]/i.test(line)) {
      if (out[out.length - 1] !== '') out.push('');
      out.push(`### ${line}`);
      out.push('');
      continue;
    }

    if (/^#{1,6}\s+/.test(line)) {
      if (out[out.length - 1] !== '') out.push('');
      out.push(line);
      out.push('');
      continue;
    }

    out.push(line);
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export default function FormattedText({ children, compact = false, inverse = false, className = '' }: FormattedTextProps) {
  const classes = [
    s.root,
    compact ? s.compact : '',
    inverse ? s.inverse : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={classes}>
      <ReactMarkdown>{normalizeAiText(children)}</ReactMarkdown>
    </div>
  );
}
