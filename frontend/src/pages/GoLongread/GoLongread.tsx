import { Link } from 'react-router-dom';
import SiteFooter from '../../components/SiteFooter/SiteFooter';
import { useSeo } from '../../utils/seo';
import s from './GoLongread.module.css';

const toc = [
  'Зачем идти в Go и что реально происходит с зарплатами',
  'Где сливаются backend, frontend, mobile, новички, QA и аналитики',
  'Почему знание не равно офферу',
  'Реальные истории людей, которые прошли этот путь',
  'Что будет на карьерной диагностике',
];

const audiences = [
  {
    title: 'Middle или Senior backend-разработчик',
    text: 'Java, Python, PHP или 1С. Зарплата 200-280к, потолок понятен, а Go-вакансии выглядят интереснее. Главный барьер часто не язык, а собеседование после 2-3 лет без интервью.',
  },
  {
    title: 'Frontend или mobile-разработчик',
    text: 'Рынок сужается, а Go растёт. Но первая попытка поднять backend-проект превращается в квест: Docker, make-файлы, кодогенерация, Linux, SQL и Kafka.',
  },
  {
    title: 'Новичок, QA или аналитик',
    text: 'Курсы и pet-проекты есть, но отклики молчат. На собеседовании важно показать не заученные ответы, а реальную практику проекта и понятную самопрезентацию.',
  },
  {
    title: 'Кандидат на валютную удалёнку',
    text: 'До 5000 долларов можно искать через HH и нишевые компании. Выше начинается LinkedIn, упаковка профиля, релевантный опыт и другая стратегия поиска.',
  },
];

const reasons = [
  {
    title: 'Вилки зарплат до сих пор выше',
    text: 'Junior: около 200-250 тысяч рублей. Middle: около 280-350 тысяч. Senior: около 330-450 тысяч. Большинство Go-вакансий в среднем на 20-30% выше сопоставимых стеков.',
  },
  {
    title: 'Валютные вакансии чаще всего в Go',
    text: 'Вакансии с вилкой больше 10 000 долларов в месяц чаще встречаются именно в Go и частично Python. На Java, PHP и C# такие вилки получить сложнее.',
  },
  {
    title: 'Зрелые компании переходят на микросервисы',
    text: 'После эпохи монолитов компании всё чаще распиливают системы на микросервисы. Go для этого остаётся одним из самых удобных инструментов.',
  },
  {
    title: 'BigTech сам двигает Go',
    text: 'Митапы, школы переката, внутренние программы и инфраструктурные команды подталкивают рынок в сторону Go.',
  },
];

const barriers = [
  {
    label: 'Backend middle/senior',
    title: 'Страх собеседований',
    text: 'После нескольких лет в одной компании появляется ощущение: “я всё забыл”. Включается синдром самозванца, и подготовка растягивается на месяцы.',
  },
  {
    label: 'Frontend/mobile',
    title: 'Стена backend-инфраструктуры',
    text: 'Docker, контейнеры, make-файлы, кодогенерация, линтеры, Linux, SQL и Kafka выглядят как хаос. Нужен не героизм, а правильный маршрут.',
  },
  {
    label: 'Новички, QA, аналитики',
    title: 'Переоценка теории',
    text: 'Можно пройти десять курсов, но на техническом интервью быстро видно, есть ли рабочий код и понимание проекта.',
  },
  {
    label: 'Валютная удалёнка',
    title: 'Неправильная точка входа',
    text: 'Отклики в LinkedIn часто не работают. Важнее профиль, упаковка опыта и входящие сообщения от рекрутеров.',
  },
];

const outcomes = [
  'Выйти на 350-400к+, а не прибавлять по 10-15к в год',
  'Сделать рывок за 3-6 месяцев',
  'Понять, что спрашивают на Go-собеседованиях',
  'Закрыть конкретные пробелы, а не учить всё подряд',
  'Не выглядеть джуном при переходе из другого стека',
  'Монетизировать свой опыт, а не начинать с нуля',
];

