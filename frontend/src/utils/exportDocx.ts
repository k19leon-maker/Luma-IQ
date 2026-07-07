import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Footer, AlignmentType, BorderStyle,
} from 'docx';
import { saveAs } from 'file-saver';

function safeFileName(filename: string): string {
  return filename.replace(/[<>:"/\\|?*]/g, '').trim() || 'document';
}

function stripMarkdownMarkers(value: string): string {
  return value
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

function inlineRuns(value: string, size = 24): TextRun[] {
  const runs: TextRun[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value)) !== null) {
    if (match.index > cursor) {
      runs.push(new TextRun({ text: value.slice(cursor, match.index), size }));
    }
    const token = match[0];
    if (token.startsWith('**')) {
      runs.push(new TextRun({ text: token.slice(2, -2), bold: true, size }));
    } else if (token.startsWith('`')) {
      runs.push(new TextRun({ text: token.slice(1, -1), font: 'Courier New', size }));
    }
    cursor = match.index + token.length;
  }

  if (cursor < value.length) {
    runs.push(new TextRun({ text: value.slice(cursor), size }));
  }

  return runs.length ? runs : [new TextRun({ text: value, size })];
}

function markdownToDocxParagraphs(markdown: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      paragraphs.push(new Paragraph({ children: [], spacing: { after: 80 } }));
      continue;
    }

    if (line.startsWith('# ')) {
      paragraphs.push(new Paragraph({
        text: stripMarkdownMarkers(line.slice(2)),
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 160, after: 220 },
        keepNext: true,
      }));
      continue;
    }

    if (line.startsWith('## ')) {
      paragraphs.push(new Paragraph({
        text: stripMarkdownMarkers(line.slice(3)),
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 260, after: 140 },
        keepNext: true,
        border: {
          top: { style: BorderStyle.SINGLE, size: 4, color: 'E5E3DC', space: 8 },
        },
      }));
      continue;
    }

    if (line.startsWith('### ')) {
      paragraphs.push(new Paragraph({
        text: stripMarkdownMarkers(line.slice(4)),
        heading: HeadingLevel.HEADING_3,
        spacing: { before: 180, after: 100 },
        keepNext: true,
      }));
      continue;
    }

    const numbered = line.match(/^(\d+)[\.\)]\s+(.+)$/);
    if (numbered) {
      paragraphs.push(new Paragraph({
        children: inlineRuns(numbered[2]),
        bullet: { level: 0 },
        spacing: { after: 100 },
        indent: { left: 360, hanging: 180 },
      }));
      continue;
    }

    const bullet = line.match(/^[-•]\s+(.+)$/);
    if (bullet) {
      paragraphs.push(new Paragraph({
        children: inlineRuns(bullet[1]),
        bullet: { level: 0 },
        spacing: { after: 100 },
        indent: { left: 360, hanging: 180 },
      }));
      continue;
    }

    if (/^\|.*\|$/.test(line)) {
      paragraphs.push(new Paragraph({
        children: inlineRuns(line.replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim()).join(' | '), 22),
        spacing: { after: 90 },
      }));
      continue;
    }

    paragraphs.push(new Paragraph({
      children: inlineRuns(line),
      spacing: { after: 120 },
    }));
  }

  return paragraphs;
}

export async function exportToDocx(
  title: string,
  content: string,
  filename: string,
): Promise<void> {
  const contentParagraphs = markdownToDocxParagraphs(content);

  const doc = new Document({
    sections: [
      {
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: 'Создано в LumaIQ',
                    size: 18,
                    color: '888888',
                  }),
                ],
                alignment: AlignmentType.CENTER,
              }),
            ],
          }),
        },
        children: [
          new Paragraph({
            text: title,
            heading: HeadingLevel.HEADING_1,
            spacing: { after: 240 },
          }),
          new Paragraph({ children: [], spacing: { after: 120 } }),
          ...contentParagraphs,
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const safe = safeFileName(filename);
  saveAs(blob, `${safe}.docx`);
}

export async function exportMarkdownToDocx(
  title: string,
  markdown: string,
  filename: string,
): Promise<void> {
  const doc = new Document({
    styles: {
      paragraphStyles: [
        {
          id: 'Heading1',
          name: 'Heading 1',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { size: 34, bold: true, color: '1A1A1A' },
          paragraph: { spacing: { before: 160, after: 220 } },
        },
        {
          id: 'Heading2',
          name: 'Heading 2',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { size: 26, bold: true, color: '9A6A00', allCaps: true },
          paragraph: { spacing: { before: 260, after: 140 } },
        },
        {
          id: 'Heading3',
          name: 'Heading 3',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { size: 24, bold: true, color: '333333' },
          paragraph: { spacing: { before: 180, after: 100 } },
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 900, right: 900, bottom: 900, left: 900 },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [new TextRun({ text: 'Создано в LumaIQ', size: 18, color: '888888' })],
                alignment: AlignmentType.CENTER,
              }),
            ],
          }),
        },
        children: [
          new Paragraph({
            children: [new TextRun({ text: title, bold: true, size: 38, color: '1A1A1A' })],
            spacing: { after: 280 },
            keepNext: true,
          }),
          ...markdownToDocxParagraphs(markdown.replace(/^#\s+.+\n?/, '').trim()),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${safeFileName(filename)}.docx`);
}
