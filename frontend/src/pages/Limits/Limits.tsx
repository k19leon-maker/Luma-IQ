import { Link } from 'react-router-dom';
import LegalInfoBlock from '../../components/LegalInfoBlock/LegalInfoBlock';
import { useBillingMe } from '../../components/UsageLimits/UsageLimits';
import { appPath } from '../../utils/appRoutes';
import { formatLimitNumber } from '../../utils/planLimits';
import s from './Limits.module.css';

const capacityGroups = [
  {
    title: 'Стратегия',
    items: [
      'strategy_about', 'positioning', 'audience', 'utp', 'social', 'strategy_rebuild',
    ],
  },
  {
    title: 'Продукты',
    items: [
      'product_main', 'product_main_edit',
      'product_mini', 'product_mini_edit',
      'lead_magnet', 'lead_magnet_edit',
    ],
  },
  {
    title: 'Контент',
    items: [
      'content_post', 'content_post_edit', 'content_post_regenerate',
      'content_reel', 'content_reel_edit', 'content_reel_regenerate',
      'content_thread', 'content_thread_edit', 'content_thread_regenerate',
      'content_article', 'content_longread', 'youtube_script', 'content_plan',
      'tg_channel_plan', 'tg_channel_post', 'tg_channel_post_edit',
    ],
  },
  {
    title: 'Диалог',
    items: [
      'ai_chat_quick', 'ai_chat_deep', 'ai_chat_strategy',
    ],
  },
];

function formatRenewalDate(value?: string | null): string {
  if (!value) return 'Лимиты обновятся в следующем расчётном периоде';
  return `Лимиты обновятся ${new Date(value).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}`;
}

