import { Link } from 'react-router-dom';
import type { Article } from '../../data/public/content';
import {
  concernCards,
  diagnosticBenefits,
  familyHero,
  familyPrograms,
  howItWorksSteps,
  situationColumns,
} from '../../data/public/home';
import { useB2CDiagnosticState } from '../../hooks/useB2CDiagnosticState';
import s from './PublicPortal.module.css';

function DiagnosticCta({ className = s.primaryBtn }: { className?: string }) {
  const diagnosticCta = useB2CDiagnosticState();
  return (
    <Link className={className} to={diagnosticCta.path}>
      {diagnosticCta.label} <span>→</span>
    </Link>
  );
}

export function FamilyHero() {
  return (
    <section className={s.hero}>
      <div className={s.heroInner}>
        <div className={s.heroContent}>
          <div className={s.eyebrow}>{familyHero.eyebrow}</div>
          <h1>{familyHero.title}</h1>
          <p className={s.lead}>{familyHero.subtitle}</p>
          <div className={s.actions}>
            <DiagnosticCta />
          </div>
          <div className={s.familyBenefits}>
            {familyHero.benefits.map((benefit) => (
              <div key={benefit}>✓ {benefit}</div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function ConcernsSection() {
  return (
    <FamilySection id="solutions" title="Что вас беспокоит сейчас?">
      <div className={s.concernGrid}>
        {concernCards.map((card) => (
          <Link className={s.concernCard} key={card.title} to={card.href}>
            <div>
              <h3>{card.title}</h3>
              <p>{card.description}</p>
            </div>
            <span>{card.cta} →</span>
          </Link>
        ))}
      </div>
    </FamilySection>
  );
}

export function SituationsSection() {
  return (
    <div className={s.band}>
      <FamilySection id="situations" title="Самые частые ситуации">
        <div className={s.situationColumns}>
          {situationColumns.map((column) => (
            <article className={s.situationColumn} key={column.title}>
              <h3>{column.title}</h3>
              <div>
                {column.items.map((item) => (
                  <Link key={item.href} to={item.href}>{item.label} <span>→</span></Link>
                ))}
              </div>
            </article>
          ))}
        </div>
      </FamilySection>
    </div>
  );
}

export function HowItWorksSection() {
  return (
    <FamilySection id="how-it-works" title="Как работает Luma IQ">
      <div className={s.stepsGrid}>
        {howItWorksSteps.map((step, index) => (
          <article className={s.stepCard} key={step.title}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <h3>{step.title}</h3>
            <p>{step.text}</p>
          </article>
        ))}
      </div>
    </FamilySection>
  );
}

export function DiagnosticOutcomeSection() {
  return (
    <div className={s.band}>
      <FamilySection title="Что вы получите после диагностики">
        <div className={s.outcomePanel}>
          <ul>
            {diagnosticBenefits.map((benefit) => (
              <li key={benefit}>✓ {benefit}</li>
            ))}
          </ul>
          <DiagnosticCta />
        </div>
      </FamilySection>
    </div>
  );
}

export function ProgramsSection() {
  return (
    <div className={s.band}>
      <FamilySection id="programs" title="Программы для самых распространённых ситуаций">
        <div className={s.programGrid}>
          {familyPrograms.map((program) => (
            <Link className={s.programCard} key={program.title} to={program.href}>
              <span>Продолжительность: {program.duration}</span>
              <h3>{program.title}</h3>
            </Link>
          ))}
        </div>
      </FamilySection>
    </div>
  );
}

export function MaterialsSection({ articles }: { articles: Article[] }) {
  return (
    <FamilySection title="Полезные материалы">
      <div className={s.materialGrid}>
        {articles.map((article) => (
          <Link className={s.materialCard} key={article.slug} to={`/articles/${article.slug}`}>
            <span>{article.readingTime ?? new Date(article.publishedAt).toLocaleDateString('ru-RU')}</span>
            <h3>{article.title}</h3>
            <p>{article.excerpt}</p>
          </Link>
        ))}
      </div>
    </FamilySection>
  );
}

export function FinalCtaSection() {
  return (
    <section className={s.finalCta}>
      <div>
        <h2>Сделайте первый шаг к спокойным отношениям в семье</h2>
        <p>Пройдите диагностику и получите персональный маршрут решения вашей ситуации.</p>
        <DiagnosticCta />
      </div>
    </section>
  );
}

function FamilySection({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className={s.section} id={id}>
      <div className={s.familySectionHeader}>
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}
