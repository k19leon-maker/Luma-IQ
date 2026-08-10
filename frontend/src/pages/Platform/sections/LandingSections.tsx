import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { LandingLogo } from '../../../components/LandingLogo/LandingLogo';
import { LANDING_ICONS, LANDING_MEDIA, LandingAsset } from '../../../config/landing-assets';
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
  plansLoading: boolean;
  checkoutPlanId: string | null;
  onPlanSelect: (plan: LandingPlan) => void;
};

function scrollToSection(id: string) {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.getElementById(id)?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
}

function AssetImage({ asset, alt, className, eager = false }: {
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

function SectionIntro({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) {
  return (
    <div className={styles.sectionIntro}>
      <p className={styles.eyebrow}>{eyebrow}</p>
      <h2>{title}</h2>
      {description && <p className={styles.sectionDescription}>{description}</p>}
    </div>
  );
}

function Icon({ name, className = '' }: { name: keyof typeof LANDING_ICONS; className?: string }) {
  return <AssetImage asset={LANDING_ICONS[name]} alt="" className={className} />;
}

export function LandingHeader() {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => event.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [menuOpen]);

  return (
    <header className={styles.header}>
      <Link className={styles.logo} to="/" aria-label="Luma IQ"><LandingLogo /></Link>
      <nav className={`${styles.nav} ${menuOpen ? styles.navOpen : ''}`} id="landing-navigation" aria-label="Навигация по лендингу">
        {landingContent.navigation.map((item) => (
          <a href={item.href} key={item.href} onClick={() => setMenuOpen(false)}>{item.label}</a>
        ))}
        <button type="button" className={styles.mobileNavCta} onClick={() => { setMenuOpen(false); scrollToSection('pricing'); }}>
          {landingContent.cta.selectPlan}
        </button>
      </nav>
      <div className={styles.headerActions}>
        <Link className={styles.loginLink} to="/auth">Войти</Link>
        <button className={styles.headerButton} type="button" onClick={() => scrollToSection('pricing')}>{landingContent.cta.selectPlan}</button>
        <button
          className={styles.menuButton}
          type="button"
          aria-label={menuOpen ? 'Закрыть меню' : 'Открыть меню'}
          aria-expanded={menuOpen}
          aria-controls="landing-navigation"
          onClick={() => setMenuOpen((value) => !value)}
        >
          <span /><span /><span />
        </button>
      </div>
    </header>
  );
}

function HeroSection() {
  return (
    <section className={`${styles.section} ${styles.hero}`}>
      <div className={`${styles.container} ${styles.heroGrid}`}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>{landingContent.hero.eyebrow}</p>
          <h1>{landingContent.hero.title}</h1>
          <div className={styles.heroText}>{landingContent.hero.paragraphs.map((text) => <p key={text}>{text}</p>)}</div>
          <div className={styles.heroActions}>
            <button className={styles.primaryButton} type="button" onClick={() => scrollToSection('pricing')}>{landingContent.cta.selectPlan}</button>
            <button className={styles.secondaryButton} type="button" onClick={() => scrollToSection('how-it-works')}>{landingContent.cta.learnMore}</button>
          </div>
          <ul className={styles.heroBenefits}>
            {landingContent.hero.benefits.map((item) => (
              <li key={item.title}>
                <Icon name={item.icon} className={styles.benefitIcon} />
                <span><strong>{item.title}</strong><small>{item.text}</small></span>
              </li>
            ))}
          </ul>
        </div>
        <picture className={styles.heroVisual}>
          <source media="(max-width: 767px)" srcSet={LANDING_MEDIA.aiTeamHeroMobile.src} width={LANDING_MEDIA.aiTeamHeroMobile.width} height={LANDING_MEDIA.aiTeamHeroMobile.height} />
          <AssetImage asset={LANDING_MEDIA.aiTeamHeroDesktop} alt="Восемь ИИ-специалистов Luma IQ для стратегии, исследований, продуктов, контента, чатботов и аналитики" eager />
        </picture>
      </div>
    </section>
  );
}

const problemIcons: Array<keyof typeof LANDING_ICONS> = ['tasks', 'content', 'chatbot', 'analytics', 'offers', 'strategy', 'product', 'funnel', 'team', 'audience'];

function ProblemPath({ path, index }: { path: (typeof landingContent.problem.paths)[number]; index: number }) {
  return (
    <article className={styles.problemCard}>
      <h3>{path.title}</h3>
      <div className={styles.problemMap}>
        <strong className={styles.problemCenter}>{path.center}</strong>
        <ul>
          {path.nodes.map((node, nodeIndex) => (
            <li key={node}><Icon name={problemIcons[(nodeIndex + index) % problemIcons.length]} /><span>{node}</span></li>
          ))}
        </ul>
      </div>
      <p>{path.caption}</p>
    </article>
  );
}

function ProblemSection() {
  return (
    <section className={styles.section}>
      <div className={styles.container}>
        <SectionIntro eyebrow={landingContent.problem.eyebrow} title={landingContent.problem.title} />
        <div className={styles.problemGrid}>{landingContent.problem.paths.map((path, index) => <ProblemPath key={path.title} path={path} index={index} />)}</div>
      </div>
    </section>
  );
}

function WorkflowArrow() {
  return <AssetImage asset={LANDING_ICONS.arrow} alt="" className={styles.workflowArrow} />;
}

function AiTeamWorkflowSection() {
  return (
    <section className={`${styles.section} ${styles.workflowSection}`}>
      <div className={styles.container}>
        <SectionIntro eyebrow={landingContent.workflow.eyebrow} title={landingContent.workflow.title} description={landingContent.workflow.description} />
        <ol className={styles.workflowGrid}>
          {landingContent.workflow.steps.map((step, index) => (
            <li className={styles.workflowItem} key={step.label}>
              <span className={styles.workflowLabel}>{step.label}</span>
              <article className={styles.workflowCard}>
                <h3>{step.title}</h3><p>{step.text}</p><span className={styles.workflowAction}>{step.action}</span>
              </article>
              {index < landingContent.workflow.steps.length - 1 && <WorkflowArrow />}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function SpecialistGridSection() {
  return (
    <section className={styles.section} id="capabilities">
      <div className={styles.container}>
        <SectionIntro eyebrow={landingContent.specialists.eyebrow} title={landingContent.specialists.title} />
        <div className={styles.specialistGrid}>
          {landingContent.specialists.items.map((item) => (
            <article className={styles.specialistCard} key={item.title}>
              <Icon name={item.icon} className={styles.cardIcon} /><h3>{item.title}</h3><p>{item.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function ProjectContextSection() {
  return (
    <section className={`${styles.section} ${styles.contextSection}`}>
      <div className={`${styles.container} ${styles.contextLayout}`}>
        <SectionIntro eyebrow={landingContent.context.eyebrow} title={landingContent.context.title} description={landingContent.context.description} />
        <div className={styles.contextMap}>
          <div className={styles.contextCore}><LandingLogo variant="symbol" /><strong>Контекст проекта</strong><span>Luma IQ</span></div>
          <ul>
            {landingContent.context.nodes.map((node) => (
              <li key={node.title}><Icon name={node.icon} /><span><strong>{node.title}</strong><small>{node.text}</small></span></li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function StructuredPreview({ type }: { type: string }) {
  if (type === 'products') {
    return <div className={styles.structuredPreview}><div className={styles.previewToolbar}>Продукты и тарифы</div><div className={styles.productTiles}><span>Курс PRO</span><span>Наставничество</span><span>Вебинар</span></div></div>;
  }
  if (type === 'funnel') {
    return <div className={styles.structuredPreview}><div className={styles.previewToolbar}>Воронка и чатбот</div><div className={styles.funnelFlow}><span>Трафик</span><span>Лид-магнит</span><span>Прогрев</span><span>Продажа</span></div></div>;
  }
  return <div className={styles.structuredPreview}><div className={styles.previewToolbar}>Контент-план</div><div className={styles.contentCalendar}>{Array.from({ length: 12 }, (_, index) => <span key={index}>{index + 1}</span>)}</div></div>;
}

function ProductResultsSection() {
  return (
    <section className={styles.section}>
      <div className={styles.container}>
        <SectionIntro eyebrow={landingContent.results.eyebrow} title={landingContent.results.title} />
        <div className={styles.resultsGrid}>
          {landingContent.results.items.map((item) => (
            <article className={styles.resultCard} key={item.title}>
              {item.preview === 'strategy'
                ? <AssetImage asset={LANDING_MEDIA.productStrategy} alt="Экран стратегии проекта в Luma IQ" className={styles.resultImage} />
                : <StructuredPreview type={item.preview} />}
              <div className={styles.resultCopy}><Icon name={item.icon} /><div><h3>{item.title}</h3><p>{item.text}</p></div></div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function ManagedProcessSection() {
  return (
    <section className={styles.section} id="how-it-works">
      <div className={styles.container}>
        <SectionIntro eyebrow={landingContent.process.eyebrow} title={landingContent.process.title} />
        <ol className={styles.processGrid}>
          {landingContent.process.steps.map((step, index) => (
            <li key={step.title}>
              <span className={styles.processNumber}>{index + 1}</span><Icon name={step.icon} className={styles.processIcon} />
              <h3>{step.title}</h3><p>{step.text}</p>
              {index < landingContent.process.steps.length - 1 && <WorkflowArrow />}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function ComparisonSection() {
  return (
    <section className={styles.section} id="comparison">
      <div className={styles.container}>
        <SectionIntro eyebrow={landingContent.comparison.eyebrow} title={landingContent.comparison.title} />
        <div className={styles.comparisonGrid}>
          {landingContent.comparison.items.map((item) => (
            <article className={`${styles.comparisonCard} ${'featured' in item && item.featured ? styles.comparisonFeatured : ''}`} key={item.title}>
              <Icon name={item.icon} className={styles.cardIcon} /><h3>{item.title}</h3>
              <ul>{item.points.map((point) => <li key={point}>{point}</li>)}</ul>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function formatPrice(value: number) {
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(value);
}

function PricingSection({ plans, plansLoading, checkoutPlanId, onPlanSelect }: LandingMainProps) {
  return (
    <section className={`${styles.section} ${styles.pricingSection}`} id="pricing" aria-busy={plansLoading}>
      <div className={styles.container}>
        <SectionIntro eyebrow={landingContent.pricing.eyebrow} title={landingContent.pricing.title} />
        {plansLoading && <p className={styles.loadingState}>Загружаем тарифы...</p>}
        {!plansLoading && plans.length === 0 && <p className={styles.loadingState}>Не удалось загрузить тарифы. Обновите страницу.</p>}
        <div className={styles.pricingGrid}>
          {plans.map((plan) => {
            const checkingOut = checkoutPlanId === plan.id;
            return (
              <article className={`${styles.planCard} ${plan.badge ? styles.planFeatured : ''}`} key={plan.id}>
                {plan.badge && <span className={styles.planBadge}>{plan.badge}</span>}
                <h3>{plan.name}</h3>
                <div className={styles.price}>{formatPrice(plan.price)} ₽ <span>{plan.period}</span></div>
                <p className={styles.planDescription}>{plan.description}</p>
                <ul className={styles.planFeatures}>{plan.features.map((feature) => <li key={feature}>{feature}</li>)}</ul>
                <div className={styles.planUsage}><h4>{landingContent.pricing.usageTitle}</h4><ul>{plan.exampleUsage.map((item) => <li key={item}>{item}</li>)}</ul></div>
                <p className={styles.planDisclaimer}>{plan.usageDisclaimer}</p>
                <button className={styles.primaryButton} type="button" disabled={!plan.purchasable || Boolean(checkoutPlanId)} onClick={() => onPlanSelect(plan)}>
                  {!plan.purchasable ? landingPlanUiCopy.unavailableButton : checkingOut ? 'Переходим к оплате...' : `Выбрать «${plan.name}»`}
                </button>
              </article>
            );
          })}
        </div>
        <aside className={styles.balanceNote}><Icon name="context" /><div><h3>{landingContent.pricing.balanceTitle}</h3>{landingContent.pricing.balanceText.map((text) => <p key={text}>{text}</p>)}</div></aside>
      </div>
    </section>
  );
}

export function LandingMain(props: LandingMainProps) {
  return <main><HeroSection /><ProblemSection /><AiTeamWorkflowSection /><SpecialistGridSection /><ProjectContextSection /><ProductResultsSection /><ManagedProcessSection /><ComparisonSection /><PricingSection {...props} /></main>;
}

export function LandingFooter() {
  return (
    <footer className={styles.footer}>
      <div className={`${styles.container} ${styles.footerGrid}`}>
        <div><Link className={styles.logo} to="/" aria-label="Luma IQ"><LandingLogo variant="onDark" /></Link><p>{landingContent.footer.description}</p><small>{landingContent.footer.note}</small></div>
        <nav aria-label="Юридические ссылки">{landingContent.footerLinks.map((item) => <Link to={item.to} key={item.to}>{item.label}</Link>)}</nav>
        <p className={styles.copyright}>© 2026 Luma IQ</p>
      </div>
    </footer>
  );
}
