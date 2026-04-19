import { useState } from 'react';
import ProductWorkspace, { ProductFormProps, StrategyData } from '../../components/ProductWorkspace/ProductWorkspace';
import s from '../../components/ProductWorkspace/ProductWorkspace.module.css';

// ─── Mock generator ───────────────────────────────────────────────────────────

function line(text: string | undefined, fallback: string): string {
  if (!text) return fallback;
  return text.split('\n')[0]?.replace(/^\d+\.\s*/, '').slice(0, 80) ?? fallback;
}

function buildMainProduct(type: string, duration: string, price: string, sd: StrategyData | null): string {
  const seg    = line(sd?.chosenSegment,    'ваша целевая аудитория');
  const pain   = line(sd?.corePains,        'сложная ситуация');
  const result = line(sd?.finalResult,      'желаемый результат');
  const desires = line(sd?.deepDesires,     'глубокое желание');

  const TYPE_NAMES: Record<string, string> = {
    course:        'Курс',
    program:       'Программа',
    group_format:  'Групповой формат',
    individual:    'Индивидуальная работа',
  };
  const typeName = TYPE_NAMES[type] ?? type;

  const DURATION_LABELS: Record<string, string> = {
    one_month:     '1 месяц',
    two_months:    '2–3 месяца',
    six_months:    '6+ месяцев',
  };
  const durationLabel = DURATION_LABELS[duration] ?? duration;

  const PRICE_LABELS: Record<string, string> = {
    low:  'до 30 000 ₽',
    mid:  '30 000–60 000 ₽',
    high: 'от 60 000 ₽',
  };
  const priceLabel = PRICE_LABELS[price] ?? price;

  const weeks =
    duration === 'one_month'  ? 4 :
    duration === 'two_months' ? 8 :
                                16;

  const modules = Array.from({ length: Math.min(weeks, 8) }, (_, i) => {
    const n = i + 1;
    const titles: Record<number, string> = {
      1: 'Диагностика и постановка целей',
      2: `Понять корень: почему ${pain.slice(0, 30)}`,
      3: 'Первые инструменты — практика с нуля',
      4: 'Работа с триггерами и паттернами',
      5: `Строим путь к: ${result.slice(0, 35)}`,
      6: 'Новые стратегии поведения',
      7: 'Закрепление результатов',
      8: 'Финал: автономность и план на будущее',
    };
    return `  Неделя ${n}: ${titles[n] ?? `Модуль ${n}: продвижение к цели`}`;
  }).join('\n');

  const formatByType: Record<string, string> = {
    course: `${weeks} видеоуроков + задания
Самостоятельное прохождение в своём темпе
Закрытый чат участников
Обратная связь от куратора`,

    program: `${weeks} еженедельных сессий × 60–90 мин
Онлайн, 1 на 1
Домашние задания между встречами
Поддержка в мессенджере`,

    group_format: `${weeks} групповых встреч × 90 мин
Группа до 8 человек
Индивидуальная работа на группе
Закрытый чат + материалы`,

    individual: `${weeks} индивидуальных сессий × 60 мин
Онлайн, 1 на 1
Персональная программа под ваш запрос
Поддержка между сессиями`,
  };

  const format = formatByType[type] ?? `${weeks} встреч, онлайн`;

  return `ОСНОВНОЙ ПРОДУКТ: ${typeName}
Длительность: ${durationLabel}
Стоимость: ${priceLabel}
Для кого: ${seg}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
НАЗВАНИЕ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
«${result.slice(0, 60)}: ${durationLabel.toLowerCase()} работы»

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ДЛЯ КОГО
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Аудитория: ${seg}
Боль: ${pain}
Глубокое желание: ${desires}
Итоговый результат: ${result}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ТРАНСФОРМАЦИЯ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
До: ${pain}
После: ${result}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ПРОГРАММА
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${modules}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ФОРМАТ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${format}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ЧТО ПОЛУЧИТ КЛИЕНТ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ Полное понимание своей ситуации и её корней
✓ Конкретные инструменты для устойчивых изменений
✓ ${result}
✓ Навыки самостоятельной работы с собой
✓ Поддержку на всём пути

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ОФФЕР
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Стоимость: ${priceLabel}
Рассрочка: на 2–4 части
Старт: после вводной диагностической сессии (бесплатно)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ПРИЗЫВ К ДЕЙСТВИЮ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Напишите «ХОЧУ» — проведу бесплатную 30-минутную диагностику
и расскажу, как именно программа решит вашу ситуацию`;
}

// ─── Form ─────────────────────────────────────────────────────────────────────

const TYPES = [
  { key: 'course',       label: 'Курс' },
  { key: 'program',      label: 'Программа' },
  { key: 'group_format', label: 'Групповой формат' },
  { key: 'individual',   label: 'Индивидуально' },
];

const DURATIONS = [
  { key: 'one_month',  label: '1 месяц' },
  { key: 'two_months', label: '2–3 месяца' },
  { key: 'six_months', label: '6+ месяцев' },
];

const PRICES = [
  { key: 'low',  label: 'до 30 000 ₽' },
  { key: 'mid',  label: '30–60 000 ₽' },
  { key: 'high', label: 'от 60 000 ₽' },
];

const TYPE_LABELS: Record<string, string> = {
  course: 'Курс', program: 'Программа',
  group_format: 'Групповой формат', individual: 'Индивидуальная работа',
};

function ProductMainForm({ onGenerate, loading, strategy }: ProductFormProps) {
  const [type,     setType]     = useState('program');
  const [duration, setDuration] = useState('two_months');
  const [price,    setPrice]    = useState('mid');

  return (
    <>
      <h2 className={s.formTitle}>Создать основной продукт</h2>

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
        <span className={s.chipLabel}>Длительность</span>
        <div className={s.chipGroup}>
          {DURATIONS.map(({ key, label }) => (
            <button
              key={key}
              className={`${s.chip}${duration === key ? ' ' + s.chipActive : ''}`}
              onClick={() => setDuration(key)}
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
            `${TYPE_LABELS[type] ?? type} (основной)`,
            buildMainProduct(type, duration, price, strategy),
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

export default function ProductMain() {
  return (
    <ProductWorkspace
      sectionTitle="Основной продукт"
      productIcon="🚀"
      emptyHint={'Флагманские продукты появятся здесь.\nНажмите «+ Создать»'}
      FormComponent={ProductMainForm}
    />
  );
}
