import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import type { AxiosError } from 'axios';
import { useProjectMarketingContext } from '../../hooks/useProjectMarketingContext';
import { useModelStore } from '../../store/model.store';
import { useGeneratedStore, type ProductDraft } from '../../store/generated.store';
import { useMaterialsStore } from '../../store/materials.store';
import { useProgressStore } from '../../store/progress.store';
import { aiApi } from '../../api/ai';
import { buildProductMaterial } from '../../utils/projectMaterials';
import FormattedText from '../../components/FormattedText/FormattedText';
import html2pdf from 'html2pdf.js';

type StepStatus = 'idle' | 'running' | 'done';

interface ProductChatMessage {
  role: 'user' | 'assistant';
  content: string;
  stepId?: string;
  stepTitle?: string;
}

interface MiniProductState extends ProductDraft {
  nameOptions?: string[];
  offer?: string;
  productDescription?: string;
  lesson1?: string;
  lesson2?: string;
  lesson3?: string;
  bonuses?: string;
  transformation?: string;
  chatMessages?: ProductChatMessage[];
  stepStatuses?: Record<string, StepStatus>;
}

interface ProductStep {
  id:
    | 'bestName'
    | 'mainOffer'
    | 'shortDescription'
    | 'lesson1'
    | 'lesson2'
    | 'lesson3'
    | 'sevenDaySchedule'
    | 'mainResult'
    | 'fit'
    | 'bonuses'
    | 'objections'
    | 'landingBlock'
    | 'telegramPosts'
    | 'nextProductBridge';
  label: string;
}

const PRODUCT_STEPS: ProductStep[] = [
  { id: 'bestName', label: 'Лучшее название мини-продукта' },
  { id: 'mainOffer', label: 'Главный оффер' },
  { id: 'shortDescription', label: 'Краткое описание продукта' },
  { id: 'lesson1', label: '1 занятие' },
  { id: 'lesson2', label: '2 занятие' },
  { id: 'lesson3', label: '3 занятие' },
  { id: 'sevenDaySchedule', label: 'Расписание на 7 дней' },
  { id: 'mainResult', label: 'Главный результат' },
  { id: 'fit', label: 'Для кого / не для кого' },
  { id: 'bonuses', label: 'Бонусы' },
  { id: 'objections', label: 'Возражения и ответы' },
  { id: 'landingBlock', label: 'Продающий блок для лендинга' },
  { id: 'telegramPosts', label: '3 Telegram-поста' },
  { id: 'nextProductBridge', label: 'Мост к следующему продукту' },
];

const EMPTY_STATUSES = PRODUCT_STEPS.reduce<Record<string, StepStatus>>((acc, step) => {
  acc[step.id] = 'idle';
  return acc;
}, {});

const EMPTY_PRODUCT: MiniProductState = {
  name: '',
  price: '',
  format: '',
  duration: '',
  description: '',
  generated: false,
  nameOptions: [],
  offer: '',
  productDescription: '',
  lesson1: '',
  lesson2: '',
  lesson3: '',
  bonuses: '',
  transformation: '',
  chatMessages: [],
  stepStatuses: EMPTY_STATUSES,
};

function cleanCodeFence(value: string): string {
  return value.replace(/```(?:json|markdown|md)?/gi, '').replace(/```/g, '').trim();
}

function limitText(value: string | undefined, max = 1200): string {
  const text = value?.trim() ?? '';
  if (text.length <= max) return text;
  return `${text.slice(0, max).trim()}\n...`;
}

function fitAiMessage(value: string, max = 15500): string {
  if (value.length <= max) return value;
  const head = value.slice(0, Math.floor(max * 0.72)).trim();
  const tail = value.slice(-Math.floor(max * 0.2)).trim();
  return `${head}\n\n...[часть контекста сокращена, чтобы запрос прошёл лимит API]...\n\n${tail}`;
}


