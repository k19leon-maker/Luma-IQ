import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import type { AxiosError } from 'axios';
import { useProjectMarketingContext } from '../../hooks/useProjectMarketingContext';
import { useGeneratedStore, type ProductDraft } from '../../store/generated.store';
import { useMaterialsStore } from '../../store/materials.store';
import { useProgressStore } from '../../store/progress.store';
import { aiApi } from '../../api/ai';
import { buildProductMaterial } from '../../utils/projectMaterials';
import FormattedText from '../../components/FormattedText/FormattedText';
import html2pdf from 'html2pdf.js';

type StepStatus = 'idle' | 'running' | 'done';
type LeadMagnetFormat = 'pdf-guide' | 'video-lesson' | 'sales-longread';

interface LeadMagnetChatMessage {
  role: 'user' | 'assistant';
  content: string;
  stepId?: string;
  stepTitle?: string;
}

interface LeadMagnetStep {
  id: string;
  label: string;
}

interface LeadMagnetState extends ProductDraft {
  selectedFormat?: LeadMagnetFormat;
  chatMessages?: LeadMagnetChatMessage[];
  stepStatuses?: Record<string, StepStatus>;
}

const FORMAT_OPTIONS: Array<{
  id: LeadMagnetFormat;
  title: string;
  icon: string;
  description: string;
}> = [
  {
    id: 'sales-longread',
    title: 'Продающий лонгрид',
    icon: '✍️',
    description: 'Экспертная статья, которая прогревает к следующему шагу воронки.',
  },
  {
    id: 'video-lesson',
    title: 'Видеоурок',
    icon: '🎬',
    description: 'Сценарий урока с хуком, структурой, практикой и CTA.',
  },
  {
    id: 'pdf-guide',
    title: 'PDF-гайд',
    icon: '📄',
    description: 'Короткий полезный материал с понятным первым шагом и переходом в воронку.',
  },
];

const FORMAT_LABELS: Record<LeadMagnetFormat, string> = {
  'sales-longread': 'Продающий лонгрид',
  'video-lesson': 'Видеоурок',
  'pdf-guide': 'PDF-гайд',
};

const STEPS_BY_FORMAT: Record<LeadMagnetFormat, LeadMagnetStep[]> = {
  'sales-longread': [
    { id: 'headline', label: 'Заголовок' },
    { id: 'subheadline', label: 'Подзаголовок' },
    { id: 'leadText', label: 'Короткий лид-текст' },
    { id: 'articleMap', label: 'Что разберём в статье' },
    { id: 'expertIntro', label: 'Представление эксперта' },
    { id: 'misunderstanding', label: 'Главная ошибка в понимании проблемы' },
    { id: 'problemCause', label: 'Почему проблема возникла' },
    { id: 'triedSolutions', label: 'Какие старые решения клиент уже пробовал' },
    { id: 'failedSolutions', label: 'Почему старые решения не работают' },
    { id: 'bigShift', label: 'Главный смысловой разворот' },
    { id: 'methodModel', label: 'Метод / модель эксперта' },
    { id: 'methodDemo', label: 'Конкретная демонстрация метода' },
    { id: 'usefulConclusion', label: 'Мини-вывод после полезной части' },
    { id: 'articleLimits', label: 'Почему одной статьи может быть мало' },
    { id: 'nextStepBridge', label: 'Переход к следующему шагу' },
    { id: 'nextStepSale', label: 'Продажа следующего шага' },
    { id: 'firstCta', label: 'Первый CTA' },
    { id: 'objections', label: 'Отработка возражений' },
    { id: 'extraFormat', label: 'Дополнительный формат, если есть' },
    { id: 'urgency', label: 'Срочность / причина действовать сейчас' },
    { id: 'finalSummary', label: 'Финальное резюме' },
    { id: 'finalPs', label: 'Финальный P.S.' },
    { id: 'finalCta', label: 'Финальный CTA' },
  ],
  'video-lesson': [
    { id: 'concept', label: 'Тема и обещание' },
    { id: 'hook', label: 'Хук первых 30 секунд' },
    { id: 'script', label: 'Сценарий урока' },
    { id: 'practice', label: 'Практика и пример' },
    { id: 'cta', label: 'CTA и воронка' },
  ],
  'pdf-guide': [
    { id: 'concept', label: 'Тема и обещание' },
    { id: 'structure', label: 'Структура гайда' },
    { id: 'content', label: 'Содержание гайда' },
    { id: 'checklist', label: 'Чек-лист / упражнение' },
    { id: 'cta', label: 'CTA и воронка' },
  ],
};

function emptyStatuses(format: LeadMagnetFormat): Record<string, StepStatus> {
  return STEPS_BY_FORMAT[format].reduce<Record<string, StepStatus>>((acc, step) => {
    acc[step.id] = 'idle';
    return acc;
  }, {});
}

const EMPTY_LEAD_MAGNET: LeadMagnetState = {
  name: '',
  price: 'Бесплатно',
  format: '',
  duration: '',
  description: '',
  generated: false,
  selectedFormat: undefined,
  chatMessages: [],
  stepStatuses: {},
};

function cleanCodeFence(value: string): string {
  return value.replace(/```(?:json|markdown|md)?/gi, '').replace(/```/g, '').trim();
}

function limitText(value: string | undefined, max = 1200): string {
  const text = value?.trim() ?? '';
  if (text.length <= max) return text;
  return `${text.slice(0, max).trim()}\n...`;
}