const gifts = [
  {
    title: 'Практикум по Kafka',
    text: 'Пишем в режиме реального времени простейшие Kafka consumer и producer на Golang и проверяем работу через Kafka UI.',
    image: '/images/go-longread/35.png',
  },
  {
    title: 'Гайд по собеседованиям',
    text: 'Как разобрать неудачное собеседование без фидбека за 3 шага с AI.',
    image: '/images/go-longread/36.png',
  },
  {
    title: 'Карьерная диагностика',
    text: 'Чёткий план, что учить под ваш уровень, дорожная карта выхода на Middle/Senior и рекомендации по резюме.',
    image: '/images/go-longread/37.png',
  },
];

const earlyScreenshots = [
  '/images/go-longread/06.png',
  '/images/go-longread/07.png',
  '/images/go-longread/08.png',
  '/images/go-longread/09.png',
  '/images/go-longread/11.png',
  '/images/go-longread/13.png',
];

const offerScreenshots = [
  '/images/go-longread/20.png',
  '/images/go-longread/21.png',
  '/images/go-longread/22.png',
  '/images/go-longread/23.jpg',
  '/images/go-longread/24.png',
  '/images/go-longread/25.png',
  '/images/go-longread/26.png',
];

const reviewScreenshots = [
  '/images/go-longread/27.jpg',
  '/images/go-longread/28.jpg',
  '/images/go-longread/29.jpg',
  '/images/go-longread/30.jpg',
  '/images/go-longread/31.jpg',
  '/images/go-longread/32.jpg',
  '/images/go-longread/33.jpg',
  '/images/go-longread/34.jpg',
];

function CTA({ compact = false }: { compact?: boolean }) {
  return (
    <section className={`${s.cta}${compact ? ' ' + s.ctaCompact : ''}`} id={compact ? undefined : 'consultation'}>
      <p className={s.kicker}>Карьерная диагностика</p>
      <h2>Запишитесь на разбор и получите маршрут перехода в Go</h2>
      <p>
        Нажмите на кнопку, ответьте на несколько вопросов, и команда свяжется с вами для диагностической сессии.
      </p>
      <a className={s.primaryButton} href="#consultation">
        Записаться на диагностику
      </a>
    </section>
  );
}