function formatHistoryDate(value: string): string {
  return new Date(value).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getCapacityCount(balance: number, cost: number): number {
  if (cost <= 0) return 0;
  return Math.max(0, Math.floor(balance / cost));
}

function Skeleton() {
  return (
    <div className={s.root}>
      <div className={s.header}>
        <div>
          <h2 className={s.title}>Лимиты</h2>
          <p className={s.subtitle}>Загружаем AI-баланс и тариф...</p>
        </div>
        <div className={s.planCardSkeleton} />
      </div>
      <div className={s.mainGrid}>
        <div className={s.skeletonCard} />
        <div className={s.skeletonCard} />
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

  if (!billing?.plan || !billing.publicLimits) {
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

  const limits = billing.publicLimits;
  const aiPercent = limits.aiBalanceTotal > 0
    ? Math.min(100, Math.max(0, (limits.aiBalanceUsed / limits.aiBalanceTotal) * 100))
    : 0;
  const projectsPercent = limits.projectsTotal > 0
    ? Math.min(100, Math.max(0, (limits.projectsUsed / limits.projectsTotal) * 100))
    : 0;
  const aiIsEmpty = limits.aiBalanceRemaining <= 0;
  const aiIsLow = !aiIsEmpty && limits.aiBalanceTotal > 0 && limits.aiBalanceRemaining / limits.aiBalanceTotal < 0.15;
  const projectsEmpty = limits.projectsRemaining <= 0;
  const priceByAction = new Map(billing.actionPrices.map((item) => [item.actionKey, item]));

  return (
    <div className={s.root}>
      <div className={s.header}>
        <div>
          <h2 className={s.title}>Лимиты</h2>
          <p className={s.subtitle}>
            Здесь показано, сколько AI-баланса и проектов доступно на вашем тарифе.
          </p>
        </div>
        <aside className={s.planCard}>
          <span>Текущий тариф</span>
          <strong>{limits.planName}</strong>
          <p>{formatRenewalDate(limits.limitsResetAt)}</p>
          <Link className={s.secondaryButton} to={appPath('/pricing')}>Изменить тариф</Link>
        </aside>
      </div>

      <section className={s.mainGrid}>
        <article className={`${s.balanceCard}${aiIsEmpty ? ` ${s.cardCritical}` : aiIsLow ? ` ${s.cardWarning}` : ''}`}>
          <div className={s.cardHeader}>
            <span>AI-баланс</span>
            {aiIsEmpty && <b>закончился</b>}
            {aiIsLow && <b>скоро закончится</b>}
          </div>
          <div className={s.balanceValue}>
            {formatLimitNumber(limits.aiBalanceRemaining)} из {formatLimitNumber(limits.aiBalanceTotal)} баллов осталось
          </div>
          <div className={s.progressTrack} aria-hidden="true">
            <div className={s.progressBar} style={{ width: `${aiPercent}%` }} />
          </div>
          <p>
            AI-баланс расходуется на диалог с ИИ, стратегию, продукты, офферы, посты, статьи, сценарии и другие AI-действия.
          </p>
          {aiIsEmpty && (
            <p className={s.alertText}>
              Вы можете продолжить работать с уже созданными материалами, но новые AI-действия временно недоступны.
            </p>
          )}
          {aiIsLow && (
            <p className={s.alertText}>
              Этого хватит примерно на несколько крупных генераций или на большое количество сообщений в диалоге.
            </p>
          )}
          <button className={s.disabledButton} type="button" disabled>Пополнить AI-баланс скоро</button>
        </article>

        <article className={s.projectsCard}>
          <div className={s.cardHeader}>
            <span>Проекты</span>
            {projectsEmpty && <b>лимит закончился</b>}
          </div>
          <div className={s.balanceValue}>
            {formatLimitNumber(limits.projectsRemaining)} из {formatLimitNumber(limits.projectsTotal)} проектов доступно
          </div>
          <div className={s.progressTrack} aria-hidden="true">
            <div className={s.progressBar} style={{ width: `${projectsPercent}%` }} />
          </div>
          <p>Проект — это отдельное направление, ниша, продукт или сегмент аудитории.</p>
          <Link className={projectsEmpty ? s.secondaryButton : s.primaryButton} to={projectsEmpty ? appPath('/pricing') : appPath('/dashboard')}>
            {projectsEmpty ? 'Изменить тариф' : 'Создать проект'}
          </Link>
        </article>
      </section>

      <section className={s.section}>
        <div className={s.sectionIntro}>
          <h3>Сколько ещё можно создать в этом месяце</h3>
          <p>Это расчёт от текущего остатка AI-баланса. Если весь остаток потратить только на один тип действия, вы сможете создать примерно столько материалов.</p>
        </div>
        <div className={s.capacityGrid}>
          {capacityGroups.map((group) => (
            <article className={s.capacityGroup} key={group.title}>
              <h4>{group.title}</h4>
              <div className={s.capacityList}>
                {group.items.map((actionKey) => {
                  const item = priceByAction.get(actionKey);
                  if (!item) return null;
                  const remainingCount = getCapacityCount(limits.aiBalanceRemaining, item.aiPoints);
                  const totalCount = getCapacityCount(limits.aiBalanceTotal, item.aiPoints);
                  const capacityPercent = totalCount > 0
                    ? Math.min(100, Math.max(0, (remainingCount / totalCount) * 100))
                    : 0;

                  return (
                    <div className={s.capacityItem} key={actionKey}>
                      <div className={s.capacityTopline}>
                        <span>{item.actionLabel}</span>
                        <strong>{formatLimitNumber(remainingCount)} осталось</strong>
                      </div>
                      <div className={s.capacityMeta}>
                        <span>{formatLimitNumber(item.aiPoints)} AI-баллов за 1 действие</span>
                        <span>до {formatLimitNumber(totalCount)} на тарифе</span>
                      </div>
                      <div className={s.capacityTrack} aria-hidden="true">
                        <div className={s.capacityBar} style={{ width: `${capacityPercent}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={s.section}>
        <div className={s.sectionIntro}>
          <h3>История списаний</h3>
        </div>
        {billing.usageHistory.length === 0 ? (
          <div className={s.emptyHistory}>
            <h4>Пока списаний нет</h4>
            <p>Когда вы начнёте создавать материалы с помощью ИИ, история появится здесь.</p>
          </div>
        ) : (
          <div className={s.tableWrap}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Действие</th>
                  <th>Раздел</th>
                  <th>Списано</th>
                </tr>
              </thead>
              <tbody>
                {billing.usageHistory.map((item) => (
                  <tr key={item.id}>
                    <td>{formatHistoryDate(item.createdAt)}</td>
                    <td>{item.actionLabel}</td>
                    <td>{item.sectionLabel}</td>
                    <td>{formatLimitNumber(item.aiPointsCharged)} AI-баллов</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={s.helpCard}>
        <h3>Что означает AI-баланс</h3>
        <p>AI-баланс — это ресурс вашего тарифа для работы с искусственным интеллектом.</p>
        <p>Он расходуется, когда вы создаёте или дорабатываете материалы с помощью AI: пишете в диалог, собираете стратегию, создаёте продукты, офферы, посты, статьи, сценарии и контент-планы.</p>
        <p>Простые действия списывают меньше баллов. Большие сборки стратегии и продуктов списывают больше баллов.</p>
        <p>Просмотр уже созданных материалов, переходы по разделам и ручное редактирование текста AI-баланс не расходуют.</p>
      </section>

      <LegalInfoBlock />
    </div>
  );
}