function stripMarkdown(value: string): string {
  return value
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

function splitLeadMagnetMarkdownToMessages(markdown: string, fallbackTitle = 'Лид-магнит'): LeadMagnetChatMessage[] {
  const cleaned = cleanCodeFence(markdown);
  if (!cleaned.trim()) return [];
  const sections = cleaned
    .split(/\n(?=##?\s+)/g)
    .map((section) => section.trim())
    .filter((section) => section && !/^#\s+Лид-магнит\s*$/i.test(section));

  if (sections.length <= 1) {
    return [{ role: 'assistant', content: cleaned, stepTitle: fallbackTitle }];
  }

  return sections.map((section) => {
    const titleMatch = section.match(/^#{1,2}\s+(.+)$/m);
    return {
      role: 'assistant',
      content: section,
      stepTitle: titleMatch?.[1]?.trim() || fallbackTitle,
    };
  });
}

function buildLeadMagnetMarkdown(state: LeadMagnetState): string {
  const formatTitle = state.selectedFormat ? FORMAT_LABELS[state.selectedFormat] : 'Лид-магнит';
  if (state.description?.trim()) {
    const content = cleanCodeFence(state.description);
    return content.includes('# Лид-магнит') ? content : `# Лид-магнит\n\n${content}`;
  }

  const assistantContent = (state.chatMessages ?? [])
    .filter((message) => message.role === 'assistant')
    .map((message) => message.content.trim())
    .filter(Boolean)
    .join('\n\n');

  return [
    '# Лид-магнит',
    `## Формат\n${formatTitle}`,
    assistantContent,
  ].filter(Boolean).join('\n\n');
}

function buildLeadMagnetBrief(state: LeadMagnetState): string {
  const formatTitle = state.selectedFormat ? FORMAT_LABELS[state.selectedFormat] : 'Лид-магнит';
  const assistantBlocks = (state.chatMessages ?? [])
    .filter((message) => message.role === 'assistant')
    .map((message) => {
      const title = message.stepTitle ? `## ${message.stepTitle}` : '';
      return [title, limitText(message.content, 1400)].filter(Boolean).join('\n');
    })
    .filter(Boolean)
    .join('\n\n');

  return [
    '# Лид-магнит',
    `## Формат\n${formatTitle}`,
    assistantBlocks,
  ].filter(Boolean).join('\n\n');
}

function extractName(markdown: string, fallback: string): string {
  const cleaned = stripMarkdown(markdown);
  const heading = cleaned
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line && !/^лид-магнит$/i.test(line) && !/^формат$/i.test(line));
  return heading?.replace(/^\d+[\.\)]\s*/, '').split('—')[0]?.trim().slice(0, 90) || fallback;
}

function getRequestErrorMessage(err: unknown): string {
  const error = err as AxiosError<{ error?: string }>;
  return error.response?.data?.error || (err instanceof Error ? err.message : 'Ошибка AI-сервиса');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function markdownToPdfHtml(markdown: string): string {
  return markdown
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return '<div style="height: 10px"></div>';
      if (trimmed.startsWith('# ')) return `<h1>${escapeHtml(trimmed.slice(2))}</h1>`;
      if (trimmed.startsWith('## ')) return `<h2>${escapeHtml(trimmed.slice(3))}</h2>`;
      if (trimmed.startsWith('### ')) return `<h3>${escapeHtml(trimmed.slice(4))}</h3>`;
      if (/^\|.*\|$/.test(trimmed)) return `<p class="table-line">${escapeHtml(trimmed)}</p>`;
      if (/^\d+\.\s+/.test(trimmed) || /^[-•]\s+/.test(trimmed)) return `<p class="bullet">${escapeHtml(trimmed)}</p>`;
      return `<p>${escapeHtml(trimmed)}</p>`;
    })
    .join('');
}

async function downloadLeadMagnetPdf(state: LeadMagnetState, projectName: string): Promise<void> {
  const markdown = buildLeadMagnetMarkdown(state);
  const safeFileName = (state.name || projectName || 'lead-magnet')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const root = document.createElement('div');
  root.style.position = 'absolute';
  root.style.left = '0';
  root.style.top = '0';
  root.style.zIndex = '-1';
  root.innerHTML = `
    <style>
      .lead-pdf {
        width: 794px;
        min-height: 1123px;
        box-sizing: border-box;
        padding: 44px 52px;
        background: #ffffff;
        color: #1a1a1a;
        font-family: Inter, Arial, sans-serif;
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 34px;
        color: #1a1a1a;
        font-weight: 900;
        font-size: 18px;
      }
      .mark {
        width: 30px;
        height: 30px;
        border-radius: 8px;
        background: #1a1a1a;
        color: #D4A847;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      h1 { font-size: 34px; line-height: 1.15; margin: 0 0 22px; }
      h2 {
        margin: 26px 0 10px;
        padding-top: 14px;
        border-top: 1px solid #E5E3DC;
        color: #9A6A00;
        font-size: 16px;
        text-transform: uppercase;
        letter-spacing: 1.1px;
      }
      h3 { margin: 16px 0 8px; font-size: 15px; }
      p { margin: 0 0 8px; font-size: 13px; line-height: 1.55; }
      .bullet { padding-left: 10px; }
      .table-line {
        font-family: Arial, sans-serif;
        font-size: 11px;
        color: #333;
        background: #F7F5EF;
        padding: 6px 8px;
        border-radius: 4px;
      }
      .footer {
        margin-top: 34px;
        padding-top: 14px;
        border-top: 1px solid #E5E3DC;
        color: #888;
        font-size: 11px;
        display: flex;
        justify-content: space-between;
      }
    </style>
    <div class="lead-pdf">
      <div class="brand"><div class="mark">✦</div><div><span style="color:#D4A847">Luma</span>IQ</div></div>
      ${markdownToPdfHtml(markdown)}
      <div class="footer"><span>${escapeHtml(projectName)}</span><span>lumaiq.ru</span></div>
    </div>
  `;

  document.body.appendChild(root);
  try {
    const pdfElement = root.querySelector<HTMLElement>('.lead-pdf');
    if (!pdfElement) throw new Error('Не удалось подготовить PDF');
    await (html2pdf() as {
      set: (opts: Record<string, unknown>) => {
        from: (el: HTMLElement) => { save: () => Promise<void> };
      };
    })
      .set({
        margin: 0,
        filename: `LumaIQ_${safeFileName || 'lead-magnet'}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', width: 794, windowWidth: 794 },
        jsPDF: { unit: 'pt', format: 'a4', orientation: 'portrait' },
      })
      .from(pdfElement)
      .save();
  } finally {
    document.body.removeChild(root);
  }
}

function normalizeLeadMagnet(saved?: ProductDraft): LeadMagnetState {
  const raw = (saved ?? {}) as LeadMagnetState;
  const selectedFormat = raw.selectedFormat
    ?? (raw.format?.toLowerCase().includes('видео') ? 'video-lesson' : undefined)
    ?? (raw.format?.toLowerCase().includes('pdf') ? 'pdf-guide' : undefined)
    ?? (raw.generated ? 'sales-longread' : undefined);
  const stepStatuses = selectedFormat
    ? { ...emptyStatuses(selectedFormat), ...(raw.stepStatuses ?? {}) }
    : {};
  const messages = raw.chatMessages?.length
    ? raw.chatMessages
    : raw.description?.trim()
      ? splitLeadMagnetMarkdownToMessages(raw.description)
      : [];

  if (selectedFormat && messages.length && Object.values(stepStatuses).every((status) => status === 'idle')) {
    for (const step of STEPS_BY_FORMAT[selectedFormat]) stepStatuses[step.id] = 'done';
  }

  return {
    ...EMPTY_LEAD_MAGNET,
    ...raw,
    selectedFormat,
    stepStatuses,
    chatMessages: messages,
  };
}

export default function LeadMagnet() {
  const { activeProjectId, projectName, context } = useProjectMarketingContext();
  const savedData = useGeneratedStore((s) => s.getProject(activeProjectId));
  const saveLeadMagnet = useGeneratedStore((s) => s.setLeadMagnet);
  const upsertMaterial = useMaterialsStore((s) => s.upsertMaterial);
  const completeLeadMagnet = useProgressStore((s) => s.completeLeadMagnet);

  const [state, setState] = useState<LeadMagnetState>(EMPTY_LEAD_MAGNET);
  const [loading, setLoading] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const selectedFormat = state.selectedFormat;
  const steps = useMemo(
    () => selectedFormat ? STEPS_BY_FORMAT[selectedFormat] : [],
    [selectedFormat],
  );

  useEffect(() => {
    const savedLeadMagnet = normalizeLeadMagnet(savedData.leadMagnet);
    setState(savedLeadMagnet);
    if (activeProjectId && savedLeadMagnet.generated) {
      upsertMaterial(activeProjectId, {
        ...buildProductMaterial('lead-magnet', 'Лид-магнит', savedLeadMagnet),
        summaryStatus: 'fresh',
      });
    }
  }, [activeProjectId, savedData.leadMagnet, upsertMaterial]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [state.chatMessages?.length, loading]);

  function persistState(next: LeadMagnetState, opts: { syncMaterial?: boolean } = {}) {
    const withMarkdown = { ...next, description: buildLeadMagnetMarkdown(next) };
    setState(withMarkdown);
    if (activeProjectId) {
      saveLeadMagnet(activeProjectId, withMarkdown as ProductDraft);
      if (opts.syncMaterial !== false && withMarkdown.generated) {
        upsertMaterial(activeProjectId, {
          ...buildProductMaterial('lead-magnet', 'Лид-магнит', withMarkdown as ProductDraft),
          summaryStatus: 'fresh',
        });
      }
    }
    if (withMarkdown.generated) completeLeadMagnet();
  }

  function withMessage(leadMagnet: LeadMagnetState, message: LeadMagnetChatMessage): LeadMagnetState {
    return { ...leadMagnet, chatMessages: [...(leadMagnet.chatMessages ?? []), message] };
  }

  async function requestLeadMagnetStep(
    stepId: string,
    current: LeadMagnetState,
    options: { stepLabel?: string; stepTask?: string; userRequest?: string } = {},
  ): Promise<string> {
    if (!activeProjectId) {
      throw new Error('Сначала выберите проект');
    }
    try {
      const resp = await aiApi.startWorkflow(`leadmagnet.${stepId}`, {
        projectId: activeProjectId,
        provider: 'chatgpt',
        inputs: {
          format: selectedFormat ? FORMAT_LABELS[selectedFormat] : 'Лид-магнит',
          stepLabel: options.stepLabel ?? stepId,
          stepTask: options.stepTask ?? `Сгенерируй блок "${options.stepLabel ?? stepId}" для выбранного формата лид-магнита.`,
          currentLeadMagnet: buildLeadMagnetBrief(current),
          userRequest: options.userRequest ?? '',
        },
      });
      return cleanCodeFence(resp.content);
    } catch (err) {
      throw new Error(getRequestErrorMessage(err));
    }
  }

  function basePrompt(format: LeadMagnetFormat) {
    return `Ты продуктовый маркетолог, эксперт по воронкам, прямому копирайтингу и экспертным лид-магнитам.

Формат лид-магнита: ${FORMAT_LABELS[format]}.

Контекст проекта:
${limitText(context || 'Контекст пока не заполнен.', 6200)}

Общие правила:
- Используй только данные проекта. Не выдумывай факты об эксперте, опыте, кейсах, цене, формате или аудитории.
- Если данных не хватает, пиши мягче и универсальнее, без неподтвержденных утверждений.
- Лид-магнит должен вести к следующему логичному шагу воронки: диагностика, консультация, встреча, мини-продукт, практикум или заявка.
- Даже бесплатный следующий шаг продавай как ценный отдельный продукт.
- Пиши на русском, обращайся на "вы".
- Стиль: теплый, экспертный, конкретный, без обвинения клиента и без агрессивного инфобизнеса.
- Не подставляй психологию или другую нишу, если её нет в контексте.`;
  }

  function salesLongreadPrompt(step: LeadMagnetStep, currentMarkdown: string) {
    const base = `${basePrompt('sales-longread')}

Ты пишешь продающий экспертный лонгрид.
Цепочка лонгрида: узнавание боли -> снятие вины -> истинная причина -> доверие к эксперту -> метод -> примеры -> следующий шаг -> возражения -> CTA.

Текущая версия:
${currentMarkdown || 'Пока пусто.'}`;

    switch (step.id) {
      case 'headline':
        return `${base}

Проработай только пункт 1: заголовок.
Верни markdown строго по структуре:

## Заголовок
Дай 5 вариантов заголовка. Заголовки должны попадать в боль, запрос, результат, страх или возражение. Не обещай невозможного.

## Лучший вариант
Выбери один заголовок и коротко объясни, почему он сильнее остальных.`;
      case 'subheadline':
        return `${base}

Проработай только пункт 2: подзаголовок.
Верни markdown строго по структуре:

## Подзаголовок
Уточни, для кого статья, в какой ситуации читатель, что он поймет и какой безопасный результат получит после чтения.`;
      case 'leadText':
        return `${base}

Проработай только пункт 3: короткий лид-текст.
Верни markdown строго по структуре:

## Короткий лид-текст
200-350 слов: проблема, core job клиента, внутренний конфликт, почему старые попытки могли не сработать, что будет фокусом статьи.`;
      case 'articleMap':
        return `${base}

Проработай только пункт 4: что разберём в статье.
Верни markdown строго по структуре:

## Что разберём в статье
Буллеты через задачи клиента: понять, разобраться, увидеть, найти, выбрать.`;
      case 'expertIntro':
        return `${base}

Проработай только пункт 5: представление эксперта.
Верни markdown строго по структуре:

## Представление эксперта
Ранний блок доверия. Не сухая биография: каждый факт должен отвечать, почему эксперту можно доверять именно в этой проблеме.`;
      case 'misunderstanding':
        return `${base}

Проработай только пункт 6: главная ошибка в понимании проблемы.
Верни markdown строго по структуре:

## Главная ошибка в понимании проблемы
Покажи поверхностное объяснение клиента и подготовь почву для экспертного разворота.`;
      case 'problemCause':
        return `${base}

Проработай только пункт 7: почему проблема возникла.
Верни markdown строго по структуре:

## Почему проблема возникла
Объясни механизм проблемы простым языком. Покажи, что причина глубже поверхностного объяснения, но не обвиняй клиента.`;
      case 'triedSolutions':
        return `${base}

Проработай только пункт 8: какие старые решения клиент уже пробовал.
Верни markdown строго по структуре:

## Какие старые решения клиент уже пробовал
Перечисли 4-6 решений или попыток. Для каждого покажи, почему человек обычно пробует именно это. Снимай вину.`;
      case 'failedSolutions':
        return `${base}

Проработай только пункт 9: почему старые решения не работают.
Верни markdown строго по структуре:

## Почему старые способы не работают
Возьми старые решения из предыдущего блока и объясни, почему они могут давать обратный эффект или не доводить до результата.

Важно: снимай вину. Пиши, что человек действует из нормального желания помочь, защитить, разобраться или получить результат.`;
      case 'bigShift':
        return `${base}

Проработай только пункт 10: главный смысловой разворот.
Верни markdown строго по структуре:

## Главный смысловой разворот
Одна сильная мысль по формуле: "Задача не в том, чтобы..., а в том, чтобы...".`;
      case 'methodModel':
        return `${base}

Проработай только пункт 11: метод / модель эксперта.
Верни markdown строго по структуре:

## Метод / модель эксперта
3-5 опор. Для каждой: название, простое объяснение, почему важно, что обычно делают не так, что делать иначе, какой результат дает.`;
      case 'methodDemo':
        return `${base}

Проработай только пункт 12: конкретная демонстрация метода.
Верни markdown строго по структуре:

## Конкретная демонстрация
Добавь таблицу:
| Ситуация | Как обычно | Почему не работает | Как иначе |
Используй жизненные фразы из контекста проекта.`;
      case 'usefulConclusion':
        return `${base}

Проработай только пункт 13: мини-вывод после полезной части.
Верни markdown строго по структуре:

## Мини-вывод после полезной части
Коротко собери смысл: что читатель уже понял, какой новый взгляд получил, какой первый шаг становится логичным.`;
      case 'articleLimits':
        return `${base}

Проработай только пункт 14: почему одной статьи может быть мало.
Верни markdown строго по структуре:

## Почему одной статьи может быть мало
Покажи, что статья дает карту, но нюансы конкретной ситуации лучше разобрать на следующем шаге. Не дави и не обесценивай самостоятельность читателя.`;
      case 'nextStepBridge':
        return `${base}

Проработай только пункт 15: переход к следующему шагу.
Верни markdown строго по структуре:

## Переход к следующему шагу
Мягко свяжи полезную часть статьи со следующим шагом воронки. Следующий шаг должен ощущаться логичным, безопасным и ценным.`;
      case 'nextStepSale':
        return `${base}

Проработай только пункт 16: продажа следующего шага.
Верни markdown строго по структуре:

## Продажа следующего шага
Сделай следующий шаг отдельным оффером: заголовок, подзаголовок, что это, для кого, зачем прийти, что будет внутри, что человек получит, кому подойдет, почему это безопасный первый шаг, CTA.`;
      case 'firstCta':
        return `${base}

Проработай только пункт 17: первый CTA.
Верни markdown строго по структуре:

## Первый CTA
Сформулируй конкретный призыв к действию: что нажать/заполнить/написать, что произойдет дальше и какой результат человек получит на следующем шаге.`;
      case 'objections':
        return `${base}

Проработай только пункт 18: отработка возражений.
Верни markdown строго по структуре:

## Отработка возражений
Разбери основные возражения из контекста. Каждое возражение отдельным мини-блоком: признать, объяснить, снизить риск, показать действие, повторить CTA.`;
      case 'extraFormat':
        return `${base}

Проработай только пункт 19: дополнительный формат, если есть.
Верни markdown строго по структуре:

## Дополнительный формат, если есть
Если в контексте есть второй формат помощи, объясни его как дополнительный уровень, а не конкурент основному CTA. Если данных нет, мягко напиши универсальный блок без выдумывания конкретного формата.`;
      case 'urgency':
        return `${base}

Проработай только пункт 20: срочность / причина действовать сейчас.
Верни markdown строго по структуре:

## Срочность / причина действовать сейчас
Покажи, почему откладывание сохраняет старый сценарий. Без давления, дедлайнов и манипуляций, если их нет в контексте.`;
      case 'finalSummary':
        return `${base}

Проработай только пункт 21: финальное резюме.
Верни markdown строго по структуре:

## Финальное резюме
Коротко собери главную мысль статьи, новый взгляд, ценность метода и логичность следующего шага.`;
      case 'finalPs':
        return `${base}

Проработай только пункт 22: финальный P.S.
Верни markdown строго по структуре:

## Финальный P.S.
Повтори главный выбор: продолжать старый способ или сделать безопасный следующий шаг. Заверши CTA.`;
      case 'finalCta':
        return `${base}

Проработай только пункт 23: финальный CTA.
Верни markdown строго по структуре:

## Финальный CTA
Дай финальный конкретный призыв к действию. Формула: чтобы получить/понять/разобрать [результат], нажмите/заполните/напишите [действие], и дальше произойдет [что именно].`;
      default:
        return base;
    }
  }

  function videoLessonPrompt(step: LeadMagnetStep, currentMarkdown: string) {
    const base = `${basePrompt('video-lesson')}

Ты создаешь сценарий видеоурока-лидмагнита. Видео должно дать пользу и привести к следующему шагу воронки.

Текущая версия:
${currentMarkdown || 'Пока пусто.'}`;

    switch (step.id) {
      case 'concept':
        return `${base}

Верни markdown:
## Тема видеоурока
3 варианта темы.

## Лучший вариант
Выбери лучший и объясни почему.

## Обещание урока
Что человек поймет или сможет сделать после просмотра.

## Для кого
Кому нужен урок и в какой ситуации.`;
      case 'hook':
        return `${base}

Верни markdown:
## Хук первых 30 секунд
Готовый текст вступления.

## Узнавание боли
Какие симптомы и мысли зрителя нужно назвать.

## Почему человек досмотрит
Какое напряжение/обещание удерживает внимание.`;
      case 'script':
        return `${base}

Верни markdown:
## Сценарий видеоурока
Структура на 10-20 минут: блоки, тезисы, переходы.

## Главная ошибка
Что аудитория делает сейчас и почему это не работает.

## Новый подход
Какой разворот дает эксперт.`;
      case 'practice':
        return `${base}

Верни markdown:
## Мини-практика
Простое упражнение или диагностика внутри урока.

## Пример
Жизненный пример из контекста проекта без выдуманных кейсов.

## Первый результат
Что зритель может понять или сделать сразу.`;
      case 'cta':
        return `${base}

Верни markdown:
## CTA на следующий шаг
Продай следующий шаг как ценность: что это, зачем идти, что человек получит, почему это безопасно.

## Воронка после урока
Где размещать урок, что отправить сразу после, какие 2-3 сообщения нужны дальше.`;
      default:
        return base;
    }
  }

  function pdfGuidePrompt(step: LeadMagnetStep, currentMarkdown: string) {
    const base = `${basePrompt('pdf-guide')}

Ты создаешь PDF-гайд-лидмагнит. Он должен быть коротким, полезным, практичным и вести к следующему шагу.

Текущая версия:
${currentMarkdown || 'Пока пусто.'}`;

    switch (step.id) {
      case 'concept':
        return `${base}

Верни markdown:
## Тема PDF-гайда
3 варианта.

## Лучший вариант
Выбери лучший и объясни почему.

## Обещание гайда
Что человек поймет или сможет сделать после изучения.

## Для кого
Кому нужен гайд и в какой ситуации.`;
      case 'structure':
        return `${base}

Верни markdown:
## Структура PDF-гайда
5-7 коротких разделов.

## Логика прохождения
Как читатель движется от проблемы к первому шагу.

## Что не включать
Что лучше оставить для следующего шага, чтобы гайд не превратился в перегруженную книгу.`;
      case 'content':
        return `${base}

Верни markdown:
## Содержание гайда
Напиши основной текст по разделам. Без воды, с конкретными объяснениями, примерами и языком аудитории.

## Главный инсайт
Сформулируй смысловой разворот, который должен остаться у читателя.`;
      case 'checklist':
        return `${base}

Верни markdown:
## Чек-лист / упражнение
Дай практический блок, который человек может заполнить или пройти.

## Первый шаг
Что сделать после заполнения, чтобы приблизиться к результату.`;
      case 'cta':
        return `${base}

Верни markdown:
## CTA на следующий шаг
Продай следующий шаг как ценность: что это, зачем идти, что человек получит, почему это безопасно.

## Воронка после скачивания
Где человек получает гайд, что отправить сразу после, какие 2-3 сообщения нужны дальше.`;
      default:
        return base;
    }
  }

  function buildStepPrompt(format: LeadMagnetFormat, step: LeadMagnetStep, current: LeadMagnetState): string {
    const markdown = buildLeadMagnetBrief(current);
    if (format === 'sales-longread') return salesLongreadPrompt(step, markdown);
    if (format === 'video-lesson') return videoLessonPrompt(step, markdown);
    return pdfGuidePrompt(step, markdown);
  }
  void buildStepPrompt;

  function selectFormat(format: LeadMagnetFormat) {
    const next: LeadMagnetState = {
      ...EMPTY_LEAD_MAGNET,
      selectedFormat: format,
      format: FORMAT_LABELS[format],
      price: 'Бесплатно',
      duration: format === 'sales-longread'
        ? '10–20 минут чтения'
        : format === 'video-lesson'
          ? '10–20 минут просмотра'
          : '5–15 минут изучения',
      generated: false,
      stepStatuses: emptyStatuses(format),
    };
    persistState(next, { syncMaterial: false });
  }

  function resetFormatChoice() {
    persistState({ ...EMPTY_LEAD_MAGNET }, { syncMaterial: false });
  }

  async function handleCreate() {
    if (!selectedFormat || loading) return;
    setLoading(true);
    let next: LeadMagnetState = {
      ...state,
      generated: true,
      description: '',
      chatMessages: [],
      stepStatuses: emptyStatuses(selectedFormat),
    };
    persistState(next, { syncMaterial: false });

    try {
      for (const step of STEPS_BY_FORMAT[selectedFormat]) {
        next = {
          ...next,
          stepStatuses: { ...(next.stepStatuses ?? {}), [step.id]: 'running' },
        };
        persistState(next, { syncMaterial: false });

        const content = await requestLeadMagnetStep(step.id, next, {
          stepLabel: step.label,
          stepTask: `Сгенерируй блок "${step.label}" для формата "${FORMAT_LABELS[selectedFormat]}". Работай только над этим шагом, сохрани логику воронки и связь с текущим черновиком.`,
        });
        next = withMessage({
          ...next,
          stepStatuses: { ...(next.stepStatuses ?? {}), [step.id]: 'done' },
        }, { role: 'assistant', content, stepId: step.id, stepTitle: step.label });
        next = {
          ...next,
          name: next.name || extractName(content, FORMAT_LABELS[selectedFormat]),
          description: [
            `# Лид-магнит`,
            `## Формат\n${FORMAT_LABELS[selectedFormat]}`,
            ...(next.chatMessages ?? []).filter((message) => message.role === 'assistant').map((message) => message.content),
          ].join('\n\n'),
        };
        persistState(next, { syncMaterial: false });
      }
      persistState(next);
      toast.success('Лид-магнит создан');
    } catch (err) {
      console.error('[LeadMagnet create] AI error:', err);
      const message = getRequestErrorMessage(err);
      persistState(withMessage(next, {
        role: 'assistant',
        content: `Не удалось продолжить создание лид-магнита: ${message}`,
        stepTitle: 'Ошибка создания',
      }), { syncMaterial: false });
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleChatSend() {
    const text = chatInput.trim();
    if (!text || loading || !selectedFormat) return;
    const userMessage: LeadMagnetChatMessage = { role: 'user', content: text };
    const stateWithUser = withMessage(state, userMessage);
    setChatInput('');
    persistState(stateWithUser, { syncMaterial: false });
    setLoading(true);

    try {
      const response = await requestLeadMagnetStep('edit', stateWithUser, {
        stepLabel: 'Редактирование лид-магнита',
        stepTask: `Выполни правку по запросу пользователя и верни цельный обновленный материал в markdown. Сохрани выбранный формат: ${FORMAT_LABELS[selectedFormat]}.`,
        userRequest: text,
      });

      const description = response.includes('# Лид-магнит') ? response : `# Лид-магнит\n\n## Формат\n${FORMAT_LABELS[selectedFormat]}\n\n${response}`;
      persistState({
        ...stateWithUser,
        generated: true,
        description,
        name: stateWithUser.name || extractName(description, FORMAT_LABELS[selectedFormat]),
        chatMessages: [
          ...(stateWithUser.chatMessages ?? []),
          ...splitLeadMagnetMarkdownToMessages(description, 'Обновленный лид-магнит').map((message) => ({
            ...message,
            stepTitle: message.stepTitle ? `Обновлено · ${message.stepTitle}` : 'Обновлено',
          })),
        ],
      });
    } catch (err) {
      console.error('[LeadMagnet chat] AI error:', err);
      persistState(withMessage(stateWithUser, {
        role: 'assistant',
        content: 'Не смог обработать правку. Попробуйте сформулировать конкретнее: какой блок изменить и какой результат нужен.',
      }), { syncMaterial: false });
    } finally {
      setLoading(false);
    }
  }

  async function handleDownload() {
    if (!state.generated || pdfLoading) return;
    setPdfLoading(true);
    try {
      await downloadLeadMagnetPdf(state, projectName);
    } catch (err) {
      console.error('[LeadMagnet PDF]', err);
      toast.error('Не удалось скачать PDF');
    } finally {
      setPdfLoading(false);
    }
  }

  const btnGold: React.CSSProperties = {
    background: loading ? '#e8d498' : '#D4A847',
    color: '#fff',
    border: 'none',
    borderRadius: 8,
    padding: '10px 16px',
    fontSize: 13,
    cursor: loading ? 'not-allowed' : 'pointer',
    fontWeight: 700,
  };

  const btnOutlined: React.CSSProperties = {
    background: '#fff',
    border: '1px solid #E5E3DC',
    color: '#555',
    borderRadius: 8,
    padding: '10px 16px',
    fontSize: 13,
    cursor: 'pointer',
    fontWeight: 700,
  };

  if (!selectedFormat) {
    return (
      <div style={{ background: '#fff', minHeight: '100%', padding: 4 }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, color: '#1a1a1a', marginBottom: 8, marginTop: 0 }}>
          Лид-магнит
        </h1>
        <p style={{ color: '#888', fontSize: 13, marginBottom: 24, marginTop: 0, maxWidth: 720, lineHeight: 1.55 }}>
          Выберите формат. После выбора откроется AI-чеклист с чатом, как в разделах ЦА, основного продукта и мини-продукта.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16, maxWidth: 1080 }}>
          {FORMAT_OPTIONS.map((format) => (
            <button
              key={format.id}
              onClick={() => selectFormat(format.id)}
              style={{
                textAlign: 'left',
                minHeight: 190,
                padding: 20,
                borderRadius: 12,
                border: '1px solid #E5E3DC',
                background: '#fff',
                cursor: 'pointer',
                boxShadow: '0 8px 26px rgba(0,0,0,0.04)',
              }}
            >
              <div style={{ fontSize: 30, marginBottom: 18 }}>{format.icon}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#1a1a1a', marginBottom: 8 }}>{format.title}</div>
              <div style={{ fontSize: 13, color: '#777', lineHeight: 1.55 }}>{format.description}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', backgroundColor: '#fff' }}>
      <div style={{
        width: 290,
        flexShrink: 0,
        backgroundColor: '#F5F4F0',
        borderRight: '1px solid #E5E3DC',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '24px 20px 16px' }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: '#1a1a1a', margin: '0 0 4px' }}>
            Лид-магнит
          </h2>
          <p style={{ fontSize: 12, color: '#888', margin: '0 0 12px' }}>
            {FORMAT_LABELS[selectedFormat]}
          </p>
          <button
            style={{ ...btnGold, width: '100%', display: 'flex', justifyContent: 'center', gap: 6 }}
            onClick={() => void handleCreate()}
            disabled={loading}
          >
            {loading && <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⟳</span>}
            {loading ? 'ИИ работает...' : state.generated ? 'Пересобрать лид-магнит' : 'Создать лид-магнит'}
          </button>
          <button
            style={{ ...btnOutlined, width: '100%', marginTop: 8, padding: '9px 0', fontSize: 12 }}
            onClick={() => selectFormat(selectedFormat)}
            disabled={loading}
          >
            Сбросить этот формат
          </button>
          <button
            style={{ ...btnOutlined, width: '100%', marginTop: 8, padding: '9px 0', fontSize: 12 }}
            onClick={resetFormatChoice}
            disabled={loading}
          >
            Выбрать другой формат
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 16px' }}>
          {steps.map((step, index) => {
            const status = state.stepStatuses?.[step.id] ?? 'idle';
            return (
              <div
                key={step.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 8px',
                  borderRadius: 6,
                  marginBottom: 2,
                  backgroundColor: status === 'running' ? 'rgba(212,168,71,0.1)' : 'transparent',
                }}
              >
                <span style={{ fontSize: 13, width: 18, textAlign: 'center', flexShrink: 0 }}>
                  {status === 'idle' && <span style={{ color: '#ccc' }}>○</span>}
                  {status === 'running' && <span style={{ color: '#D4A847', display: 'inline-block', animation: 'spin 1s linear infinite' }}>⟳</span>}
                  {status === 'done' && <span>✅</span>}
                </span>
                <span style={{
                  fontSize: 12,
                  color: status === 'idle' ? '#aaa' : '#1a1a1a',
                  fontWeight: status === 'running' ? 500 : 400,
                  flex: 1,
                }}>
                  {index + 1}. {step.label}
                </span>
              </div>
            );
          })}
        </div>

        {state.generated && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid #E5E3DC', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              onClick={() => void handleDownload()}
              disabled={pdfLoading}
              style={{
                ...btnOutlined,
                width: '100%',
                padding: '9px 0',
                fontSize: 12,
                color: pdfLoading ? '#bbb' : '#555',
              }}
            >
              {pdfLoading ? 'Генерирую PDF...' : 'Скачать PDF'}
            </button>
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{
          padding: '20px 28px 16px',
          borderBottom: '1px solid #F0EEE8',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div>
            <h2 style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a', margin: 0 }}>
              Разработка лид-магнита
            </h2>
            <p style={{ fontSize: 12, color: '#888', margin: '2px 0 0' }}>
              {projectName} · {FORMAT_LABELS[selectedFormat]} · следующий шаг воронки
            </p>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', minHeight: 0 }}>
          {!state.chatMessages?.length ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: 320,
              gap: 16,
              textAlign: 'center',
              maxWidth: 900,
              margin: '0 auto',
            }}>
              <div style={{
                width: 64,
                height: 64,
                borderRadius: 16,
                backgroundColor: '#F5F4F0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 28,
              }}>🎁</div>
              <p style={{ fontSize: 14, color: '#888', maxWidth: 430, lineHeight: 1.6 }}>
                Нажмите «Создать лид-магнит» — ИИ пройдёт чек-лист и будет выдавать материал отдельными сообщениями.
              </p>
            </div>
          ) : (
            <div style={{ maxWidth: 920, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
              {state.chatMessages?.map((message, index) => (
                <div
                  key={index}
                  style={{
                    display: 'flex',
                    flexDirection: message.role === 'user' ? 'row-reverse' : 'row',
                    gap: 10,
                    alignItems: 'flex-end',
                  }}
                >
                  {message.role === 'assistant' && (
                    <div style={{
                      width: 34,
                      height: 34,
                      borderRadius: '50%',
                      flexShrink: 0,
                      background: '#D4A847',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 10,
                      fontWeight: 800,
                      color: '#fff',
                    }}>AI</div>
                  )}
                  <div style={{
                    maxWidth: message.role === 'assistant' ? 'min(800px, 82%)' : 'min(680px, 72%)',
                    padding: '12px 16px',
                    borderRadius: message.role === 'user' ? '12px 12px 0 12px' : '12px 12px 12px 0',
                    background: message.role === 'user' ? '#1a1a1a' : '#F5F4F0',
                    color: message.role === 'user' ? '#fff' : '#1a1a1a',
                    fontSize: 14,
                    lineHeight: 1.6,
                  }}>
                    <div style={{
                      fontSize: 10,
                      color: message.role === 'user' ? 'rgba(255,255,255,0.55)' : '#888',
                      marginBottom: 6,
                      textTransform: 'uppercase',
                      letterSpacing: 1.2,
                    }}>
                      {message.role === 'user' ? 'Вы' : 'AI'}{message.stepTitle ? ` · ${message.stepTitle}` : ''}
                    </div>
                    {message.role === 'assistant'
                      ? <FormattedText compact>{message.content}</FormattedText>
                      : <div style={{ whiteSpace: 'pre-wrap' }}>{message.content}</div>}
                  </div>
                </div>
              ))}

              {loading && (
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                  <div style={{
                    width: 34,
                    height: 34,
                    borderRadius: '50%',
                    flexShrink: 0,
                    background: '#D4A847',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 10,
                    fontWeight: 800,
                    color: '#fff',
                  }}>AI</div>
                  <div style={{
                    display: 'flex',
                    gap: 5,
                    padding: '14px 18px',
                    borderRadius: '12px 12px 12px 0',
                    background: '#F5F4F0',
                  }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#D4A847', animation: 'pulse 1.2s ease-in-out infinite' }} />
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#D4A847', animation: 'pulse 1.2s ease-in-out infinite 0.2s' }} />
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#D4A847', animation: 'pulse 1.2s ease-in-out infinite 0.4s' }} />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          )}
        </div>

        <div style={{
          flexShrink: 0,
          borderTop: '1px solid #E5E3DC',
          background: '#fff',
          padding: '16px 28px',
        }}>
          <div style={{ maxWidth: 920, margin: '0 auto', display: 'flex', gap: 12, alignItems: 'flex-end' }}>
            <textarea
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleChatSend();
                }
              }}
              disabled={loading || !state.generated}
              placeholder={state.generated
                ? 'Напишите, что изменить: заголовок, CTA, структуру, сценарий, возражения...'
                : 'Сначала создайте лид-магнит, затем здесь можно будет редактировать его через ИИ...'}
              rows={3}
              style={{
                flex: 1,
                minHeight: 76,
                resize: 'none',
                border: '1px solid #E5E3DC',
                borderRadius: 8,
                padding: '12px 14px',
                fontSize: 14,
                lineHeight: 1.5,
                fontFamily: 'inherit',
                outline: 'none',
                background: state.generated ? '#fff' : '#F8F7F3',
              }}
            />
            <button
              onClick={() => void handleChatSend()}
              disabled={loading || !chatInput.trim() || !state.generated}
              style={{
                height: 44,
                border: 'none',
                borderRadius: 8,
                background: loading || !chatInput.trim() || !state.generated ? '#F0EEE8' : '#D4A847',
                color: loading || !chatInput.trim() || !state.generated ? '#bbb' : '#fff',
                padding: '0 18px',
                fontSize: 13,
                fontWeight: 700,
                cursor: loading || !state.generated ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Думаю...' : 'Отправить'}
            </button>
          </div>
          <div style={{ maxWidth: 920, margin: '8px auto 0', color: '#aaa', fontSize: 11, textAlign: 'right' }}>
            Enter — отправить · Shift+Enter — перенос строки
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse {
          0%, 80%, 100% { opacity: 0.35; transform: scale(0.9); }
          40% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
