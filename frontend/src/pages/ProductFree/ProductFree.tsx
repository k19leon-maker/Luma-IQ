import { useState } from 'react';
import ProductWorkspace, { ProductFormProps, StrategyData } from '../../components/ProductWorkspace/ProductWorkspace';
import s from '../../components/ProductWorkspace/ProductWorkspace.module.css';

// ─── Mock generator ───────────────────────────────────────────────────────────

function line(text: string | undefined, fallback: string): string {
  if (!text) return fallback;
  return text.split('\n')[0]?.replace(/^\d+\.\s*/, '').slice(0, 80) ?? fallback;
}

function buildFreeProduct(type: string, format: string, sd: StrategyData | null): string {
  const seg    = line(sd?.chosenSegment,    'ваша целевая аудитория');
  const pain   = line(sd?.corePains,        'сложная ситуация');
  const result = line(sd?.finalResult,      'желаемый результат');
  const sub    = line(sd?.chosenSubsegment, 'специалист');

  const TYPE_NAMES: Record<string, string> = {
    checklist: 'Чек-лист', guide: 'Гайд', mini_lesson: 'Мини-урок',
    template: 'Шаблон', consultation: 'Бесплатная консультация',
  };
  const typeName   = TYPE_NAMES[type]   ?? type;
  const FORMAT_NAMES: Record<string, string> = {
    pdf: 'PDF', video: 'Видео', telegram: 'Telegram-сообщение', audio: 'Аудио',
  };
  const formatName = FORMAT_NAMES[format] ?? format;

  const structureByType: Record<string, string> = {
    checklist: `□ Шаг 1. Осознать: что именно происходит прямо сейчас
□ Шаг 2. Назвать ключевую боль одной фразой
□ Шаг 3. Проверить — это внешняя или внутренняя причина?
□ Шаг 4. Задать себе вопрос: «Что мне сейчас по-настоящему нужно?»
□ Шаг 5. Сделать одно маленькое действие в сторону желаемого
□ Шаг 6. Зафиксировать результат — что изменилось?
□ Шаг 7. Решить: нужна ли поддержка специалиста`,

    guide: `ЧАСТЬ 1 — Понять ситуацию (стр. 1–3)
  Почему это происходит с вами
  Три главных признака что пора действовать

ЧАСТЬ 2 — Инструменты (стр. 4–7)
  Техника «Стоп и осознание» — пошаговая инструкция
  Упражнение «Разговор с собой» — шаблон
  Практика ежедневного наблюдения

ЧАСТЬ 3 — Следующие шаги (стр. 8–9)
  Как закрепить изменения
  Когда стоит обратиться к специалисту
  Приглашение на консультацию`,

    mini_lesson: `УРОК 1 (5 мин): Что на самом деле происходит
  Смотрите видео → Выполните задание

УРОК 2 (7 мин): Главная причина, о которой никто не говорит
  Смотрите видео → Ответьте на 3 вопроса

УРОК 3 (5 мин): Один инструмент который работает сразу
  Смотрите видео → Применяйте сегодня

БОНУС: Шаблон самодиагностики (PDF)`,

    template: `ШАБЛОН: Ежедневный трекер состояния

Дата: ___________

Утро:
[ ] Как я себя чувствую? _______________
[ ] Что меня беспокоит? _______________
[ ] Моя главная потребность сегодня: ___

Вечер:
[ ] Что помогло сегодня? _______________
[ ] Что хочу изменить завтра? __________
[ ] Уровень тревоги (1–10): ___

Еженедельно: замечаю ли я изменения? ___`,

    consultation: `ФОРМАТ ВСТРЕЧИ (30 минут, бесплатно)

Блок 1 — Диагностика (10 мин):
  Рассказываете о своей ситуации
  Я задаю уточняющие вопросы

Блок 2 — Разбор (15 мин):
  Выявляем главную точку застревания
  Я объясняю свой взгляд и подход

Блок 3 — Дальнейший путь (5 мин):
  Варианты работы
  Ответы на вопросы

БЕЗ ДАВЛЕНИЯ — просто знакомство`,
  };

  const structure = structureByType[type]
    ?? `1. Введение\n2–6. Основной контент\n7. Призыв к действию`;

  const shortTitle =
    type === 'checklist'    ? `7 шагов: ${result.slice(0, 50)}` :
    type === 'guide'        ? `Полный гайд: ${result.slice(0, 50)}` :
    type === 'mini_lesson'  ? `3 урока: ${result.slice(0, 50)}` :
    type === 'template'     ? `Шаблон: ${result.slice(0, 50)}` :
                              `Бесплатная диагностика — ${seg.slice(0, 40)}`;

  return `БЕСПЛАТНЫЙ ПРОДУКТ: ${typeName}
Формат: ${formatName}
Для кого: ${seg} — ${sub}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
НАЗВАНИЕ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
«${shortTitle}»

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
СТРУКТУРА
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${structure}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
КАК ИСПОЛЬЗОВАТЬ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Где давать: закреп профиля / шапка / ответ в директ на кодовое слово
Объём: 1–2 страницы (${formatName})
Цель: сбор базы + знакомство с вашим подходом

━━━━━━━━━━━━━━━━━━━━━━━━━━━━
СЛЕДУЮЩИЙ ШАГ ДЛЯ КЛИЕНТА
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
После изучения → пригласить на бесплатный разбор или в мини-продукт`;
}

// ─── Form ─────────────────────────────────────────────────────────────────────

const TYPES = [
  { key: 'checklist',    label: 'Чек-лист' },
  { key: 'guide',        label: 'Гайд' },
  { key: 'mini_lesson',  label: 'Мини-урок' },
  { key: 'template',     label: 'Шаблон' },
  { key: 'consultation', label: 'Консультация' },
];

const FORMATS = [
  { key: 'pdf',      label: 'PDF' },
  { key: 'video',    label: 'Видео' },
  { key: 'telegram', label: 'Telegram' },
  { key: 'audio',    label: 'Аудио' },
];

const TYPE_LABELS: Record<string, string> = {
  checklist: 'Чек-лист', guide: 'Гайд', mini_lesson: 'Мини-урок',
  template: 'Шаблон', consultation: 'Консультация',
};

function ProductFreeForm({ onGenerate, loading, strategy }: ProductFormProps) {
  const [type,   setType]   = useState('checklist');
  const [format, setFormat] = useState('pdf');

  return (
    <>
      <h2 className={s.formTitle}>Создать бесплатный продукт</h2>

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
        <span className={s.chipLabel}>Формат доставки</span>
        <div className={s.chipGroup}>
          {FORMATS.map(({ key, label }) => (
            <button
              key={key}
              className={`${s.chip}${format === key ? ' ' + s.chipActive : ''}`}
              onClick={() => setFormat(key)}
            >{label}</button>
          ))}
        </div>
      </div>

      <button
        className={s.generateBtn}
        disabled={loading}
        onClick={() =>
          onGenerate(
            `${TYPE_LABELS[type] ?? type} (бесплатный)`,
            buildFreeProduct(type, format, strategy),
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

export default function ProductFree() {
  return (
    <ProductWorkspace
      sectionTitle="Бесплатный продукт"
      productIcon="🎁"
      emptyHint={'Лид-магниты появятся здесь.\nНажмите «+ Создать»'}
      FormComponent={ProductFreeForm}
    />
  );
}
