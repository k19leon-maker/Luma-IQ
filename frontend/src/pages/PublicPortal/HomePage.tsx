import { Link } from 'react-router-dom';
import {
  articles,
  experts,
  problems,
  programs,
  tests,
  webinars,
} from '../../data/public/content';
import { breadcrumbSchema, useSeo } from '../../utils/seo';
import s from './PublicPortal.module.css';

export default function HomePage() {
  useSeo({
    title: 'Психологическая помощь и программы',
    description: 'Luma IQ помогает найти решение жизненных и психологических трудностей через современные психологические программы и специалистов.',
    canonical: '/',
    schema: breadcrumbSchema([{ name: 'Главная', url: '/' }]),
  });

  return (
    <main>
      <section className={s.hero}>
        <div className={s.heroInner}>
          <div className={s.heroContent}>
            <div className={s.eyebrow}>Психологический портал Luma IQ</div>
            <h1>Помогаем найти решение жизненных и психологических трудностей через современные психологические программы и специалистов.</h1>
            <p className={s.lead}>
              Развод, отношения, тревога, выгорание, конфликты, самооценка, подростки и другие жизненные ситуации.
            </p>
            <p className={s.heroNote}>
              Ответьте на несколько вопросов и получите подходящие материалы, программы и направления помощи.
            </p>
            <div className={s.actions}>
              <Link className={s.primaryBtn} to="/diagnostics/ai-psychologist">Пройти диагностику с ИИ психологом <span>→</span></Link>
              <Link className={s.secondaryBtn} to="/articles">Изучить материалы</Link>
            </div>
            <div className={s.trustGrid}>
              <div>
                <strong>10+</strong>
                <span>жизненных ситуаций</span>
              </div>
              <div>
                <strong>3</strong>
                <span>диагностики</span>
              </div>
              <div>
                <strong>3</strong>
                <span>программы</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <Section eyebrow="Направления помощи" title="С какими трудностями помогаем" text="Выберите ситуацию, чтобы перейти на отдельную SEO-страницу проблемы и увидеть подходящие материалы, программы и будущие диагностики.">
        <div className={s.problemGrid}>
          {problems.slice(0, 10).map((problem) => (
            <Link key={problem.slug} to={`/problems/${problem.slug}`} className={s.problemCard}>
              <span className={s.cardIcon}>•</span>
              <h3>{problem.name}</h3>
              <p>{problem.description}</p>
              <span className={s.cardLink}>Открыть <span>→</span></span>
            </Link>
          ))}
        </div>
      </Section>

      <div className={s.band}>
        <Section eyebrow="Материалы" title="Последние статьи" text="Тестовые материалы показывают будущую структуру информационного портала.">
          <CardGrid items={articles} basePath="/articles" getTitle={(item) => item.title} getText={(item) => item.excerpt} getMeta={(item) => item.author} />
        </Section>
      </div>

      <Section eyebrow="Специалисты" title="Специалисты" text="В будущем здесь появятся анкеты специалистов, фильтры и маршрутизация к консультациям.">
        <CardGrid items={experts} basePath="/experts" getTitle={(item) => item.name} getText={(item) => item.bio} getMeta={(item) => item.specialization} />
      </Section>

      <div className={s.band}>
        <Section eyebrow="Программы" title="Программы" text="Примеры будущих психологических программ и продуктовых направлений.">
          <CardGrid items={programs} basePath="/programs" getTitle={(item) => item.name} getText={(item) => item.description} getMeta={(item) => item.duration} />
        </Section>
      </div>

      <Section eyebrow="Вебинары" title="Вебинары" text="Подборки открытых и платных вебинаров можно будет развивать поверх этой структуры.">
        <CardGrid items={webinars} basePath="/webinars" getTitle={(item) => item.title} getText={(item) => item.description} />
      </Section>

      <div className={s.band}>
        <Section eyebrow="Диагностика" title="С чего можно начать" text="Диагностики пока работают как архитектура страниц без AI, но уже задают будущий пользовательский путь.">
          <CardGrid items={tests} basePath="/diagnostics/ai-psychologist" getTitle={(item) => item.title} getText={(item) => item.description} />
        </Section>
      </div>

      <div className={s.band}>
        <Section eyebrow="FAQ" title="FAQ" text="Базовые вопросы для первого публичного контура.">
          <div className={s.faqList}>
            <Faq question="Это замена терапии?" answer="Нет. Luma IQ помогает сориентироваться, изучить материалы и подобрать формат помощи, но не заменяет медицинскую или кризисную помощь." />
            <Faq question="Диагностики уже используют AI?" answer="На текущем этапе нет. Страницы тестов подготовлены архитектурно, а логика диагностик будет добавляться отдельно." />
            <Faq question="Можно ли попасть в старый кабинет?" answer="Да. Авторизация находится на /auth, личный кабинет - на /app, админка - на /admin." />
          </div>
        </Section>
      </div>
    </main>
  );
}

function Section({ eyebrow, title, text, children }: { eyebrow?: string; title: string; text: string; children: React.ReactNode }) {
  return (
    <section className={s.section}>
      <div className={s.sectionHeader}>
        <div>
          {eyebrow && <p className={s.eyebrow}>{eyebrow}</p>}
          <h2>{title}</h2>
        </div>
        <p>{text}</p>
      </div>
      {children}
    </section>
  );
}

function CardGrid<T extends { slug: string }>({
  items,
  basePath,
  getTitle,
  getText,
  getMeta,
}: {
  items: T[];
  basePath: string;
  getTitle: (item: T) => string;
  getText: (item: T) => string;
  getMeta?: (item: T) => string;
}) {
  return (
    <div className={s.grid}>
      {items.slice(0, 3).map((item) => (
        <Link key={item.slug} to={basePath === '/diagnostics/ai-psychologist' ? basePath : `${basePath}/${item.slug}`} className={s.card}>
          <div>
            {getMeta && <span className={s.meta}>{getMeta(item)}</span>}
            <h3>{getTitle(item)}</h3>
            <p>{getText(item)}</p>
          </div>
          <span className={s.cardLink}>Открыть <span>→</span></span>
        </Link>
      ))}
    </div>
  );
}

function Faq({ question, answer }: { question: string; answer: string }) {
  return (
    <article className={s.faqItem}>
      <h3>{question}</h3>
      <p>{answer}</p>
    </article>
  );
}
