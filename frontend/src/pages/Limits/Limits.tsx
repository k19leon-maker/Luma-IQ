import { Link } from 'react-router-dom';
import LegalInfoBlock from '../../components/LegalInfoBlock/LegalInfoBlock';
import { useBillingMe } from '../../components/UsageLimits/UsageLimits';
import { appPath } from '../../utils/appRoutes';
import { formatLimitNumber } from '../../utils/planLimits';
import s from './Limits.module.css';

const capacityRows = [
  ['Сообщение в диалоге с ИИ', '1 балл'],
  ['Пост или рилс', '5-7 баллов'],
  ['Статья или лонгрид', '30 баллов'],
  ['Раздел стратегии', '15-25 баллов'],
  ['Основной продукт', '60 баллов'],
  ['Мини-продукт', '80 баллов'],
  ['Лид-магнит', '70 баллов'],
  ['Полная пересборка стратегии', '100 баллов'],
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
          <h3>На что хватит AI-баланса</h3>
          <p>Разные действия используют разное количество AI-баллов. Простое сообщение в диалоге стоит меньше, чем сборка продукта или полноценной стратегии.</p>
        </div>
        <div className={s.costGrid}>
          {capacityRows.map(([label, cost]) => (
            <div className={s.costRow} key={label}>
              <span>{label}</span>
              <strong>{cost}</strong>
            </div>
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
