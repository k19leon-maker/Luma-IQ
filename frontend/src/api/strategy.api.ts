import html2pdf from 'html2pdf.js';

const sections = [
  { key: 'segments', label: '10 сегментов целевой аудитории' },
  { key: 'top3segments', label: 'ТОП 3 сегмента' },
  { key: 'chosenSegment', label: 'Выбранный сегмент' },
  { key: 'subsegments', label: '5 подсегментов' },
  { key: 'chosenSubsegment', label: 'Выбранный подсегмент' },
  { key: 'wants', label: 'Список "ХОЧУ"' },
  { key: 'requests', label: '10 запросов сегмента' },
  { key: 'top3requests', label: 'ТОП 3 запроса' },
  { key: 'chosenRequest', label: 'Выбранный запрос' },
  { key: 'painfulQuestions', label: 'Болезненные вопросы' },
  { key: 'deepDesires', label: 'Сокровенные желания' },
  { key: 'finalResult', label: 'Конечный результат' },
  { key: 'corePains', label: 'Что бесит больше всего' },
];

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatContent(value: string): string {
  const safe = escapeHtml(value || '—')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/^[-•]\s+/gm, '• ')
    .replace(/\n/g, '<br />');
  return safe;
}

function safeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'LumaIQ';
}

function buildPdfElement(projectName: string, answers: Record<string, string>): HTMLElement {
  const root = document.createElement('div');
  const date = new Date().toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  root.innerHTML = `
    <style>
      .liq-pdf {
        width: 794px;
        min-height: 1123px;
        box-sizing: border-box;
        padding: 44px 48px 52px;
        background: #ffffff;
        color: #1a1a1a;
        font-family: Inter, Arial, sans-serif;
      }
      .liq-cover {
        border: 1px solid #e8e1d3;
        border-radius: 18px;
        padding: 34px;
        background: linear-gradient(135deg, #fffaf0 0%, #ffffff 52%, #f7f6f2 100%);
        margin-bottom: 24px;
      }
      .liq-brand {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 48px;
      }
      .liq-mark {
        width: 34px;
        height: 34px;
        border-radius: 10px;
        background: rgba(212, 168, 71, 0.16);
        color: #d4a847;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 18px;
        font-weight: 800;
      }
      .liq-logo {
        font-size: 18px;
        line-height: 1;
        font-weight: 800;
        letter-spacing: 0;
      }
      .liq-logo span { color: #d4a847; }
      .liq-kicker {
        margin: 0 0 10px;
        color: #9b7929;
        font-size: 12px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 1.8px;
      }
      .liq-title {
        margin: 0;
        max-width: 560px;
        font-size: 34px;
        line-height: 1.12;
        font-weight: 800;
        letter-spacing: 0;
      }
      .liq-subtitle {
        margin: 14px 0 0;
        max-width: 560px;
        color: #69666d;
        font-size: 14px;
        line-height: 1.6;
      }
      .liq-meta {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        margin-top: 30px;
      }
      .liq-pill {
        border: 1px solid #ead8a6;
        background: #fff8e7;
        color: #7c621c;
        border-radius: 999px;
        padding: 8px 12px;
        font-size: 12px;
        font-weight: 700;
      }
      .liq-section {
        page-break-inside: avoid;
        break-inside: avoid;
        border: 1px solid #ece8df;
        border-left: 5px solid #d4a847;
        border-radius: 12px;
        padding: 18px 20px;
        margin: 0 0 14px;
        background: #ffffff;
      }
      .liq-step {
        color: #d4a847;
        font-size: 10px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 1.4px;
        margin-bottom: 5px;
      }
      .liq-heading {
        margin: 0 0 10px;
        color: #1f1f24;
        font-size: 17px;
        line-height: 1.3;
        font-weight: 800;
      }
      .liq-content {
        color: #24232a;
        font-size: 12.5px;
        line-height: 1.62;
      }
      .liq-content strong {
        font-weight: 800;
      }
      .liq-footer {
        margin-top: 24px;
        padding-top: 14px;
        border-top: 1px solid #ece8df;
        display: flex;
        justify-content: space-between;
        color: #9a969f;
        font-size: 11px;
      }
    </style>
    <div class="liq-pdf">
      <div class="liq-cover">
        <div class="liq-brand">
          <div class="liq-mark">✦</div>
          <div class="liq-logo"><span>Luma</span>IQ</div>
        </div>
        <p class="liq-kicker">Мета-упаковка целевой аудитории</p>
        <h1 class="liq-title">${escapeHtml(projectName)}</h1>
        <p class="liq-subtitle">
          PDF-отчет по 13-шаговой AI-проработке целевой аудитории. Документ помогает сохранить сегменты,
          запросы, боли, желания и итоговую формулировку результата для дальнейшей упаковки, УТП и контента.
        </p>
        <div class="liq-meta">
          <div class="liq-pill">Создано ${date}</div>
          <div class="liq-pill">13 шагов анализа</div>
          <div class="liq-pill">LumaIQ AI-маркетолог</div>
        </div>
      </div>
      ${sections.map((section, index) => `
        <section class="liq-section">
          <div class="liq-step">Шаг ${index + 1}</div>
          <h2 class="liq-heading">${escapeHtml(section.label)}</h2>
          <div class="liq-content">${formatContent(answers[section.key] ?? '—')}</div>
        </section>
      `).join('')}
      <div class="liq-footer">
        <span>Создано в LumaIQ</span>
        <span>lumaiq.ru</span>
      </div>
    </div>
  `;

  return root;
}

async function waitForPdfRender(): Promise<void> {
  if ('fonts' in document) {
    await document.fonts.ready;
  }
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

export const downloadStrategyPdf = async (
  projectName: string,
  answers: Record<string, string>,
): Promise<void> => {
  const element = buildPdfElement(projectName, answers);
  element.style.position = 'absolute';
  element.style.left = '0';
  element.style.top = '0';
  element.style.zIndex = '-1';
  element.style.pointerEvents = 'none';
  document.body.appendChild(element);

  try {
    await waitForPdfRender();
    const pdfElement = element.querySelector<HTMLElement>('.liq-pdf');
    if (!pdfElement || pdfElement.offsetWidth === 0 || pdfElement.offsetHeight === 0) {
      throw new Error('Не удалось подготовить PDF-макет');
    }

    const options = {
      margin: 0,
      filename: `LumaIQ_${safeFileName(projectName)}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        width: pdfElement.offsetWidth,
        windowWidth: pdfElement.offsetWidth,
      },
      jsPDF: { unit: 'pt', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'] },
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
    document.body.removeChild(element);
  }
};
