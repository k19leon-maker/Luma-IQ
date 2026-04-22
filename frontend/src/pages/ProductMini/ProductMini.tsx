import { useState } from 'react';
import ProductWorkspace, { ProductFormProps, StrategyData } from '../../components/ProductWorkspace/ProductWorkspace';
import { useProjectsStore } from '../../store/projects.store';
import s from '../../components/ProductWorkspace/ProductWorkspace.module.css';

// ─── Mock generator ───────────────────────────────────────────────────────────

function line(text: string | undefined, fallback: string): string {
  if (!text) return fallback;
  return text.split('\n')[0]?.replace(/^\d+\.\s*/, '').slice(0, 80) ?? fallback;
}

function buildMiniProduct(type: string, price: string, sd: StrategyData | null): string {
  const seg    = line(sd?.chosenSegment,    'ваша целевая аудитория');
  const pain   = line(sd?.corePains,        'сложная ситуация');
  const result = line(sd?.finalResult,      'желаемый результат');

  const TYPE_NAMES: Record<string, string> = {
    workbook:     'Воркбук',
    webinar:      'Вебинар',
    mini_course:  'Мини-курс',
    breakdown:    'Разбор',
    consultation: 'Консультация',
  };
  const typeName = TYPE_NAMES[type] ?? type;

  const PRICE_LABELS: Record<string, string> = {
    low:  'до 3 000 ₽',
    mid:  '3 000–7 000 ₽',
    high: '7 000–15 000 ₽',
  };
  const priceLabel = PRICE_LABELS[price] ?? price;

  const structureByType: Record<string, string> = {
    workbook: `МОДУЛЬ 1 — Диагностика (стр. 1–8)
  Упражнение «Колесо жизни»
  Тест: уровень стресса / тревоги
  Практика: письмо себе

МОДУЛЬ 2 — Осознание (стр. 9–18)
  Техника «5 почему»
  Дневник триггеров — шаблон
  Упражнение «Письмо боли»

МОДУЛЬ 3 — Инструменты (стр. 19–28)
  3 техники быстрой регуляции
  Практика «Безопасное место»
  Дневник ресурсов

МОДУЛЬ 4 — Закрепление (стр. 29–32)
  Мой план на 21 день
  Отслеживание прогресса
  Следующие шаги`,

    webinar: `БЛОК 1 — Введение (10 мин)
  Кто вы и ваш подход
  Что участники получат сегодня

БЛОК 2 — Диагностика (15 мин)
  Опрос аудитории — узнаёте ли себя?
  Разбор типичной ситуации

БЛОК 3 — Инструменты (30 мин)
  Техника 1: ${pain.slice(0, 40)} — как выйти
  Техника 2: первый шаг к ${result.slice(0, 40)}
  Практическое упражнение в прямом эфире

БЛОК 4 — Q&A и оффер (15 мин)
  Ответы на вопросы
  Предложение продолжить работу`,

    mini_course: `УРОК 1 (15 мин): Понять корень проблемы
  Теория + практическое задание

УРОК 2 (20 мин): Первый инструмент — сразу в практику
  Техника + домашнее задание

УРОК 3 (20 мин): Работа с триггерами
  Разбор кейсов + упражнение

УРОК 4 (15 мин): Строим новый паттерн
  Практика + трекер на 7 дней

УРОК 5 (10 мин): Закрепление и следующие шаги
  Итоги + приглашение в основной продукт

БОНУСЫ: PDF-шаблоны + чат поддержки на 2 недели`,

    breakdown: `ФОРМАТ: 60 минут, онлайн, 1 на 1

ЭТАП 1 — Погружение (15 мин):
  Расскажите о своей ситуации
  Я задаю уточняющие вопросы
  Определяем главный запрос

ЭТАП 2 — Анализ (25 мин):
  Разбираем корень проблемы
  Выявляем ключевые паттерны
  Смотрим на ресурсы

ЭТАП 3 — План (20 мин):
  3–5 конкретных шагов
  Рекомендации и инструменты
  Ответы на вопросы

РЕЗУЛЬТАТ: понимание ситуации + конкретный план`,

    consultation: `ФОРМАТ: 90 минут, онлайн

ЧАСТЬ 1 — Диагностика (30 мин):
  Изучение запроса и истории
  Выявление ключевых точек

ЧАСТЬ 2 — Работа (45 мин):
  Одна техника / метод в действии
  Проработка основного запроса

ЧАСТЬ 3 — Итоги (15 мин):
  Резюме сессии
  Домашнее задание
  Рекомендации по дальнейшей работе`,
  };

  const structure = structureByType[type]
    ?? `1. Введение\n2. Основной контент\n3. Практика\n4. Закрепление`;

  return `МИНИ-ПРОДУКТ: ${typeName}
Цена: ${priceLabel}
Для кого: ${seg}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
НАЗВАНИЕ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
«${result.slice(0, 55)}: ${typeName.toLowerCase()} для ${seg.slice(0, 30)}»

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ДЛЯ КОГО
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Аудитория: ${seg}
Боль: ${pain}
Желаемый результат: ${result}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ТРАНСФОРМАЦИЯ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
До: ${pain}
После: ${result}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ПРОГРАММА
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${structure}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ЧТО ПОЛУЧИТ КЛИЕНТ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ Понимание корня своей ситуации
✓ Конкретные инструменты для изменений
✓ Первый ощутимый результат
✓ Уверенность что изменения возможны

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ОФФЕР
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Стоимость: ${priceLabel}
Формат: онлайн
Гарантия: если после первого занятия не понравится — верну деньги

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
СЛЕДУЮЩИЙ ШАГ ДЛЯ КЛИЕНТА
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
После завершения → предложение основного продукта`;
}

