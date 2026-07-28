import { ReactNode, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LandingLogo } from '../../../components/LandingLogo/LandingLogo';
import { LANDING_ICONS, LANDING_ILLUSTRATIONS, LandingAsset } from '../../../config/landing-assets';
import { landingContent, landingPlanUiCopy } from '../../../config/landing-content';
import styles from '../PlatformLanding.module.css';

export type LandingPlan = {
  id: string;
  name: string;
  price: number;
  period: string;
  description: string;
  features: string[];
  aiPoints: number;
  projectsLimit: number;
  exampleUsage: string[];
  usageDisclaimer: string;
  purchasable: boolean;
  badge?: string;
  buttonText: string;
};

type LandingMainProps = {
  plans: LandingPlan[];
  primaryCtaLabel: string;
  onPlanSelect: (plan: LandingPlan) => void;
};

function scrollToSection(id: string) {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.getElementById(id)?.scrollIntoView({
    behavior: reduceMotion ? 'auto' : 'smooth',
    block: 'start',
  });
}

function AssetImage({
  asset,
  alt,
  className,
  eager = false,
}: {
  asset: LandingAsset;
  alt: string;
  className?: string;
  eager?: boolean;
}) {
  return (
    <img
      className={className}
      src={asset.src}
      width={asset.width}
      height={asset.height}
      alt={alt}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
    />
  );
}

function SectionShell({
  id,
  eyebrow,
  title,
  description,
  children,
  dark = false,
  className = '',
}: {
  id?: string;
  eyebrow: string;
  title: string;
  description?: string;
  children: ReactNode;
  dark?: boolean;
  className?: string;
}) {
  return (
    <section
      className={`${styles.section} ${dark ? styles.darkSection : ''} ${className}`}
      id={id}
    >
      <div className={styles.container}>
        <div className={styles.sectionHead}>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h2>{title}</h2>
          {description && <p className={styles.sectionDescription}>{description}</p>}
        </div>
        {children}
      </div>
    </section>
  );
}

export function LandingHeader({ primaryCtaLabel }: { primaryCtaLabel: string }) {
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = () => setMenuOpen(false);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [menuOpen]);

  return (
    <header className={styles.header}>
      <Link className={styles.logo} to="/" aria-label="Luma IQ">
        <LandingLogo />
      </Link>
      <nav className={`${styles.nav} ${menuOpen ? styles.navOpen : ''}`} id="landing-navigation" aria-label="Навигация по лендингу">
        {landingContent.navigation.map((item) => (
          <a href={item.href} key={item.href} onClick={closeMenu}>{item.label}</a>
        ))}
      </nav>
      <div className={styles.headerActions}>
        <Link className={styles.loginLink} to="/auth">Войти</Link>
        <button className={styles.headerButton} type="button" onClick={() => scrollToSection('pricing')}>
          {primaryCtaLabel}
        </button>
        <button
          className={styles.menuButton}
          type="button"
          aria-label={menuOpen ? 'Закрыть меню' : 'Открыть меню'}
          aria-expanded={menuOpen}
          aria-controls="landing-navigation"
          onClick={() => setMenuOpen((current) => !current)}
        >
          <span aria-hidden="true" />
          <span aria-hidden="true" />
          <span aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}

function HeroSection({ primaryCtaLabel }: { primaryCtaLabel: string }) {
  return (
    <section className={`${styles.section} ${styles.hero}`}>
      <div className={styles.container}>
        <div className={styles.heroGrid}>
          <div className={styles.heroText}>
            <p className={styles.eyebrow}>{landingContent.hero.eyebrow}</p>
            <h1>
              <span className={styles.desktopTitle}>{landingContent.hero.title}</span>
              <span className={styles.mobileTitle}>{landingContent.hero.mobileTitle}</span>
            </h1>
            <p className={styles.heroLead}>{landingContent.hero.description}</p>
            <ul className={styles.heroBullets}>
              {landingContent.hero.bullets.map((item) => <li key={item}>{item}</li>)}
            </ul>
            <div className={styles.heroActions}>
              <button className={styles.primaryButton} type="button" onClick={() => scrollToSection('pricing')}>{primaryCtaLabel}</button>
              <button className={styles.secondaryButton} type="button" onClick={() => scrollToSection('capabilities')}>{landingContent.cta.learnMore}</button>
            </div>
            <div className={styles.heroNotes}>
              {landingContent.hero.notes.map((item) => <span key={item}>{item}</span>)}
            </div>
          </div>
          <AssetImage
            asset={LANDING_ILLUSTRATIONS.heroContext}
            alt="Архитектура маркетинговой системы Luma IQ"
            className={styles.heroIllustration}
            eager
          />
        </div>
      </div>
    </section>
  );
}

