import { Link } from 'react-router-dom';
import LegalInfoBlock from '../../components/LegalInfoBlock/LegalInfoBlock';
import {
  getLimitValue,
  SECTION_LIMITS,
  UsageLimitBadge,
  UsageLimitCard,
  useBillingMe,
  type SectionUsageLimitsSection,
  type UsageLimitKey,
} from '../../components/UsageLimits/UsageLimits';
import { appPath } from '../../utils/appRoutes';
import { formatLimitNumber } from '../../utils/planLimits';
import s from './Limits.module.css';

const mainCards: Array<{ key: UsageLimitKey; title: string; description: string }> = [
  { key: 'contentUnits', title: 'Контент', description: 'Посты, сценарии, статьи, треды и контент-планы' },
  { key: 'aiMessagesToday', title: 'AI-сообщения сегодня', description: 'Сообщения в диалоге с AI обновляются каждый день' },
  { key: 'aiGenerations', title: 'AI-генерации', description: 'Создание и доработка материалов с помощью AI' },
  { key: 'projects', title: 'Проекты', description: 'Отдельные направления, ниши, продукты или сегменты аудитории' },
];

const sectionCards: Array<{
  section: SectionUsageLimitsSection;
  title: string;
  description: string;
  button: string;
  href: string;
}> = [
  {
    section: 'ai_chat',
    title: 'Диалог с AI',
    description: 'Для вопросов, уточнений, обсуждения стратегии, контента и продуктов с AI.',
    button: 'Перейти в диалог',
    href: '/ai-dialog',
  },
  {
    section: 'content',
    title: 'Контент',
    description: 'Посты, рилсы, статьи, треды, цепочки текстов, сценарии видео и контент-планы.',
    button: 'Перейти к контенту',
    href: '/posts',
  },
  {
    section: 'strategy',
    title: 'Стратегия',
    description: 'О себе, позиционирование, целевая аудитория, УТП и другие стратегические разделы.',
    button: 'Перейти к стратегии',
    href: '/strategy/about',
  },
  {
    section: 'products',
    title: 'Продукты',
    description: 'Основной продукт, мини-продукт, лид-магнит, офферы и продуктовая линейка.',
    button: 'Перейти к продуктам',
    href: '/products/main',
  },
];

const tableRows: Array<{ key: UsageLimitKey; label: string; note?: string }> = [
  { key: 'contentUnits', label: 'Контент-единицы' },
  { key: 'aiMessagesToday', label: 'AI-сообщения сегодня' },
  { key: 'aiGenerations', label: 'AI-генерации' },
  { key: 'projects', label: 'Проекты' },
  { key: 'heavyGenerations', label: 'Тяжёлые генерации' },
  { key: 'strategyRebuilds', label: 'Пересборки стратегии' },
  { key: 'youtubeScripts', label: 'YouTube-сценарии' },
  { key: 'longreads', label: 'Лонгриды' },
  { key: 'credits', label: 'Credits', note: 'технический показатель' },
];

const explanations = [
  ['Контент-единицы', 'Контент-единицы — это материалы, которые вы создаёте в Luma IQ: посты, сценарии, статьи, треды, контент-планы, цепочки текстов и другие форматы.'],
  ['AI-сообщения', 'AI-сообщения — это сообщения в диалоге с AI. Этот лимит обновляется каждый день.'],
  ['AI-генерации', 'AI-генерации — это создание или доработка материалов с помощью AI в разделах стратегии, продуктов и контента.'],
  ['Тяжёлые генерации', 'Тяжёлые генерации — это более объёмные действия: пересборка стратегии, создание длинного сценария, лонгрида, структуры лендинга, продуктовой упаковки или воронки.'],
  ['Credits', 'Credits — это технический внутренний баланс платформы для расчёта нагрузки AI. Обычно вам не нужно следить за ним вручную.'],
];

function formatRenewalDate(value?: string): string {
  if (!value) return 'Лимиты обновятся в следующем расчётном периоде';
  return `Лимиты обновятся ${new Date(value).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}`;
}

function Skeleton() {
  return (
    <div className={s.root}>
      <div className={s.header}>
        <div>
          <h2 className={s.title}>Лимиты</h2>
          <p className={s.subtitle}>Загружаем лимиты...</p>
        </div>
        <div className={s.planCardSkeleton} />
      </div>
      <div className={s.grid}>
        {Array.from({ length: 4 }).map((_, index) => <div className={s.skeletonCard} key={index} />)}
      </div>
    </div>
  );
}