// ─── Form ─────────────────────────────────────────────────────────────────────

const TYPES = [
  { key: 'workbook',     label: 'Воркбук' },
  { key: 'webinar',      label: 'Вебинар' },
  { key: 'mini_course',  label: 'Мини-курс' },
  { key: 'breakdown',    label: 'Разбор' },
  { key: 'consultation', label: 'Консультация' },
];

const PRICES = [
  { key: 'low',  label: 'до 3 000 ₽' },
  { key: 'mid',  label: '3–7 000 ₽' },
  { key: 'high', label: '7–15 000 ₽' },
];

const TYPE_LABELS: Record<string, string> = {
  workbook: 'Воркбук', webinar: 'Вебинар', mini_course: 'Мини-курс',
  breakdown: 'Разбор', consultation: 'Консультация',
};

function ProductMiniForm({ onGenerate, loading, strategy }: ProductFormProps) {
  const [type,  setType]  = useState('webinar');
  const [price, setPrice] = useState('mid');

  return (
    <>
      <h2 className={s.formTitle}>Создать мини-продукт</h2>

      <div className={s.formField}>
        <span className={s.chipLabel}>Тип продукта</span>
        <div className={s.chipGroup}>
          {TYPES.map(({ key, label }) => (
            <button
              key={key}
              className={`${s.chip}${type === key ? ' ' + s.chipActive : ''}`}
              onClick={() => setType(key)}
            >{label}</button>
          ))}
        </div>
      </div>

      <div className={s.formField}>
        <span className={s.chipLabel}>Ценовой диапазон</span>
        <div className={s.chipGroup}>
          {PRICES.map(({ key, label }) => (
            <button
              key={key}
              className={`${s.chip}${price === key ? ' ' + s.chipActive : ''}`}
              onClick={() => setPrice(key)}
            >{label}</button>
          ))}
        </div>
      </div>

      <button
        className={s.generateBtn}
        disabled={loading}
        onClick={() =>
          onGenerate(
            `${TYPE_LABELS[type] ?? type} (мини)`,
            buildMiniProduct(type, price, strategy),
          )
        }
      >
        {loading
          ? <><span className={s.spinner} /> Генерирую…</>
          : 'Сгенерировать структуру →'}
      </button>
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProductMini() {
  const activeProjectId = useProjectsStore((s) => s.activeProjectId);
  return (
    <ProductWorkspace
      sectionTitle="Мини-продукт"
      productIcon="⚡"
      emptyHint={'Мини-продукты появятся здесь.\nНажмите «+ Создать»'}
      storageKey={`products_mini_${activeProjectId}`}
      FormComponent={ProductMiniForm}
    />
  );
}