function splitProductMarkdownToMessages(markdown: string): ProductChatMessage[] {
  const cleaned = cleanCodeFence(markdown);
  if (!cleaned.trim()) return [];
  const sections = cleaned
    .split(/\n(?=##\s+)/g)
    .map((section) => section.trim())
    .filter((section) => section && section.replace(/^#\s+Мини-продукт\s*/i, '').trim());

  if (sections.length <= 1) {
    return [{ role: 'assistant', content: cleaned, stepTitle: 'Мини-продукт' }];
  }

  return sections.map((section) => {
    const titleMatch = section.match(/^##\s+(.+)$/m);
    const title = titleMatch?.[1]?.trim() || 'Мини-продукт';
    return { role: 'assistant', content: section, stepTitle: title };
  });
}

function normalizeProduct(saved?: ProductDraft): MiniProductState {
  const raw = (saved ?? {}) as MiniProductState;
  const savedMessages = raw.chatMessages?.length === 1 && raw.chatMessages[0]?.content.includes('# Мини-продукт')
    ? splitProductMarkdownToMessages(raw.chatMessages[0].content)
    : raw.chatMessages;
  const stepStatuses = { ...EMPTY_STATUSES, ...(raw.stepStatuses ?? {}) };

  if (raw.name || raw.offer || raw.productDescription || raw.lesson1 || raw.lesson2 || raw.lesson3 || raw.bonuses || raw.transformation || raw.description) {
    for (const step of PRODUCT_STEPS) {
      const hasValue =
        (step.id === 'bestName' && (raw.name || raw.nameOptions?.some(Boolean))) ||
        (step.id === 'mainOffer' && raw.offer) ||
        (step.id === 'shortDescription' && raw.productDescription) ||
        (step.id === 'lesson1' && raw.lesson1) ||
        (step.id === 'lesson2' && raw.lesson2) ||
        (step.id === 'lesson3' && raw.lesson3) ||
        (step.id === 'bonuses' && raw.bonuses) ||
        (step.id === 'mainResult' && raw.transformation) ||
        (raw.chatMessages ?? []).some((message) => message.stepId === step.id);
      if (hasValue && stepStatuses[step.id] === 'idle') stepStatuses[step.id] = 'done';
    }
  }

  return {
    ...EMPTY_PRODUCT,
    ...raw,
    stepStatuses,
    chatMessages: savedMessages?.length
      ? savedMessages
      : raw.description?.trim()
        ? splitProductMarkdownToMessages(raw.description)
        : [],
  };
}

function buildMiniProductMarkdown(product: MiniProductState): string {
  const assistantContent = (product.chatMessages ?? [])
    .filter((message) => message.role === 'assistant' && !message.stepTitle?.toLowerCase().includes('ошибка'))
    .map((message) => message.content.trim())
    .filter(Boolean)
    .join('\n\n');

  if (assistantContent) {
    return ['# Мини-продукт', assistantContent].join('\n\n');
  }

  const hasStructuredData = Boolean(
    product.nameOptions?.some(Boolean) ||
    product.offer ||
    product.productDescription ||
    product.lesson1 ||
    product.lesson2 ||
    product.lesson3 ||
    product.bonuses ||
    product.transformation,
  );

  if (!hasStructuredData && product.description?.trim() && product.description.includes('# Мини-продукт')) {
    return product.description.trim();
  }

  return [
    '# Мини-продукт',
    product.nameOptions?.filter(Boolean).length
      ? `## Варианты названия\n${product.nameOptions.filter(Boolean).map((name, index) => `${index + 1}. ${name}`).join('\n')}`
      : product.name ? `## Название\n${product.name}` : '',
    product.offer ? `## Оффер\n${product.offer}` : '',
    product.productDescription ? `## Описание мини-продукта\n${product.productDescription}` : '',
    product.lesson1 ? `## Занятие 1\n${product.lesson1}` : '',
    product.lesson2 ? `## Занятие 2\n${product.lesson2}` : '',
    product.lesson3 ? `## Занятие 3\n${product.lesson3}` : '',
    product.bonuses ? `## Бонусы\n${product.bonuses}` : '',
    product.transformation ? `## Продуктовое обещание\n${product.transformation}` : '',
  ].filter(Boolean).join('\n\n');
}

function buildMiniProductBrief(product: MiniProductState): string {
  const assistantBlocks = (product.chatMessages ?? [])
    .filter((message) => message.role === 'assistant' && !message.stepTitle?.toLowerCase().includes('ошибка'))
    .map((message) => {
      const title = message.stepTitle ? `## ${message.stepTitle}` : '';
      return [title, limitText(message.content, 1100)].filter(Boolean).join('\n');
    })
    .filter(Boolean)
    .join('\n\n');

  if (assistantBlocks) {
    return ['# Мини-продукт', assistantBlocks].join('\n\n');
  }

  return [
    '# Мини-продукт',
    product.nameOptions?.filter(Boolean).length
      ? `## Варианты названия\n${product.nameOptions.filter(Boolean).map((name, index) => `${index + 1}. ${limitText(name, 240)}`).join('\n')}`
      : product.name ? `## Название\n${limitText(product.name, 240)}` : '',
    product.offer ? `## Оффер\n${limitText(product.offer, 1200)}` : '',
    product.productDescription ? `## Описание мини-продукта\n${limitText(product.productDescription, 1200)}` : '',
    product.lesson1 ? `## Занятие 1\n${limitText(product.lesson1, 1400)}` : '',
    product.lesson2 ? `## Занятие 2\n${limitText(product.lesson2, 1400)}` : '',
    product.lesson3 ? `## Занятие 3\n${limitText(product.lesson3, 1400)}` : '',
    product.bonuses ? `## Бонусы\n${limitText(product.bonuses, 1200)}` : '',
    product.transformation ? `## Продуктовое обещание\n${limitText(product.transformation, 500)}` : '',
  ].filter(Boolean).join('\n\n');
}

function stripMarkdown(value: string): string {
  return value
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

function extractMarkdownSection(markdown: string, titlePattern: RegExp): string {
  const lines = markdown.split('\n');
  const start = lines.findIndex((line) => titlePattern.test(line.trim()));
  if (start === -1) return '';
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => /^##\s+/.test(line.trim()));
  return (end === -1 ? rest : rest.slice(0, end)).join('\n').trim();
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
      if (/^\d+\.\s+/.test(trimmed) || /^[-•]\s+/.test(trimmed)) return `<p class="bullet">${escapeHtml(trimmed)}</p>`;
      return `<p>${escapeHtml(trimmed)}</p>`;
    })
    .join('');
}

async function downloadProductPresentationPdf(product: MiniProductState, projectName: string): Promise<void> {
  const markdown = buildMiniProductMarkdown(product);
  const safeFileName = (product.name || projectName || 'product-mini')
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
      .product-pdf {
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
      p { margin: 0 0 8px; font-size: 14px; line-height: 1.55; }
      .bullet { padding-left: 10px; }
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
    <div class="product-pdf">
      <div class="brand"><div class="mark">✦</div><div><span style="color:#D4A847">Luma</span>IQ</div></div>
      ${markdownToPdfHtml(markdown)}
      <div class="footer"><span>${escapeHtml(projectName)}</span><span>lumaiq.ru</span></div>
    </div>
  `;

  document.body.appendChild(root);
  try {
    const pdfElement = root.querySelector<HTMLElement>('.product-pdf');
    if (!pdfElement) throw new Error('Не удалось подготовить PDF');
    await (html2pdf() as {
      set: (opts: Record<string, unknown>) => {
        from: (el: HTMLElement) => { save: () => Promise<void> };
      };
    })
      .set({
        margin: 0,
        filename: `LumaIQ_${safeFileName || 'product-mini'}.pdf`,
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

export default function ProductMini() {
  const { activeProjectId, projectName, context, mergedProfile } = useProjectMarketingContext();
  const getSettings = useModelStore((s) => s.getSettings);
  const savedData = useGeneratedStore((s) => s.getProject(activeProjectId));
  const saveProductMini = useGeneratedStore((s) => s.setProductMini);
  const upsertMaterial = useMaterialsStore((s) => s.upsertMaterial);
  const completeProductMini = useProgressStore((s) => s.completeProductMini);

  const [state, setState] = useState<MiniProductState>(EMPTY_PRODUCT);
  const [loading, setLoading] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const savedProduct = normalizeProduct(savedData.productMini);
    setState(savedProduct);
    if (activeProjectId && savedProduct.generated) {
      upsertMaterial(activeProjectId, {
        ...buildProductMaterial('product-mini', 'Мини-продукт', savedProduct),
        summaryStatus: 'fresh',
      });
    }
  }, [activeProjectId, savedData.productMini, upsertMaterial]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [state.chatMessages?.length, loading]);

  function persistState(next: MiniProductState, opts: { syncMaterial?: boolean } = {}) {
    const withMarkdown = { ...next, description: buildMiniProductMarkdown(next) };
    setState(withMarkdown);
    if (activeProjectId) {
      saveProductMini(activeProjectId, withMarkdown as ProductDraft);
      if (opts.syncMaterial !== false && withMarkdown.generated) {
        upsertMaterial(activeProjectId, {
          ...buildProductMaterial('product-mini', 'Мини-продукт', withMarkdown as ProductDraft),
          summaryStatus: 'fresh',
        });
      }
    }
    if (withMarkdown.generated) completeProductMini();
  }

  function withMessage(product: MiniProductState, message: ProductChatMessage): MiniProductState {
    return { ...product, chatMessages: [...(product.chatMessages ?? []), message] };
  }

  async function requestAi(message: string, maxTokens = 2200): Promise<string> {
    const settings = getSettings('product-mini');
    try {
      const resp = await aiApi.chat({
        model: settings.provider === 'claude' ? 'claude' : 'chatgpt',
        claudeModel: settings.claudeModel,
        section: 'product-mini',
        message: fitAiMessage(message),
        conversationHistory: [],
        projectName,
        unpackingProfile: mergedProfile as Record<string, string>,
        maxTokens,
      });
      return cleanCodeFence(resp.content);
    } catch (err) {
      throw new Error(getRequestErrorMessage(err));
    }
  }

  function basePrompt() {
    return `Ты продуктовый методолог, маркетолог-стратег и эксперт по упаковке мини-продуктов для экспертного бизнеса, психологии, образования и консалтинга.

Твоя задача — на основе данных проекта разработать мини-продукт на 1 неделю из 3 занятий.

Контекст проекта:
${limitText(context || 'Контекст пока не заполнен.', 6200)}

Роли:
- Когда оцениваешь спрос, оффер, структуру занятий и бонусы — ты продуктовый маркетолог.
- Когда нужно понять экспертную логику — подключай роль самого пользователя: эксперт с 25-летним опытом, большой клиентской базой и практическим пониманием клиентов.

Правила:
- Мини-продукт длится 7 дней и состоит ровно из 3 занятий.
- Между занятиями должны быть практические задания.
- Продукт должен решать узкую и острую задачу конкретного сегмента.
- Мини-продукт продаёт первый управляемый результат, а не полное решение большой системной проблемы.
- Каждый блок должен давать конкретику: действия, упражнения, шаблоны, фразы, разборы, артефакты.
- У каждого занятия должен быть выход: карта, список, фразы, алгоритм, упражнение, сценарий, план, договорённость, чек-лист или стратегия.
- Не делай флагман, длинную программу или 10 модулей.
- Не обещай невозможного и не придумывай неподтверждённые факты об эксперте, кейсах, регалиях, результатах и опыте.
- Не подставляй психологию или другую нишу, если её нет в контексте.
- Пиши конкретно, как рабочий черновик для эксперта.
- Отвечай только на русском языке.`;
  }

  function buildStepPrompt(step: ProductStep, current: MiniProductState) {
    const currentProduct = buildMiniProductBrief(current);
    switch (step.id) {
      case 'bestName':
        return `${basePrompt()}

Проработай только пункт 1: лучшее название мини-продукта.

Перед разработкой учти: целевая аудитория, выбранный сегмент, главная боль, главный запрос, core job клиента, что человек уже пробовал, первый быстрый результат и следующий шаг воронки.

Верни markdown строго по структуре:

## Лучшее название мини-продукта
Дай 10 вариантов названия.

Название должно быть конкретным, связанным с болью и желаемым первым результатом, без пустого инфобизнеса.

## Рекомендуемый вариант
Выбери лучший вариант и объясни, почему он сильнее остальных.`;
      case 'mainOffer':
        return `${basePrompt()}

Уже есть:
${currentProduct}

Проработай только пункт 2: главный оффер.
Верни markdown строго по структуре:

## Главный оффер
Сформулируй 5 вариантов оффера.

Оффер должен отвечать: для кого продукт, какую проблему решает, какой первый результат даёт за 7 дней, без какого старого болезненного способа.

Формула: "За 7 дней на 3 практических занятиях вы [получите конкретный первый результат], чтобы [желаемое состояние/выгода], без [старый болезненный способ]."

## Рекомендуемый оффер
Выбери один лучший вариант.`;
      case 'shortDescription':
        return `${basePrompt()}

Уже есть:
${currentProduct}

Проработай только пункт 3: краткое описание продукта.
Верни markdown строго по структуре:

## Краткое описание продукта
Опиши мини-продукт в 2-4 коротких абзацах: для кого, какая узкая задача, почему это можно проработать за 7 дней, какой первый управляемый результат участник получит.

## Важная граница результата
Отдельно сформулируй, что мини-продукт не обещает полного решения большой проблемы, а даёт первый управляемый сдвиг.`;
      case 'lesson1':
      case 'lesson2':
      case 'lesson3': {
        const number = step.id.replace('lesson', '');
        return `${basePrompt()}

Уже есть:
${currentProduct}

Проработай только пункт ${Number(number) + 3}: ${number} занятие.

Логика 3 занятий:
- занятие 1 — диагностика и разворот мышления;
- занятие 2 — новый инструмент/метод и практика;
- занятие 3 — сборка системы, закрепление и следующий шаг.

Если для проекта лучше подходит другая логика, адаптируй, но занятия должны быть одной цепочкой.

Верни markdown строго по структуре:

## Занятие ${number}. [Название]

**Главная задача:**  
...

**Почему это важно:**  
...

**Что разберём:**  
- ...
- ...
- ...

**Практика на занятии:**  
...

**Домашнее задание:**  
...

**Артефакт:**  
...

**Результат после занятия:**  
...

**Переход к следующему шагу:**  
...`;
      }
      case 'sevenDaySchedule':
        return `${basePrompt()}

Уже есть:
${currentProduct}

Проработай только пункт 7: расписание на 7 дней.
Верни markdown строго по структуре:

## Расписание на 7 дней
Для каждого дня укажи:
- задача дня;
- что сделать;
- сколько времени займёт;
- что получится на выходе.

Логика:
День 1 — занятие 1.
День 2 — задание/наблюдение/упражнение.
День 3 — занятие 2.
День 4 — внедрение.
День 5 — задание/мини-эксперимент.
День 6 — занятие 3.
День 7 — закрепление/рефлексия/план следующего шага.`;
      case 'mainResult':
        return `${basePrompt()}

Уже есть:
${currentProduct}

Проработай только пункт 8: главный результат.
Верни markdown строго по структуре:

## Главный результат
Сформулируй реалистичный первый результат мини-продукта.

Формула: "За 7 дней вы не решите всю проблему целиком, но получите [конкретный первый результат], чтобы перестать [текущая боль] и начать [желательное направление]."

## Продуктовое обещание
Одна главная фраза: "К концу недели у вас будет [конкретный артефакт/навык/план/понимание], который поможет [первое изменение в жизни клиента]."

## Быстрые победы
5-7 быстрых побед, которые человек может получить в процессе.`;
      case 'fit':
        return `${basePrompt()}

Уже есть:
${currentProduct}

Проработай только пункт 9: для кого / не для кого.
Верни markdown строго по структуре:

## Для кого мини-продукт
Минимум 8-12 буллетов через реальные ситуации клиента. Начинай смыслом "Этот мини-продукт для вас, если..."

## Кому мини-продукт не подойдёт
Минимум 5-7 буллетов. Это должно повышать доверие и задавать честные границы.`;
      case 'bonuses':
        return `${basePrompt()}

Уже есть:
${currentProduct}

Проработай только пункт 10: бонусы.
Верни markdown строго по структуре:

## Бонусы
Предложи 3-5 бонусов. Каждый бонус должен закрывать конкретное возражение или усиливать результат.

Для каждого бонуса укажи:
- название;
- что внутри;
- какую проблему закрывает;
- почему полезен;
- какой быстрый результат даёт.

Бонусы должны быть практичными: чек-лист, фразы, шаблон, диагностика, карта ошибок, скрипт, инструкция, разбор, памятка.`;
      case 'objections':
        return `${basePrompt()}

Уже есть:
${currentProduct}

Проработай только пункт 11: возражения и ответы.
Верни markdown строго по структуре:

## Возражения и ответы
Опиши 10 ключевых возражений аудитории.

Для каждого:
1. Возражение.
2. Что за ним стоит.
3. Как его закрыть в тексте.
4. Какой элемент продукта закрывает это возражение.`;
      case 'landingBlock':
        return `${basePrompt()}

Уже есть:
${currentProduct}

Проработай только пункт 12: продающий блок для лендинга.
Верни markdown строго по структуре:

## Продающий блок для лендинга
Сформируй готовые блоки:
1. Первый экран.
2. Блок боли.
3. Блок "вы уже пробовали".
4. Блок "почему не работает".
5. Блок "что будет иначе".
6. Блок программы.
7. Блок результата.
8. Блок формата.
9. Блок эксперта.
10. Блок бонусов.
11. Блок кому подходит.
12. Блок кому не подходит.
13. Блок FAQ.
14. Финальный CTA.`;
      case 'telegramPosts':
        return `${basePrompt()}

Уже есть:
${currentProduct}

Проработай только пункт 13: 3 Telegram-поста.
Верни markdown строго по структуре:

## 3 Telegram-поста для продажи мини-продукта

### Пост 1. Через боль и узнавание
Хук, проблема, объяснение, переход к мини-продукту, CTA.

### Пост 2. Через экспертный разворот
Хук, проблема, объяснение, переход к мини-продукту, CTA.

### Пост 3. Через оффер и приглашение
Хук, проблема, объяснение, переход к мини-продукту, CTA.`;
      case 'nextProductBridge':
        return `${basePrompt()}

Уже есть:
${currentProduct}

Проработай только пункт 14: мост к следующему продукту.
Верни markdown строго по структуре:

## Мост к следующему продукту
Опиши, какой следующий шаг должен быть после мини-продукта: консультация, практикум, групповая программа, сопровождение, наставничество, терапия, диагностика, подписка, основной курс или другой формат из контекста.

Сформулируй:
- что участник уже получил;
- что он понял;
- где проявились более глубокие задачи;
- почему логично идти дальше;
- какой следующий продукт решает большую проблему.

Не обесценивай мини-продукт: он должен честно давать результат, но показывать границы.`;
      default:
        return basePrompt();
    }
  }

  async function handleCreate() {
    if (loading) return;
    setLoading(true);
    let next: MiniProductState = {
      ...EMPTY_PRODUCT,
      generated: true,
      chatMessages: [],
      stepStatuses: { ...EMPTY_STATUSES },
    };
    persistState(next, { syncMaterial: false });

    try {
      for (const step of PRODUCT_STEPS) {
        next = { ...next, stepStatuses: { ...(next.stepStatuses ?? EMPTY_STATUSES), [step.id]: 'running' } };
        persistState(next, { syncMaterial: false });

        const maxTokens = step.id === 'landingBlock' || step.id === 'telegramPosts' ? 5200 : 3600;
        const content = await requestAi(buildStepPrompt(step, next), maxTokens);
        if (step.id === 'bestName') {
          next.name = extractMarkdownSection(content, /^##\s+рекомендуемый/i)
            ? stripMarkdown(extractMarkdownSection(content, /^##\s+рекомендуемый/i)).split('\n')[0]?.replace(/^\d+\.\s*/, '').split('—')[0]?.trim() || 'Мини-продукт'
            : 'Мини-продукт';
        }
        if (step.id === 'mainOffer') next.offer = content;
        if (step.id === 'shortDescription') next.productDescription = content;
        if (step.id === 'lesson1') next.lesson1 = content;
        if (step.id === 'lesson2') next.lesson2 = content;
        if (step.id === 'lesson3') next.lesson3 = content;
        if (step.id === 'bonuses') next.bonuses = content;
        if (step.id === 'mainResult') next.transformation = content;
        next = withMessage({
          ...next,
          price: 'Входной платный продукт',
          format: '7 дней / 3 занятия / практика',
          duration: '1 неделя',
          stepStatuses: { ...(next.stepStatuses ?? EMPTY_STATUSES), [step.id]: 'done' },
        }, { role: 'assistant', content, stepId: step.id, stepTitle: step.label });
        persistState(next, { syncMaterial: false });
      }
      persistState(next);
      toast.success('Мини-продукт создан');
    } catch (err) {
      console.error('[ProductMini create] AI error:', err);
      const message = getRequestErrorMessage(err);
      persistState(withMessage(next, {
        role: 'assistant',
        content: `Не удалось продолжить создание мини-продукта: ${message}`,
        stepTitle: 'Ошибка создания',
      }), { syncMaterial: false });
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  async function handleChatSend() {
    const text = chatInput.trim();
    if (!text || loading) return;
    const userMessage: ProductChatMessage = { role: 'user', content: text };
    const stateWithUser = withMessage(state, userMessage);
    setChatInput('');
    persistState(stateWithUser, { syncMaterial: false });
    setLoading(true);

    try {
      const response = await requestAi(`${basePrompt()}

Пользователь хочет отредактировать мини-продукт через чат.
Его запрос:
${text}

Текущая версия мини-продукта:
${buildMiniProductBrief(stateWithUser)}

Задача:
- Выполни правку по запросу пользователя.
- Верни только обновлённую полную версию мини-продукта в markdown.
- Сохраняй структуру мини-продукта на 7 дней из 3 занятий.
- В полной версии должны остаться: название, оффер, краткое описание, 3 занятия, расписание на 7 дней, главный результат, для кого/не для кого, бонусы, возражения, лендинг-блок, 3 Telegram-поста и мост к следующему продукту.
- Не обещай полного решения большой системной проблемы за 7 дней.
- Не добавляй служебные комментарии вроде “готово” или “я изменил”. Только обновлённый мини-продукт.`, 5200);

      const description = response.includes('# Мини-продукт') ? response : `# Мини-продукт\n\n${response}`;
      persistState({
        ...stateWithUser,
        generated: true,
        description,
        chatMessages: [
          ...(stateWithUser.chatMessages ?? []),
          ...splitProductMarkdownToMessages(description).map((message) => ({
            ...message,
            stepTitle: message.stepTitle ? `Обновлено · ${message.stepTitle}` : 'Обновлено',
          })),
        ],
      });
    } catch (err) {
      console.error('[ProductMini chat] AI error:', err);
      persistState(withMessage(stateWithUser, {
        role: 'assistant',
        content: 'Не смог обработать правку. Попробуйте сформулировать действие конкретнее: что именно изменить в мини-продукте и какой результат нужен.',
      }), { syncMaterial: false });
    } finally {
      setLoading(false);
    }
  }

  async function handleDownload() {
    if (!state.generated || pdfLoading) return;
    setPdfLoading(true);
    try {
      await downloadProductPresentationPdf(state, projectName);
    } catch (err) {
      console.error('[ProductMini PDF]', err);
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

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', backgroundColor: '#fff' }}>
      <div style={{
        width: 280,
        flexShrink: 0,
        backgroundColor: '#F5F4F0',
        borderRight: '1px solid #E5E3DC',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '24px 20px 16px' }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: '#1a1a1a', margin: '0 0 4px' }}>
            Мини-продукт
          </h2>
          <p style={{ fontSize: 12, color: '#888', margin: '0 0 16px' }}>
            3 занятия + 5 бонусов
          </p>
          <button
            style={{ ...btnGold, width: '100%', display: 'flex', justifyContent: 'center', gap: 6 }}
            onClick={() => void handleCreate()}
            disabled={loading}
          >
            {loading && <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⟳</span>}
            {loading ? 'ИИ работает...' : state.generated ? 'Пересобрать продукт' : 'Создать продукт'}
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 16px' }}>
          {PRODUCT_STEPS.map((step, index) => {
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
              Мини-продуктовая упаковка
            </h2>
            <p style={{ fontSize: 12, color: '#888', margin: '2px 0 0' }}>
              {projectName} · быстрый результат, 3 занятия и бонусы
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
              }}>⚡</div>
              <p style={{ fontSize: 14, color: '#888', maxWidth: 390, lineHeight: 1.6 }}>
                Нажмите «Создать продукт» — ИИ соберёт мини-продукт по чеклисту и выдаст каждый блок отдельным сообщением.
              </p>
            </div>
          ) : (
            <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
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
                    maxWidth: 'min(760px, 78%)',
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
          <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', gap: 12, alignItems: 'flex-end' }}>
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
                ? 'Напишите, что изменить в мини-продукте: занятия, бонусы, оффер, формат...'
                : 'Сначала создайте мини-продукт, затем здесь можно будет редактировать его через ИИ...'}
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
          <div style={{ maxWidth: 900, margin: '8px auto 0', color: '#aaa', fontSize: 11, textAlign: 'right' }}>
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