function AudienceStrip() {
  return (
    <section className={styles.audienceStrip} aria-labelledby="audience-strip-title">
      <div className={styles.container}>
        <h2 className={styles.visuallyHidden} id="audience-strip-title">{landingContent.audience.title}</h2>
        <div className={styles.audienceItems}>
          {landingContent.audience.items.map((item) => <span key={item}>{item}</span>)}
        </div>
      </div>
    </section>
  );
}

function OldMarketingModelSection() {
  return (
    <SectionShell {...landingContent.oldModel}>
      <div className={styles.threeColumnGrid}>
        {landingContent.oldModel.columns.map((column) => (
          <article className={styles.listCard} key={column.title}>
            <h3>{column.title}</h3>
            <ul>{column.items.map((item) => <li key={item}>{item}</li>)}</ul>
          </article>
        ))}
      </div>
    </SectionShell>
  );
}

function MarketShiftSection() {
  return (
    <SectionShell {...landingContent.marketShift} dark>
      <div className={styles.splitVisual}>
        <div>
          {landingContent.marketShift.paragraphs.map((item) => <p className={styles.largeCopy} key={item}>{item}</p>)}
          <div className={styles.darkTheses}>
            {landingContent.marketShift.theses.map((item) => (
              <article key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </div>
        <AssetImage asset={LANDING_ILLUSTRATIONS.marketShift} alt="Сравнение старой и новой модели маркетинга" className={styles.sectionIllustration} />
      </div>
      <blockquote className={styles.bigQuote}>{landingContent.marketShift.quote}</blockquote>
    </SectionShell>
  );
}

function DigitalHeadquartersSection() {
  return (
    <SectionShell {...landingContent.headquarters}>
      <div className={styles.headquartersGrid}>
        <div className={styles.editorialCopy}>
          {landingContent.headquarters.paragraphs.map((item) => <p key={item}>{item}</p>)}
        </div>
        <div className={styles.benefitGrid}>
          {landingContent.headquarters.benefits.map((item) => (
            <article key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </div>
    </SectionShell>
  );
}

function MarketingTeamSection() {
  return (
    <SectionShell {...landingContent.marketingTeam}>
      <div className={styles.splitVisual}>
        <AssetImage asset={LANDING_ILLUSTRATIONS.marketingTeam} alt="Функциональные роли маркетинговой команды Luma IQ" className={styles.sectionIllustration} />
        <div className={styles.roleGrid}>
          {landingContent.marketingTeam.roles.map((item) => (
            <article key={item.title}>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          ))}
        </div>
      </div>
    </SectionShell>
  );
}

function CapabilitiesSection() {
  return (
    <SectionShell id="capabilities" {...landingContent.capabilityCards}>
      <div className={styles.capabilityGrid}>
        {landingContent.capabilityCards.items.map((item) => {
          const icon = LANDING_ICONS[item.icon];
          return (
            <article className={styles.capabilityCard} key={item.title}>
              <AssetImage asset={icon} alt="" className={styles.capabilityIcon} />
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>
          );
        })}
      </div>
    </SectionShell>
  );
}

function WorkflowSection() {
  return (
    <SectionShell id="how-it-works" {...landingContent.workflow}>
      <AssetImage asset={LANDING_ILLUSTRATIONS.workflow} alt="Пять шагов работы в Luma IQ" className={styles.workflowIllustration} />
      <div className={styles.fiveStepGrid}>
        {landingContent.workflow.steps.map((item, index) => (
          <article key={item.title}>
            <span>{index + 1}</span>
            <h3>{item.title}</h3>
            <p>{item.text}</p>
          </article>
        ))}
      </div>
      <p className={styles.keyNote}>{landingContent.workflow.note}</p>
    </SectionShell>
  );
}

function ContextCapitalSection() {
  return (
    <SectionShell {...landingContent.contextCapital} className={styles.contextSection}>
      <div className={styles.splitVisual}>
        <div>
          <ol className={styles.numberedList}>
            {landingContent.contextCapital.steps.map((item) => <li key={item}>{item}</li>)}
          </ol>
          <p className={styles.keyNote}>{landingContent.contextCapital.conclusion}</p>
        </div>
        <AssetImage asset={LANDING_ILLUSTRATIONS.contextCapital} alt="Контекст проекта как маркетинговый актив" className={styles.contextIllustration} />
      </div>
    </SectionShell>
  );
}

function ComparisonTable({
  beforeTitle,
  afterTitle,
  rows,
}: {
  beforeTitle: string;
  afterTitle: string;
  rows: ReadonlyArray<{ before: string; after: string }>;
}) {
  return (
    <div className={styles.compareGrid}>
      <div className={styles.compareHead}>{beforeTitle}</div>
      <div className={styles.compareHead}>{afterTitle}</div>
      {rows.map((item) => (
        <div className={styles.comparePair} key={item.before}>
          <p>{item.before}</p>
          <p>{item.after}</p>
        </div>
      ))}
    </div>
  );
}

function AiComparisonSection() {
  return (
    <SectionShell id="comparison" {...landingContent.aiComparison}>
      <ComparisonTable
        beforeTitle={landingContent.aiComparison.beforeTitle}
        afterTitle={landingContent.aiComparison.afterTitle}
        rows={landingContent.aiComparison.rows}
      />
      <p className={styles.sectionNote}>{landingContent.aiComparison.note}</p>
    </SectionShell>
  );
}

function ApproachComparisonSection() {
  return (
    <SectionShell {...landingContent.approachComparison}>
      <div className={styles.threeColumnGrid}>
        {landingContent.approachComparison.columns.map((column) => (
          <article className={`${styles.listCard} ${'highlighted' in column && column.highlighted ? styles.highlightedCard : ''}`} key={column.title}>
            <h3>{column.title}</h3>
            <ul>{column.items.map((item) => <li key={item}>{item}</li>)}</ul>
            <strong>{column.summary}</strong>
          </article>
        ))}
      </div>
      <p className={styles.sectionNote}>{landingContent.approachComparison.disclaimer}</p>
    </SectionShell>
  );
}

function DemoProjectSection() {
  return (
    <SectionShell {...landingContent.demoProject}>
      <p className={styles.demoLabel}>{landingContent.demoProject.label}</p>
      <div className={styles.projectFlow}>
        {landingContent.demoProject.steps.map((item, index) => (
          <article key={item.title}>
            <span>{index + 1}</span>
            <div><h3>{item.title}</h3><p>{item.text}</p></div>
          </article>
        ))}
      </div>
    </SectionShell>
  );
}

function CasesSection() {
  return (
    <SectionShell id="cases" eyebrow={landingContent.cases.eyebrow} title={landingContent.cases.title}>
      <AssetImage
        asset={LANDING_ILLUSTRATIONS.caseBeforeAfter}
        alt="Схема изменений маркетинга проекта до и после системной работы"
        className={styles.workflowIllustration}
      />
      <div className={styles.casesGrid}>
        {landingContent.cases.items.map((item) => (
          <article className={styles.caseCard} key={item.id}>
            {item.isDemo && <span className={styles.demoLabel}>{landingContent.cases.demoLabel}</span>}
            <h3>{item.title}</h3>
            <div><h4>Было</h4><ul>{item.before.map((line) => <li key={line}>{line}</li>)}</ul></div>
            <div><h4>Стало</h4><ul>{item.after.map((line) => <li key={line}>{line}</li>)}</ul></div>
            <strong>{item.result}</strong>
          </article>
        ))}
      </div>
    </SectionShell>
  );
}

function TestimonialsSection() {
  return (
    <SectionShell eyebrow={landingContent.testimonials.eyebrow} title={landingContent.testimonials.title}>
      <p className={styles.demoNotice}>{landingContent.testimonials.demoLabel}</p>
      <div className={styles.testimonialGrid}>
        {landingContent.testimonials.items.map((item) => (
          <figure key={item.id}>
            <blockquote>{item.text}</blockquote>
            <figcaption>{item.author}</figcaption>
          </figure>
        ))}
      </div>
    </SectionShell>
  );
}

function AudienceSegmentsSection() {
  return (
    <SectionShell eyebrow="Сценарии использования" title="Для экспертов и небольших команд">
      <div className={styles.roleGrid}>
        {landingContent.roles.map((item) => (
          <article key={item.title}><h3>{item.title}</h3><p>{item.text}</p></article>
        ))}
      </div>
    </SectionShell>
  );
}

function formatPrice(value: number) {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value);
}

function PricingSection({ plans, onPlanSelect }: Pick<LandingMainProps, 'plans' | 'onPlanSelect'>) {
  return (
    <section className={`${styles.section} ${styles.pricingSection}`} id="pricing">
      <div className={styles.container}>
        <div className={styles.sectionHead}>
          <p className={styles.eyebrow}>{landingContent.pricing.eyebrow}</p>
          <h2>{landingContent.pricing.title}</h2>
          <p className={styles.sectionDescription}>{landingContent.pricing.description}</p>
        </div>
        <div className={styles.pricingGrid}>
          {plans.map((plan) => (
            <article className={`${styles.planCard} ${plan.badge ? styles.planHighlighted : ''}`} key={plan.id}>
              {plan.badge && <span className={styles.badge}>{plan.badge}</span>}
              <h3>{plan.name}</h3>
              <div className={styles.price}>{formatPrice(plan.price)} ₽ <span>{plan.period}</span></div>
              <p>{plan.description}</p>
              <ul>{plan.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
              <details>
                <summary>{landingContent.pricing.usageTitle}</summary>
                <ul>{plan.exampleUsage.map((item) => <li key={item}>{item}</li>)}</ul>
                <p>{plan.usageDisclaimer}</p>
              </details>
              <button className={styles.primaryButton} type="button" disabled={!plan.purchasable} onClick={() => onPlanSelect(plan)}>
                {plan.purchasable ? plan.buttonText : landingPlanUiCopy.unavailableButton}
              </button>
            </article>
          ))}
        </div>
        <p className={styles.pricingNote}>{landingContent.pricing.balanceNote}</p>
      </div>
    </section>
  );
}

function PaymentStepsSection() {
  return (
    <SectionShell {...landingContent.paymentSteps}>
      <div className={styles.paymentSteps}>
        {landingContent.paymentSteps.steps.map((item, index) => (
          <article key={item.title}><span>{index + 1}</span><h3>{item.title}</h3><p>{item.text}</p></article>
        ))}
      </div>
      <p className={styles.sectionNote}>{landingContent.paymentSteps.support}</p>
    </SectionShell>
  );
}

function FaqSection() {
  return (
    <SectionShell id="faq" eyebrow={landingContent.faq.eyebrow} title={landingContent.faq.title}>
      <div className={styles.faqList}>
        {landingContent.faq.items.map((item) => (
          <details className={styles.faqItem} key={item.question}>
            <summary>{item.question}</summary>
            <p>{item.answer}</p>
          </details>
        ))}
      </div>
    </SectionShell>
  );
}

function FinalCtaSection({ primaryCtaLabel }: { primaryCtaLabel: string }) {
  return (
    <section className={`${styles.section} ${styles.finalCta}`}>
      <AssetImage asset={LANDING_ILLUSTRATIONS.finalCta} alt="" className={styles.finalCtaDecoration} />
      <div className={styles.container}>
        <p className={styles.eyebrow}>{landingContent.finalCta.eyebrow}</p>
        <h2>{landingContent.finalCta.title}</h2>
        <p>{landingContent.finalCta.description}</p>
        <div className={styles.heroActions}>
          <button className={styles.primaryButton} type="button" onClick={() => scrollToSection('pricing')}>{primaryCtaLabel}</button>
          <button className={styles.darkSecondaryButton} type="button" onClick={() => scrollToSection('pricing')}>{landingContent.finalCta.secondaryCta}</button>
        </div>
        <div className={styles.finalBenefits}>
          {landingContent.finalCta.benefits.map((item) => <span key={item}>{item}</span>)}
        </div>
      </div>
    </section>
  );
}

export function LandingMain({ plans, primaryCtaLabel, onPlanSelect }: LandingMainProps) {
  return (
    <main>
      <HeroSection primaryCtaLabel={primaryCtaLabel} />
      <AudienceStrip />
      <OldMarketingModelSection />
      <MarketShiftSection />
      <DigitalHeadquartersSection />
      <MarketingTeamSection />
      <CapabilitiesSection />
      <WorkflowSection />
      <ContextCapitalSection />
      <AiComparisonSection />
      <ApproachComparisonSection />
      <DemoProjectSection />
      <CasesSection />
      <TestimonialsSection />
      <AudienceSegmentsSection />
      <PricingSection plans={plans} onPlanSelect={onPlanSelect} />
      <PaymentStepsSection />
      <FaqSection />
      <FinalCtaSection primaryCtaLabel={primaryCtaLabel} />
    </main>
  );
}

export function LandingFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.container}>
        <Link className={styles.logo} to="/" aria-label="Luma IQ">
          <LandingLogo variant="onDark" />
        </Link>
        <nav aria-label="Юридические ссылки">
          {landingContent.footerLinks.map((item) => (
            item.to.startsWith('#')
              ? <a href={item.to} key={item.to}>{item.label}</a>
              : <Link to={item.to} key={item.to}>{item.label}</Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