export default function Limits() {
  const { billing, loading, error } = useBillingMe();

  if (loading) return <Skeleton />;

  if (error) {
    return (
      <div className={s.root}>
        <div className={s.stateCard}>
          <h2>Не удалось загрузить лимиты</h2>
          <p>Попробуйте обновить страницу. Если ошибка повторится, обратитесь в поддержку.</p>
        </div>
      </div>
    );
  }

  if (!billing?.plan) {
    return (
      <div className={s.root}>
        <div className={s.stateCard}>
          <h2>Тариф не выбран</h2>
          <p>Выберите тариф, чтобы начать пользоваться Luma IQ.</p>
          <Link className={s.primaryButton} to={appPath('/pricing')}>Выбрать тариф</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={s.root}>
      <div className={s.header}>
        <div>
          <h2 className={s.title}>Лимиты</h2>
          <p className={s.subtitle}>
            Здесь собраны лимиты вашего тарифа: контент, AI-сообщения, проекты, стратегия и продукты.
          </p>
        </div>
        <aside className={s.planCard}>
          <span>Текущий тариф</span>
          <strong>{billing.plan.name}</strong>
          <p>{formatRenewalDate(billing.period.currentPeriodEnd)}</p>
          <Link className={s.secondaryButton} to={appPath('/pricing')}>Изменить тариф</Link>
        </aside>
      </div>

      <section className={s.grid} aria-label="Главные лимиты">
        {mainCards.map((card) => {
          const value = getLimitValue(billing, card.key);
          return (
            <UsageLimitCard
              key={card.key}
              title={card.title}
              description={card.description}
              used={value.used}
              remaining={value.remaining}
              limit={value.limit}
            />
          );
        })}
      </section>

      <section className={s.section}>
        <div className={s.sectionIntro}>
          <h3>Лимиты по разделам сервиса</h3>
          <p>Каждый раздел Luma IQ использует свои лимиты. Так проще понять, что именно расходуется при работе.</p>
        </div>
        <div className={s.sectionGrid}>
          {sectionCards.map((card) => (
            <article className={s.serviceCard} key={card.section}>
              <h4>{card.title}</h4>
              <p>{card.description}</p>
              <div className={s.localList}>
                {SECTION_LIMITS[card.section].map((key) => {
                  const value = getLimitValue(billing, key);
                  return <UsageLimitBadge key={key} label={value.label} used={value.used} remaining={value.remaining} limit={value.limit} />;
                })}
              </div>
              <Link className={s.cardButton} to={appPath(card.href)}>{card.button}</Link>
            </article>
          ))}
        </div>
      </section>

      <section className={s.section}>
        <div className={s.sectionIntro}>
          <h3>Все лимиты тарифа</h3>
        </div>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th>Лимит</th>
                <th>Использовано</th>
                <th>Осталось</th>
                <th>Всего</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row) => {
                const value = getLimitValue(billing, row.key);
                return (
                  <tr key={row.key}>
                    <td>{row.label}{row.note && <span className={s.tableNote}> {row.note}</span>}</td>
                    <td>{formatLimitNumber(value.used)}</td>
                    <td>{value.limit === 0 ? 'Недоступно' : formatLimitNumber(value.remaining)}</td>
                    <td>{formatLimitNumber(Math.max(0, value.limit))}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className={s.section}>
        <div className={s.sectionIntro}>
          <h3>Что означают лимиты</h3>
        </div>
        <div className={s.explainGrid}>
          {explanations.map(([title, text]) => (
            <details className={s.explainCard} key={title}>
              <summary>{title}</summary>
              <p>{text}</p>
            </details>
          ))}
        </div>
      </section>

      <section className={s.cta}>
        <div>
          <h3>Нужно больше лимитов?</h3>
          <p>Перейдите на более высокий тариф, если вам нужно больше проектов, контента, AI-сообщений или сопровождение маркетолога.</p>
        </div>
        <Link className={s.primaryButton} to={appPath('/pricing')}>Увеличить лимиты</Link>
      </section>

      <LegalInfoBlock />
    </div>
  );
}
