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
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '')
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

const SAFE_MARKDOWN_ELEMENTS = [
  'p',
  'br',
  'strong',
  'em',
  'ul',
  'ol',
  'li',
  'blockquote',
  'code',
  'pre',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'a',
] as const;

interface TextSegment {
  type: 'text';
  value: string;
}

interface TableSegment {
  type: 'table';
  headers: string[];
  rows: string[][];
}

type Segment = TextSegment | TableSegment;

function isPipeTableLine(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.split('|').length >= 4;
}

function parsePipeRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

function isSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function parseTable(lines: string[]): TableSegment | null {
  const parsed = lines.map(parsePipeRow).filter((row) => row.length >= 2);
  if (parsed.length < 2) return null;

  const separatorIndex = parsed.findIndex(isSeparatorRow);
  const headers = separatorIndex > 0 ? parsed[separatorIndex - 1] : parsed[0];
  const rows = parsed
    .filter((_, index) => index !== separatorIndex && index !== (separatorIndex > 0 ? separatorIndex - 1 : 0))
    .filter((row) => !isSeparatorRow(row));

  if (headers.length < 2 || rows.length === 0) return null;

  return {
    type: 'table',
    headers,
    rows: rows.map((row) => headers.map((_, index) => row[index] ?? '')),
  };
}

function splitSegments(markdown: string): Segment[] {
  const lines = markdown.split('\n');
  const segments: Segment[] = [];
  let textBuffer: string[] = [];
  let tableBuffer: string[] = [];

  function flushText() {
    const value = textBuffer.join('\n').trim();
    if (value) segments.push({ type: 'text', value });
    textBuffer = [];
  }

  function flushTable() {
    if (tableBuffer.length > 0) {
      const table = parseTable(tableBuffer);
      if (table) {
        flushText();
        segments.push(table);
      } else {
        textBuffer.push(...tableBuffer);
      }
    }
    tableBuffer = [];
  }

  for (const line of lines) {
    if (isPipeTableLine(line)) {
      tableBuffer.push(line);
    } else {
      flushTable();
      textBuffer.push(line);
    }
  }

  flushTable();
  flushText();

  return segments;
}

function InlineMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      allowedElements={SAFE_MARKDOWN_ELEMENTS}
      unwrapDisallowed
      components={{
        a: ({ children: linkChildren, href }) => <a href={href} target="_blank" rel="noreferrer">{linkChildren}</a>,
        p: ({ children: paragraphChildren }) => <>{paragraphChildren}</>,
      }}
    >
      {children}
    </ReactMarkdown>
  );
}

export default function FormattedText({ children, compact = false, inverse = false, className = '' }: FormattedTextProps) {
  const classes = [
    s.root,
    compact ? s.compact : '',
    inverse ? s.inverse : '',
    className,
  ].filter(Boolean).join(' ');
  const segments = splitSegments(normalizeAiText(children));

  return (
    <div className={classes}>
      {segments.map((segment, index) => {
        if (segment.type === 'text') {
          return (
            <ReactMarkdown
              key={`text-${index}`}
              allowedElements={SAFE_MARKDOWN_ELEMENTS}
              unwrapDisallowed
              components={{
                a: ({ children: linkChildren, href }) => <a href={href} target="_blank" rel="noreferrer">{linkChildren}</a>,
              }}
            >
              {segment.value}
            </ReactMarkdown>
          );
        }

        return (
          <div key={`table-${index}`} className={s.tableScroll}>
            <table className={s.table}>
              <thead>
                <tr>
                  {segment.headers.map((header, headerIndex) => (
                    <th key={`h-${headerIndex}`}><InlineMarkdown>{header}</InlineMarkdown></th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {segment.rows.map((row, rowIndex) => (
                  <tr key={`r-${rowIndex}`}>
                    {row.map((cell, cellIndex) => (
                      <td key={`c-${rowIndex}-${cellIndex}`}><InlineMarkdown>{cell}</InlineMarkdown></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
