import { FormEvent, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';
import { billingApi, BillingScenario } from '../../api/billing.api';
import { useSeo } from '../../utils/seo';
import styles from './PlatformLanding.module.css';

type PlatformPlan = {
  id: string;
  scenario: BillingScenario;
  name: string;
  price: number;
  period: string;
  description: string;
  features: string[];
  badge?: string;
  buttonText: string;
};

type LeadForm = {
  name: string;
  email: string;
  contact: string;
  plan: string;
  comment: string;
};

const platformPlans: PlatformPlan[] = [
  {
    id: 'start',
    scenario: 'self',
    name: 'Start',
    price: 12000,
    period: 'в месяц',
    description: 'Для эксперта, который хочет собрать первую упаковку и начать регулярно делать контент.',
    features: [
      '1 проект / 1 направление',
      'AI-разработка целевой аудитории и JTBD-сегмента',
      'Позиционирование',
      'Продуктовая линейка: бесплатный продукт, недорогой продукт, основной продукт',
      'Оффер для основного продукта',
      'Контент-план на 7 дней',
      'До 50 контент-единиц в месяц',
      'Посты для Telegram / VK',
      'Сценарии Reels / Shorts',
      'AI-чат по проекту',
      'База инструкций',
    ],
    buttonText: 'Выбрать Start',
  },
  {
    id: 'pro',
    scenario: 'self',
    name: 'Pro',
    price: 24000,
    period: 'в месяц',
    description: 'Для эксперта, который хочет системно вести контент и развивать несколько продуктов.',
    features: [
      'До 3 проектов / направлений',
      'Расширенная AI-упаковка целевой аудитории',
      'Позиционирование под каждый сегмент',
      'Продуктовая линейка под каждый проект',
      'Офферы для продуктов',
      'Контент-план на 30 дней',
      'До 150 контент-единиц в месяц',
      'Посты, Reels, Shorts, Threads',
      'Сценарии YouTube-видео',
      'Прогревы на 5–7 дней',
      'AI-чат по каждому проекту',
      'Экспорт материалов',
    ],
    badge: 'Популярный',
    buttonText: 'Выбрать Pro',
  },
  {
    id: 'expert',
    scenario: 'self',
    name: 'Expert',
    price: 39000,
    period: 'в месяц',
    description: 'Для эксперта, у которого несколько направлений, продуктов или помощник в команде.',
    features: [
      'До 7 проектов / направлений',
      'Глубокая упаковка каждого сегмента',
      'Несколько продуктовых линеек',
      'Офферы, лид-магниты, мини-продукты, основные продукты',
      'Контент-план на 30 дней по каждому проекту',
      'До 350 контент-единиц в месяц',
      'Посты, Reels, Shorts, Threads, YouTube',
      'Лонгриды и статьи',
      'Прогревы и мини-запуски',
      'Задачи по маркетингу внутри проекта',
      'Доступ для ассистента / сотрудника',
    ],
    buttonText: 'Выбрать Expert',
  },
  {
    id: 'support',
    scenario: 'support',
    name: 'Support',
    price: 39000,
    period: 'в месяц',
    description: 'Для эксперта, который хочет сам работать в сервисе, но получать обратную связь маркетолога.',
    features: [
      'Всё из тарифа Pro',
      'До 3 проектов / направлений',
      'Проверка упаковки маркетологом',
      'Проверка продуктовой линейки',
      'Проверка офферов',
      'Обратная связь по контенту',
      'Помощь с контент-планом',
      '1 индивидуальный созвон в месяц',
      'Поддержка в чате',
      'Рекомендации по Telegram / VK',
      'План задач на месяц',
    ],
    buttonText: 'Выбрать Support',
  },
  {
    id: 'marketing_partner',
    scenario: 'support',
    name: 'Marketing Partner',
    price: 59000,
    period: 'в месяц',
    description: 'Для эксперта, которому нужен маркетолог рядом для регулярного внедрения.',
    features: [
      'Всё из тарифа Expert',
      'До 5 проектов / направлений',
      'Совместная разработка стратегии',
      'Совместная сборка продуктовой линейки',
      'Совместная разработка офферов',
      'Контент-план на месяц',
      'Помощь в создании постов и сценариев',
      'Редактура контента маркетологом',
      '2–4 созвона в месяц',
      'Еженедельный план задач',
      'ТЗ на лендинг',
      'ТЗ на чатбот',
      'Рекомендации по оформлению соцсетей',
      'Поддержка в чате',
    ],
    badge: 'Оптимальный выбор',
    buttonText: 'Выбрать Marketing Partner',
  },
  {
    id: 'implementation',
    scenario: 'support',
    name: 'Implementation',
    price: 89000,
    period: 'в месяц',
    description: 'Для эксперта, который хочет, чтобы маркетолог активно помогал внедрять систему продвижения.',
    features: [
      'Всё из тарифа Marketing Partner',
      'До 7 проектов / направлений',
      'Глубокая упаковка экспертности',
      'Разработка воронки',
      'Разработка лид-магнита / мини-продукта / практикума',
      'Контент-план на месяц',
      'Помощь в производстве контента',
      'Подготовка структуры лендинга',
      'Подготовка текстов для лендинга',
      'Помощь со сборкой чатбота во внешнем сервисе',
      'Помощь с упаковкой Telegram / VK',
      'Контроль внедрения по задачам',
      'Еженедельные созвоны',
      'Приоритетная поддержка',
    ],
    buttonText: 'Выбрать Implementation',
  },
];

const audienceCards = [
  'Психологи и специалисты помогающих практик',
  'Нутрициологи и wellness-эксперты',
  'Коучи и наставники',
  'Консультанты и методологи',
  'Преподаватели и авторы курсов',
  'Эксперты, которые хотят выйти в онлайн или усилить продвижение',
];

const problems = [
  'Непонятно, какую аудиторию выбрать.',
  'Сложно объяснить, чем вы отличаетесь от других экспертов.',
  'Есть много знаний, но нет понятной продуктовой линейки.',
  'Контент создаётся хаотично и не ведёт к продажам.',
  'Каждый пост приходится придумывать с нуля.',
  'Непонятно, что вести: Telegram, VK, Reels, Shorts, YouTube или Threads.',
  'Нет единого плана: что делать сегодня, завтра и в течение месяца.',
  'Сложно собрать воронку из контента, лид-магнита, мини-продукта и основного продукта.',
];

const solutionSteps = [
  'Разработать стратегию',
  'Определить целевую аудиторию',
  'Сформулировать позиционирование',
  'Собрать продуктовую линейку',
  'Создать офферы',
  'Подготовить контент-план',
  'Генерировать посты, сценарии и статьи',
  'Вести задачи по продвижению',
  'Работать с AI-чатом по проекту',
];

const workflowSteps = [
  ['Создаёте проект', 'Проект — это отдельное направление, ниша, продукт или сегмент аудитории.'],
  ['Заполняете данные о себе и своей экспертности', 'Платформа собирает контекст, чтобы AI работал с учётом вашей ниши, опыта и задач.'],
  ['Разрабатываете стратегию', 'Luma IQ помогает сформулировать аудиторию, боли, желания, JTBD, позиционирование и ключевые смыслы.'],
  ['Собираете продуктовую линейку', 'Платформа помогает создать бесплатный продукт, мини-продукт, основной продукт, офферы и связку между ними.'],
  ['Создаёте контент', 'Посты, Reels, Shorts, Threads, YouTube-сценарии, статьи, лонгриды, прогревы и контент-планы.'],
  ['Ведёте задачи', 'Сервис помогает превратить стратегию в конкретные действия: что сделать, что опубликовать, что доработать.'],
];

const modules = [
  ['Проекты', 'Хранит отдельные направления, ниши и продуктовые стратегии.'],
  ['AI-чат', 'Помогает обсуждать проект с учётом собранного контекста.'],
  ['О себе', 'Собирает экспертность, опыт, подход и сильные стороны.'],
  ['Позиционирование', 'Помогает сформулировать, кто вы, для кого и чем отличаетесь.'],
  ['Целевая аудитория', 'Помогает определить сегменты, боли, желания и JTBD.'],
  ['Создание УТП', 'Помогает сформулировать сильное предложение.'],
  ['Оформление соцсетей', 'Помогает подготовить описание, шапку профиля и структуру аккаунта.'],
  ['Основной продукт', 'Помогает собрать главный продукт или сопровождение.'],
  ['Мини-продукт', 'Помогает создать недорогой входной продукт.'],
  ['Лид-магнит', 'Помогает создать бесплатный продукт для привлечения аудитории.'],
  ['Посты', 'Генерирует контент под выбранную стратегию.'],
  ['План задач', 'Помогает вести действия по продвижению.'],
];

const deliverables = [
  'Позиционирование эксперта',
  'Описание целевой аудитории',
  'JTBD-сегменты',
  'УТП',
  'Продуктовая линейка',
  'Бесплатный продукт',
  'Мини-продукт',
  'Основной продукт',
  'Офферы',
  'Контент-план',
  'Посты для Telegram и VK',
  'Сценарии Reels и Shorts',
  'Threads-треды',
  'YouTube-сценарии',
  'Лонгриды и статьи',
  'Прогревы',
  'ТЗ на лендинг',
  'ТЗ на чатбот',
  'План задач по продвижению',
];

const planGuide = [
  ['Хочу попробовать платформу и собрать первую упаковку', 'Start'],
  ['Хочу регулярно вести контент и развивать несколько продуктов', 'Pro'],
  ['У меня несколько направлений или помощник в команде', 'Expert'],
  ['Хочу сам работать, но получать обратную связь маркетолога', 'Support'],
  ['Хочу маркетолога рядом для регулярного внедрения', 'Marketing Partner'],
  ['Хочу активную помощь во внедрении системы продвижения', 'Implementation'],
];

const comparisonRows = [
  ['Идеи хранятся в разных документах', 'Вся стратегия хранится в одном проекте'],
  ['AI не помнит контекст', 'AI работает с данными вашего проекта'],
  ['Каждый пост нужно придумывать заново', 'Контент создаётся на основе стратегии'],
  ['Продукты собираются хаотично', 'Продуктовая линейка выстраивается последовательно'],
  ['Нет плана действий', 'Есть задачи и контент-план'],
  ['Нужно самому соединять стратегию, контент и продажи', 'Платформа ведёт по шагам'],
];

const aiNotes = [
  'AI-материалы нужно проверять перед публикацией.',
  'Платформа не гарантирует заявки, продажи или рост дохода.',
  'Результат зависит от вашей экспертности, ниши, качества внедрения и регулярности действий.',
  'Сервис помогает создать систему, но не заменяет профессиональную ответственность эксперта.',
  'Для тарифов с сопровождением маркетолог помогает улучшать материалы и внедрение, но тоже не гарантирует конкретный коммерческий результат.',
];

const faq = [
  ['Чем Luma IQ отличается от обычного ChatGPT?', 'Обычный AI-чат каждый раз требует заново объяснять контекст. В Luma IQ работа строится вокруг проекта: целевая аудитория, позиционирование, продуктовая линейка, офферы и контент связаны между собой.'],
  ['Можно ли использовать платформу, если я не психолог?', 'Да. Luma IQ подходит разным экспертам: нутрициологам, коучам, консультантам, наставникам, преподавателям, авторам курсов и другим специалистам, которые продают знания, консультации или сопровождение.'],
  ['Нужно ли мне разбираться в маркетинге?', 'Нет, платформа ведёт по шагам. Но чем внимательнее вы заполняете данные о себе, аудитории и продуктах, тем полезнее становятся результаты.'],
  ['Что такое проект?', 'Проект — это отдельное направление, ниша, продукт или сегмент аудитории. Например, один эксперт может создать отдельные проекты под разные аудитории или продукты.'],
  ['Что такое credits?', 'Credits — это внутренняя единица платформы, которая используется для учёта AI-действий: генераций, сообщений, стратегий, контент-планов и других операций.'],
  ['Что такое контент-единицы?', 'Контент-единица — это условная единица результата. Например, пост, сценарий короткого видео, тред, статья или элемент контент-плана.'],
  ['Можно ли перейти на другой тариф?', 'Да, тариф можно изменить. Переход на более высокий тариф может быть доступен сразу после доплаты, а переход на более низкий — со следующего расчётного периода.'],
  ['Что будет, если я исчерпаю лимиты?', 'Вы сможете дождаться обновления лимитов в следующем периоде или перейти на более высокий тариф.'],
  ['Можно ли работать с маркетологом?', 'Да. Для этого есть тарифы с сопровождением: Support, Marketing Partner и Implementation.'],
  ['Входит ли сборка лендинга и чатбота?', 'В базовых тарифах платформа помогает подготовить структуру, тексты и ТЗ. В тарифах с сопровождением маркетолог может помогать с внедрением. Внешние сервисы для лендингов, чатботов, CRM и рекламы оплачиваются отдельно, если иное не согласовано индивидуально.'],
  ['Можно ли отменить подписку?', 'Да, условия отмены подписки и возвратов регулируются офертой и выбранным способом оплаты.'],
  ['Гарантируете ли вы заявки и продажи?', 'Нет. Luma IQ помогает собрать систему продвижения, но не гарантирует конкретное количество заявок, продаж, подписчиков или дохода. Результат зависит от ниши, предложения, внедрения, регулярности действий и других факторов.'],
  ['Кому принадлежат созданные материалы?', 'Материалы, созданные внутри сервиса на основе ваших данных, можно использовать в вашей профессиональной и коммерческой деятельности. Перед публикацией вы самостоятельно проверяете корректность, этичность и правомерность материалов.'],
];

function formatPrice(value: number) {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value);
}

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export default function PlatformLanding() {
  const [scenario, setScenario] = useState<BillingScenario>('self');
  const [plans, setPlans] = useState(platformPlans);
  const [modalOpen, setModalOpen] = useState(false);
  const [leadForm, setLeadForm] = useState<LeadForm>({
    name: '',
    email: '',
    contact: '',
    plan: 'Start',
    comment: '',
  });

  useSeo({
    title: 'Luma IQ Platform — AI-платформа для упаковки, продуктов и контента экспертов',
    description: 'Luma IQ помогает экспертам собрать маркетинговую упаковку, продуктовую линейку, офферы, контент-план и материалы для продвижения с помощью AI.',
    canonical: '/platform',
    type: 'website',
  });

  useEffect(() => {
    billingApi.listPlans()
      .then((backendPlans) => {
        setPlans((current) => current.map((plan) => {
          const backendPlan = backendPlans.find((item) => item.id === plan.id);
          return backendPlan ? { ...plan, price: backendPlan.priceMonthlyRub } : plan;
        }));
      })
      .catch(() => {
        setPlans(platformPlans);
      });
  }, []);

  const visiblePlans = useMemo(
    () => plans.filter((plan) => plan.scenario === scenario),
    [plans, scenario],
  );

  const openLeadModal = (planName: string) => {
    setLeadForm((current) => ({ ...current, plan: planName }));
    setModalOpen(true);
  };

  const submitLead = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setModalOpen(false);
    toast.success('Заявка отправлена. Мы свяжемся с вами в ближайшее время.');
    setLeadForm({ name: '', email: '', contact: '', plan: 'Start', comment: '' });
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.logo} to="/platform" aria-label="Luma IQ Platform">
          <span className={styles.logoMark}>✦</span>
          <span>LumaIQ</span>
        </Link>
        <nav className={styles.nav} aria-label="Навигация по лендингу">
          <a href="#how-it-works">Как работает</a>
          <a href="#modules">Модули</a>
          <a href="#pricing">Тарифы</a>
          <a href="#faq">FAQ</a>
        </nav>
        <button className={styles.headerButton} type="button" onClick={() => scrollToSection('pricing')}>
          Выбрать тариф
        </button>
      </header>

      <main>
        <section className={`${styles.section} ${styles.hero}`}>
          <div className={styles.container}>
            <div className={styles.heroGrid}>
              <div className={styles.heroText}>
                <p className={styles.eyebrow}>LUMA IQ PLATFORM</p>
                <h1>Соберите маркетинговую систему эксперта с помощью AI</h1>
                <p className={styles.heroLead}>
                  Luma IQ помогает превратить вашу экспертность в понятную упаковку, продуктовую линейку и регулярный контент — без хаоса в документах, таблицах и отдельных AI-чатах.
                </p>
                <ul className={styles.heroBullets}>
                  <li>Определите целевую аудиторию и позиционирование</li>
                  <li>Соберите продукты, офферы и воронку</li>
                  <li>Создавайте посты, Reels, Shorts, Threads и YouTube-сценарии по единой стратегии</li>
                </ul>
                <div className={styles.heroActions}>
                  <button className={styles.primaryButton} type="button" onClick={() => scrollToSection('pricing')}>Выбрать тариф</button>
                  <button className={styles.secondaryButton} type="button" onClick={() => scrollToSection('how-it-works')}>Посмотреть, как работает платформа</button>
                </div>
              </div>

              <div className={styles.productPreview} aria-label="Превью интерфейса Luma IQ">
                <div className={styles.previewChrome}>
                  <span />
                  <span />
                  <span />
                </div>
                <div className={styles.previewHeader}>
                  <div>
                    <span className={styles.previewLabel}>Проект эксперта</span>
                    <strong>Маркетинговая система</strong>
                    <p>Упаковка, продукты, контент и задачи в одном контексте.</p>
                  </div>
                  <div className={styles.previewBadges} aria-label="Статус проекта">
                    <span>Credits 148</span>
                    <span>Pro</span>
                    <span>AI ready</span>
                  </div>
                </div>
                <div className={styles.previewBody}>
                  <div className={`${styles.previewCard} ${styles.previewCardWide}`}>
                    <div>
                      <span>AI-чат</span>
                      <p>Подготовить оффер для мини-продукта на основе сегмента ЦА.</p>
                    </div>
                    <b>Ответ готов</b>
                  </div>
                  <div className={styles.previewCard}>
                    <span>Целевая аудитория</span>
                    <p>3 сегмента, JTBD, боли и критерии выбора.</p>
                  </div>
                  <div className={styles.previewCard}>
                    <span>Продуктовая линейка</span>
                    <p>Лидмагнит, мини-продукт, основной продукт.</p>
                  </div>
                  <div className={styles.previewCard}>
                    <span>Контент-план</span>
                    <p>Telegram, Reels, Threads и YouTube на неделю.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <PlatformSection
          id="audience"
          eyebrow="Для кого"
          title="Для экспертов, которые продают знания, консультации, сопровождение или обучающие продукты"
        >
          <div className={styles.cardGrid}>
            {audienceCards.map((item) => <article className={styles.smallCard} key={item}>{item}</article>)}
          </div>
        </PlatformSection>

        <PlatformSection
          eyebrow="Проблема"
          title="Большинство экспертов застревают не из-за слабой экспертности, а из-за хаоса в маркетинге"
        >
          <div className={styles.problemGrid}>
            {problems.map((item) => <div className={styles.problemItem} key={item}>{item}</div>)}
          </div>
        </PlatformSection>

        <PlatformSection
          eyebrow="Решение"
          title="Luma IQ собирает маркетинговую систему эксперта шаг за шагом"
          description="Платформа не просто генерирует тексты. Она помогает пройти путь от стратегии до регулярного контента и задач по продвижению."
        >
          <div className={styles.stepGrid}>
            {solutionSteps.map((item, index) => (
              <article className={styles.stepCard} key={item}>
                <span>{index + 1}</span>
                <p>{item}</p>
              </article>
            ))}
          </div>
        </PlatformSection>

        <PlatformSection id="how-it-works" eyebrow="Процесс" title="Как вы работаете в Luma IQ">
          <div className={styles.timeline}>
            {workflowSteps.map(([title, text], index) => (
              <article className={styles.timelineItem} key={title}>
                <span>Шаг {index + 1}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </PlatformSection>

        <PlatformSection id="modules" eyebrow="Модули" title="Что входит в платформу">
          <div className={styles.moduleGrid}>
            {modules.map(([title, text]) => (
              <article className={styles.moduleCard} key={title}>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </PlatformSection>

        <PlatformSection
          eyebrow="Результаты"
          title="В Luma IQ вы создаёте не “тексты ради текстов”, а материалы для продвижения и продаж"
        >
          <div className={styles.tagCloud}>
            {deliverables.map((item) => <span key={item}>{item}</span>)}
          </div>
        </PlatformSection>

        <PlatformSection eyebrow="Форматы" title="Выберите формат: самостоятельно или с сопровождением маркетолога">
          <div className={styles.formatGrid}>
            <article className={styles.formatCard}>
              <h3>Самостоятельно</h3>
              <p>Для экспертов, которые хотят сами работать в платформе, собирать стратегию, продукты и контент с помощью AI.</p>
              <ul>
                <li>вы хотите разобраться самостоятельно;</li>
                <li>вам нужен инструмент, а не агентство;</li>
                <li>вы готовы сами внедрять рекомендации;</li>
                <li>вам важно регулярно создавать контент.</li>
              </ul>
            </article>
            <article className={styles.formatCard}>
              <h3>С сопровождением</h3>
              <p>Для экспертов, которым нужен маркетолог рядом: чтобы проверять упаковку, помогать с контентом, продуктами, лендингом, чатботом и задачами.</p>
              <ul>
                <li>вы не хотите разбираться в маркетинге в одиночку;</li>
                <li>вам нужна обратная связь;</li>
                <li>вам важно быстрее внедрять;</li>
                <li>вы хотите, чтобы специалист помогал собирать систему.</li>
              </ul>
            </article>
          </div>
        </PlatformSection>

        <section className={`${styles.section} ${styles.pricingSection}`} id="pricing">
          <div className={styles.container}>
            <div className={styles.sectionHead}>
              <p className={styles.eyebrow}>Тарифы</p>
              <h2>Выберите тариф Luma IQ</h2>
              <p>Начните самостоятельно или подключите сопровождение маркетолога, чтобы быстрее собрать и внедрить систему продвижения.</p>
            </div>
            <div className={styles.tabs} role="tablist" aria-label="Формат работы">
              <button className={scenario === 'self' ? styles.tabActive : ''} type="button" onClick={() => setScenario('self')}>Самостоятельно</button>
              <button className={scenario === 'support' ? styles.tabActive : ''} type="button" onClick={() => setScenario('support')}>С сопровождением</button>
            </div>
            <div className={styles.pricingGrid}>
              {visiblePlans.map((plan) => (
                <article className={`${styles.planCard} ${plan.badge ? styles.planHighlighted : ''}`} key={plan.id}>
                  {plan.badge && <span className={styles.badge}>{plan.badge}</span>}
                  <h3>{plan.name}</h3>
                  <div className={styles.price}>{formatPrice(plan.price)} ₽ <span>/ {plan.period}</span></div>
                  <p>{plan.description}</p>
                  <ul>
                    {plan.features.map((feature) => <li key={feature}>{feature}</li>)}
                  </ul>
                  <button className={styles.primaryButton} type="button" onClick={() => openLeadModal(plan.name)}>{plan.buttonText}</button>
                </article>
              ))}
            </div>
            <div className={styles.customBox}>
              <div>
                <h3>Нужен индивидуальный формат?</h3>
                <p>Если вам нужно полностью делегировать упаковку, контент, лендинг, чатбот и внедрение воронки, оставьте заявку, и мы подберём формат сопровождения под вашу задачу.</p>
              </div>
              <button className={styles.secondaryButton} type="button" onClick={() => openLeadModal('Индивидуальный формат')}>Обсудить индивидуальный формат</button>
            </div>
          </div>
        </section>

        <PlatformSection eyebrow="Выбор" title="Какой тариф выбрать">
          <div className={styles.choiceList}>
            {planGuide.map(([task, plan]) => (
              <div className={styles.choiceRow} key={task}>
                <span>{task}</span>
                <strong>{plan}</strong>
              </div>
            ))}
          </div>
        </PlatformSection>

        <PlatformSection
          eyebrow="Сравнение"
          title="Luma IQ заменяет хаотичную работу с десятками таблиц, документов и отдельных AI-чатов"
        >
          <div className={styles.compareGrid}>
            <div className={styles.compareHead}>Без Luma IQ</div>
            <div className={styles.compareHead}>С Luma IQ</div>
            {comparisonRows.map(([before, after]) => (
              <div className={styles.comparePair} key={before}>
                <p>{before}</p>
                <p>{after}</p>
              </div>
            ))}
          </div>
        </PlatformSection>

        <PlatformSection
          eyebrow="Важно"
          title="AI помогает быстрее думать, структурировать и создавать материалы, но финальное решение остаётся за вами"
        >
          <div className={styles.noteList}>
            {aiNotes.map((note) => <div key={note}>{note}</div>)}
          </div>
        </PlatformSection>

        <PlatformSection id="faq" eyebrow="FAQ" title="Частые вопросы">
          <div className={styles.faqList}>
            {faq.map(([question, answer]) => (
              <details className={styles.faqItem} key={question}>
                <summary>{question}</summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </PlatformSection>

        <section className={`${styles.section} ${styles.finalCta}`}>
          <div className={styles.container}>
            <h2>Соберите маркетинговую систему эксперта в Luma IQ</h2>
            <p>Выберите самостоятельный тариф или формат с сопровождением маркетолога и начните собирать стратегию, продукты и контент в одном личном кабинете.</p>
            <div className={styles.heroActions}>
              <button className={styles.primaryButton} type="button" onClick={() => scrollToSection('pricing')}>Выбрать тариф</button>
              <button className={styles.secondaryButton} type="button" onClick={() => openLeadModal('Сопровождение маркетолога')}>Обсудить сопровождение</button>
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.container}>
          <Link className={styles.logo} to="/platform" aria-label="Luma IQ Platform">
            <span className={styles.logoMark}>✦</span>
            <span>LumaIQ</span>
          </Link>
          <nav aria-label="Юридические ссылки">
            <Link to="/legal/offer">Оферта</Link>
            <Link to="/legal/privacy-policy">Политика обработки персональных данных</Link>
            <Link to="/legal/personal-data">Согласие на обработку персональных данных</Link>
            <Link to="/legal/ai-terms">Условия использования AI</Link>
            <a href="#pricing">Тарифы и лимиты</a>
            <Link to="/contacts">Контакты</Link>
          </nav>
        </div>
      </footer>

      {modalOpen && (
        <div className={styles.modalOverlay} role="presentation" onMouseDown={() => setModalOpen(false)}>
          <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="lead-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className={styles.modalClose} type="button" aria-label="Закрыть" onClick={() => setModalOpen(false)}>×</button>
            <h2 id="lead-title">Оставьте заявку на подключение тарифа</h2>
            <p>Оплата подписки будет подключена на следующем этапе. Сейчас вы можете оставить заявку, и мы свяжемся с вами для подключения подходящего тарифа.</p>
            <form className={styles.leadForm} onSubmit={submitLead}>
              <label>
                Имя
                <input value={leadForm.name} onChange={(event) => setLeadForm({ ...leadForm, name: event.target.value })} required />
              </label>
              <label>
                Email
                <input type="email" value={leadForm.email} onChange={(event) => setLeadForm({ ...leadForm, email: event.target.value })} required />
              </label>
              <label>
                Telegram или телефон
                <input value={leadForm.contact} onChange={(event) => setLeadForm({ ...leadForm, contact: event.target.value })} required />
              </label>
              <label>
                Выбранный тариф
                <select value={leadForm.plan} onChange={(event) => setLeadForm({ ...leadForm, plan: event.target.value })}>
                  {[...platformPlans.map((plan) => plan.name), 'Индивидуальный формат', 'Сопровождение маркетолога'].map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </label>
              <label>
                Комментарий
                <textarea value={leadForm.comment} onChange={(event) => setLeadForm({ ...leadForm, comment: event.target.value })} rows={4} />
              </label>
              <button className={styles.primaryButton} type="submit">Оставить заявку</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function PlatformSection({
  id,
  eyebrow,
  title,
  description,
  children,
}: {
  id?: string;
  eyebrow: string;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={styles.section} id={id}>
      <div className={styles.container}>
        <div className={styles.sectionHead}>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {children}
      </div>
    </section>
  );
}