export default function GoLongread() {
  useSeo({
    title: 'Почему ИТ разработчики застревают на уровне “изучаю Go”',
    description:
      'Как перекатиться из другого стека в Go за 3-6 месяцев с оффером от 250к до 500к, не теряя текущий статус.',
    canonical: '/go/page/abc',
  });

  return (
    <main className={s.page}>
      <header className={s.hero}>
        <nav className={s.topbar}>
          <Link to="/" className={s.brand}>Luma IQ</Link>
          <a href="#consultation" className={s.topCta}>Диагностика</a>
        </nav>
        <div className={s.heroCard}>
          <div className={s.heroCopy}>
            <p className={s.kicker}>Interview Hustlers longread</p>
            <h1>
              Почему ИТ разработчики <span>застревают</span> на уровне “изучаю Go” и лишают себя дополнительных 100-250к к текущей ЗП
            </h1>
            <p className={s.lead}>
              И как перекатиться из другого стека в Go за 3-6 месяцев с оффером от 250к до 500к, не увольняясь,
              не идя на 200к “ради опыта” и не теряя текущий статус.
            </p>
            <a className={s.primaryButton} href="#article">Читать статью</a>
          </div>
          <div className={s.heroVisual} aria-hidden="true">
            <img className={s.heroIcon} src="/images/go-longread/03.png" alt="" />
            <div className={s.codeWindow}>
              <span>package main</span>
              <span>func main()</span>
              <span>offer := "350k+"</span>
              <span>go career()</span>
            </div>
          </div>
        </div>
      </header>

      <article id="article" className={s.article}>
        <section className={s.intro}>
          <p>
            Вот что я вижу уже 2,5 года, пока работаю с учениками. Go — не проблема. Это один из самых простых языков на бэкенде.
            Синтаксис осваивается за 1-2 недели, Tour of Go проходится за один вечер.
          </p>
          <p>
            Проблема в другом: страх собеса после нескольких лет без интервью, неумение подать свой опыт так, чтобы HR передал резюме дальше,
            и отсутствие чёткого плана — что именно учить, в каком порядке и когда хватит.
          </p>
          <p>
            Если вы фронтендер или мобильщик, добавьте сюда стену backend-инфраструктуры: Docker, make-файлы, кодогенерация, Linux.
            Дальше разберём каждую ловушку с цифрами, кейсами и конкретикой.
          </p>
        </section>

        <section className={s.toc}>
          <p className={s.kicker}>Что будет в статье</p>
          <div className={s.tocGrid}>
            {toc.map((item, index) => (
              <div key={item} className={s.tocItem}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <p>{item}</p>
              </div>
            ))}
          </div>
        </section>

        <section className={s.author}>
          <img className={s.authorPhoto} src="/images/go-longread/04.png" alt="Макс Аверин" />
          <div>
            <p className={s.kicker}>Почему мне можно доверять</p>
            <h2>Я, Макс Аверин. Больше 8 лет в IT, больше 4 лет в Go.</h2>
            <p>
              Последние 3 года работал Senior Go разработчиком, в том числе в американской компании GoodRx с зарплатой 6500$.
              До этого — Lamoda, X5, Best Doctor, крипто-стартапы. Был тимлидом, продал ИТ-бизнес.
            </p>
            <p>
              Последние 3 года веду школу Interview Hustlers. За это время трудоустроили 210 учеников в Go и Python.
            </p>
          </div>
        </section>

        <section className={s.stats}>
          {['100+ разработчиков трудоустроились', '200к-8000$ зарплаты', '40 часов лекций', '20 часов практики'].map((stat) => (
            <div key={stat}>{stat}</div>
          ))}
        </section>

        <section className={s.mediaFeature}>
          <div>
            <p className={s.kicker}>Результаты учеников</p>
            <h2>Так выглядят офферы и подтверждения, которые появляются после системной подготовки</h2>
            <p>
              В оригинальном лонгриде эти скриншоты были частью визуального доказательства: не абстрактные обещания, а реальные
              предложения, переписки и результаты учеников.
            </p>
          </div>
          <img src="/images/go-longread/13.png" alt="Коллаж офферов учеников" />
        </section>

        <section className={s.screenshotStrip}>
          {earlyScreenshots.map((src, index) => (
            <img key={src} src={src} alt={`Скриншот результата ${index + 1}`} loading="lazy" />
          ))}
        </section>

        <section className={s.section}>
          <p className={s.kicker}>Сначала разберёмся, кто вы сейчас</p>
          <h2>Ниже всем дам план для переката с оффером в Go</h2>
          <div className={s.cards}>
            {audiences.map((item) => (
              <div key={item.title} className={s.card}>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className={s.darkSection}>
          <p className={s.kicker}>По-взрослому, с цифрами</p>
          <h2>4 причины, почему Go в 2026 — всё ещё растущий рынок</h2>
          <div className={s.reasonGrid}>
            {reasons.map((reason, index) => (
              <div key={reason.title} className={s.reason}>
                <span>{index + 1}</span>
                <h3>{reason.title}</h3>
                <p>{reason.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className={s.statement}>
          <p>А пока нужно понять одно</p>
          <strong>Знания не равны офферу</strong>
        </section>

        <section className={s.section}>
          <p className={s.kicker}>Где ломает на старте</p>
          <h2>Что учесть при перекате в Go</h2>
          <div className={s.timeline}>
            {barriers.map((item) => (
              <div key={item.title} className={s.timelineItem}>
                <span>{item.label}</span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className={s.story}>
          <p className={s.kicker}>История из практики</p>
          <p>
            У одного ученика была конкретная проблема: он постоянно извинялся после каждого ответа. Неважно, правильный ответ или нет.
            “Извините, я думаю что...” создавало ощущение неуверенности. Мы это заметили, начали следить, и он перестал.
            Через два собеседования он получил оффер. Проблема была не в знаниях, а в подаче.
          </p>
        </section>

        <section className={s.section}>
          <p className={s.kicker}>Если вы узнали себя</p>
          <h2>Ваша задача уже не “разобраться с Go”</h2>
          <p className={s.bigText}>Задача — сделать контролируемый перекат, не растягивая это на 1-2 года.</p>
          <div className={s.checkGrid}>
            {outcomes.map((item) => (
              <div key={item}>{item}</div>
            ))}
          </div>
        </section>

        <CTA />

        <section className={s.section}>
          <p className={s.kicker}>Почему “в одиночку” дольше</p>
          <h2>Мотивации хватает на 2-4 месяца, потом всё начинается заново</h2>
          <p>
            Когда вы готовитесь в одиночку, то, что можно было сделать за 3 месяца, часто растягивается на год.
            Самое важное, что ученики говорят о курсе, — это не только лекции и проект с Kafka. Это ощущение, что рядом люди в такой же ситуации,
            и они уже получили оффер.
          </p>
        </section>

        <section className={s.reviews}>
          <p className={s.kicker}>Что пишут ученики после обучения</p>
          <h2>Таких отзывов 150+</h2>
          <div className={s.reviewGrid}>
            {[
              'Получил оффер после того, как перестал распыляться и начал готовиться под конкретные интервью.',
              'Главное было понять, как упаковать прошлый опыт, чтобы он читался как релевантный для Go.',
              'Проект с Kafka и Postgres сильно поменял уверенность на технических собеседованиях.',
            ].map((review) => (
              <blockquote key={review}>{review}</blockquote>
            ))}
          </div>
        </section>

        <section className={s.offerGallery}>
          <p className={s.kicker}>Скриншоты из оригинального лонгрида</p>
          <h2>Офферы, переписки и подтверждения результатов</h2>
          <div className={s.offerGrid}>
            {offerScreenshots.map((src, index) => (
              <img key={src} src={src} alt={`Оффер ученика ${index + 1}`} loading="lazy" />
            ))}
          </div>
        </section>

        <section className={s.phoneGallery}>
          {reviewScreenshots.map((src, index) => (
            <img key={src} src={src} alt={`Отзыв ученика ${index + 1}`} loading="lazy" />
          ))}
        </section>

        <section className={s.fit}>
          <div>
            <h2>Точно подходит, если вы</h2>
            <ul>
              <li>Middle или Senior backend-разработчик и хотите перейти в Go.</li>
              <li>Frontend или mobile-разработчик и готовы закрывать backend-базу практикой.</li>
              <li>Ищете первую работу в IT и понимаете, что без проекта будет тяжело.</li>
              <li>Хотите валютную удалёнку и готовы упаковывать профиль и опыт.</li>
            </ul>
          </div>
          <div>
            <h2>Скорее не подходит, если вы</h2>
            <ul>
              <li>Ищете волшебную кнопку без собеседований и практики.</li>
              <li>Хотите только посмотреть и не планируете выходить на интервью.</li>
              <li>Не готовы уделить внимание самопрезентации и soft skills.</li>
            </ul>
          </div>
        </section>

        <section className={s.guarantees}>
          {[
            ['Это не продажный созвон', '90% времени — работа по вашей ситуации. Если пользы нет — я не предлагаю продолжение.'],
            ['Никаких манипуляций', 'Если перекат в 3-6 месяцев нереалистичен — я скажу прямо.'],
            ['Только стратегия', 'Если нужен просто язык — YouTube бесплатный. Если нужен рывок — нужна стратегия.'],
          ].map(([title, text]) => (
            <div key={title}>
              <h3>{title}</h3>
              <p>{text}</p>
            </div>
          ))}
        </section>

        <section className={s.finalText}>
          <p>
            Если вы дочитали до этого места — значит, тема вас зацепила не случайно. Скорее всего, вы устали от советов “просто учи Go”
            и хотите более взрослый ответ: сколько времени займёт переход именно у вас и что нужно докрутить, чтобы рынок купил ваш опыт.
          </p>
          <p>
            После консультации вы можете прийти к одному из двух выводов: “Да, переход в Go реалистичен” или “Нет, сейчас мне выгоднее другая стратегия”.
            В обоих случаях вы выигрываете, потому что вместо тревоги появляется конкретика.
          </p>
        </section>

        <section className={s.gifts}>
          <p className={s.kicker}>За запись на диагностику</p>
          <h2>Вы получите 3 подарка</h2>
          <div className={s.giftGrid}>
            {gifts.map((gift) => (
              <div key={gift.title} className={s.gift}>
                <img src={gift.image} alt={gift.title} loading="lazy" />
                <span>Подарок</span>
                <h3>{gift.title}</h3>
                <p>{gift.text}</p>
              </div>
            ))}
          </div>
        </section>

        <CTA compact />
      </article>

      <SiteFooter />
    </main>
  );
}
