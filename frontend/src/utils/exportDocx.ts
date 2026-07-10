import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Footer, AlignmentType, BorderStyle,
} from 'docx';
import { saveAs } from 'file-saver';
import html2pdf from 'html2pdf.js';

const DOCUMENT_FONT = 'Arial';

function safeFileName(filename: string): string {
  return filename.replace(/[<>:"/\\|?*]/g, '').trim() || 'document';
}

function stripMarkdownMarkers(value: string): string {
  return value
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^[-*_]{3,}\s*$/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

function normalizeMarkdown(markdown: string): string {
  return markdown
    .replace(/\r\n/g, '\n')
    .replace(/```(?:json|markdown|md)?/gi, '')
    .replace(/```/g, '')
    .replace(/^[-*_]{3,}\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function inlineRuns(value: string, size = 24): TextRun[] {
  const runs: TextRun[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value)) !== null) {
    if (match.index > cursor) {
      runs.push(new TextRun({ text: value.slice(cursor, match.index), font: DOCUMENT_FONT, size }));
    }
    const token = match[0];
    if (token.startsWith('**')) {
      runs.push(new TextRun({ text: token.slice(2, -2), font: DOCUMENT_FONT, bold: true, size }));
    } else if (token.startsWith('`')) {
      runs.push(new TextRun({ text: token.slice(1, -1), font: DOCUMENT_FONT, size }));
    }
    cursor = match.index + token.length;
  }

  if (cursor < value.length) {
    runs.push(new TextRun({ text: value.slice(cursor), font: DOCUMENT_FONT, size }));
  }

  return runs.length ? runs : [new TextRun({ text: value, font: DOCUMENT_FONT, size })];
}

function markdownToDocxParagraphs(markdown: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const lines = normalizeMarkdown(markdown).split('\n');

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      paragraphs.push(new Paragraph({ children: [], spacing: { after: 80 } }));
      continue;
    }

    if (line.startsWith('# ')) {
      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: stripMarkdownMarkers(line.slice(2)), font: DOCUMENT_FONT, bold: true, size: 34 })],
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 160, after: 220 },
        keepNext: true,
      }));
      continue;
    }

    if (line.startsWith('## ')) {
      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: stripMarkdownMarkers(line.slice(3)), font: DOCUMENT_FONT, bold: true, size: 26, color: '9A6A00' })],
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
        children: [new TextRun({ text: stripMarkdownMarkers(line.slice(4)), font: DOCUMENT_FONT, bold: true, size: 24 })],
        heading: HeadingLevel.HEADING_3,
        spacing: { before: 180, after: 100 },
        keepNext: true,
      }));
      continue;
    }

    const numbered = line.match(/^(\d+)[\.\)]\s+(.+)$/);
    if (numbered) {
      paragraphs.push(new Paragraph({
        children: [
          new TextRun({ text: `${numbered[1]}. `, font: DOCUMENT_FONT, size: 24 }),
          ...inlineRuns(numbered[2]),
        ],
        spacing: { after: 100 },
        indent: { left: 240 },
      }));
      continue;
    }

    const bullet = line.match(/^[-•]\s+(.+)$/);
    if (bullet) {
      paragraphs.push(new Paragraph({
        children: [
          new TextRun({ text: '• ', font: DOCUMENT_FONT, size: 24 }),
          ...inlineRuns(bullet[1]),
        ],
        spacing: { after: 100 },
        indent: { left: 240 },
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

function markdownToHtml(markdown: string): string {
  const lines = normalizeMarkdown(markdown).split('\n');
  const html: string[] = [];
  let listType: 'ul' | 'ol' | null = null;

  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  };

  const inline = (value: string) => escapeHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      closeList();
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      closeList();
      const level = Math.min(heading[1].length, 3);
      html.push(`<h${level}>${inline(stripMarkdownMarkers(heading[2]))}</h${level}>`);
      continue;
    }

    const numbered = line.match(/^(\d+)[\.\)]\s+(.+)$/);
    if (numbered) {
      if (listType !== 'ol') {
        closeList();
        listType = 'ol';
        html.push('<ol>');
      }
      html.push(`<li>${inline(numbered[2])}</li>`);
      continue;
    }

    const bullet = line.match(/^[-•]\s+(.+)$/);
    if (bullet) {
      if (listType !== 'ul') {
        closeList();
        listType = 'ul';
        html.push('<ul>');
      }
      html.push(`<li>${inline(bullet[1])}</li>`);
      continue;
    }

    closeList();
    html.push(`<p>${inline(line)}</p>`);
  }

  closeList();
  return html.join('\n');
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
                    font: DOCUMENT_FONT,
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
            children: [new TextRun({ text: title, font: DOCUMENT_FONT, bold: true, size: 34 })],
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
      default: {
        document: {
          run: {
            font: DOCUMENT_FONT,
            size: 24,
          },
        },
      },
      paragraphStyles: [
        {
          id: 'Heading1',
          name: 'Heading 1',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { font: DOCUMENT_FONT, size: 34, bold: true, color: '1A1A1A' },
          paragraph: { spacing: { before: 160, after: 220 } },
        },
        {
          id: 'Heading2',
          name: 'Heading 2',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { font: DOCUMENT_FONT, size: 26, bold: true, color: '9A6A00', allCaps: true },
          paragraph: { spacing: { before: 260, after: 140 } },
        },
        {
          id: 'Heading3',
          name: 'Heading 3',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { font: DOCUMENT_FONT, size: 24, bold: true, color: '333333' },
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
                children: [new TextRun({ text: 'Создано в LumaIQ', font: DOCUMENT_FONT, size: 18, color: '888888' })],
                alignment: AlignmentType.CENTER,
              }),
            ],
          }),
        },
        children: [
          new Paragraph({
            children: [new TextRun({ text: title, font: DOCUMENT_FONT, bold: true, size: 38, color: '1A1A1A' })],
            spacing: { after: 280 },
            keepNext: true,
          }),
          ...markdownToDocxParagraphs(normalizeMarkdown(markdown).replace(/^#\s+.+\n?/, '').trim()),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${safeFileName(filename)}.docx`);
}

async function waitForPdfRender(): Promise<void> {
  if ('fonts' in document) {
    await document.fonts.ready;
  }
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

export async function exportMarkdownToPdf(
  title: string,
  markdown: string,
  filename: string,
): Promise<void> {
  const root = document.createElement('div');
  root.style.position = 'absolute';
  root.style.left = '0';
  root.style.top = '0';
  root.style.zIndex = '-1';
  root.style.pointerEvents = 'none';
  root.innerHTML = `
    <style>
      .liq-product-pdf {
        width: 794px;
        min-height: 1123px;
        box-sizing: border-box;
        padding: 52px 58px 64px;
        background: #ffffff;
        color: #1a1a1a;
        font-family: Arial, Calibri, sans-serif;
      }
      .liq-product-pdf h1 {
        margin: 0 0 24px;
        font-size: 30px;
        line-height: 1.18;
        page-break-after: avoid;
        break-after: avoid;
      }
      .liq-product-pdf h2 {
        margin: 26px 0 10px;
        padding-top: 12px;
        border-top: 1px solid #e5e3dc;
        color: #8a6500;
        font-size: 18px;
        line-height: 1.32;
        page-break-after: avoid;
        break-after: avoid;
      }
      .liq-product-pdf h3 {
        margin: 20px 0 8px;
        color: #333333;
        font-size: 15px;
        line-height: 1.35;
        page-break-after: avoid;
        break-after: avoid;
      }
      .liq-product-pdf p,
      .liq-product-pdf li {
        font-size: 12.5px;
        line-height: 1.62;
      }
      .liq-product-pdf p {
        margin: 0 0 9px;
      }
      .liq-product-pdf ul,
      .liq-product-pdf ol {
        margin: 0 0 12px 20px;
        padding: 0;
        page-break-inside: avoid;
        break-inside: avoid;
      }
      .liq-product-pdf li {
        margin-bottom: 5px;
      }
      .liq-product-pdf strong {
        font-weight: 700;
      }
      .liq-product-pdf code {
        font-family: Arial, Calibri, sans-serif;
      }
      .liq-product-footer {
        margin-top: 28px;
        padding-top: 12px;
        border-top: 1px solid #ece8df;
        color: #888888;
        font-size: 10px;
        text-align: center;
      }
    </style>
    <article class="liq-product-pdf">
      <h1>${escapeHtml(title)}</h1>
      ${markdownToHtml(normalizeMarkdown(markdown).replace(/^#\s+.+\n?/, '').trim())}
      <div class="liq-product-footer">Создано в LumaIQ</div>
    </article>
  `;
  document.body.appendChild(root);

  try {
    await waitForPdfRender();
    const pdfElement = root.querySelector<HTMLElement>('.liq-product-pdf');
    if (!pdfElement || pdfElement.offsetWidth === 0 || pdfElement.offsetHeight === 0) {
      throw new Error('Не удалось подготовить PDF-макет');
    }
    const options = {
      margin: 0,
      filename: `${safeFileName(filename)}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        width: pdfElement.offsetWidth,
        windowWidth: pdfElement.offsetWidth,
      },
      jsPDF: { unit: 'pt', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'], avoid: ['h1', 'h2', 'h3', 'ul', 'ol'] },
    } as Record<string, unknown>;
    await (html2pdf() as {
      set: (opts: Record<string, unknown>) => {
        from: (el: HTMLElement) => { save: () => Promise<void> };
      };
    })
      .set(options)
      .from(pdfElement)
      .save();
  } finally {
    document.body.removeChild(root);
  }
}
