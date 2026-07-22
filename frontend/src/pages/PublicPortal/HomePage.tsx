import { articles } from '../../data/public/content';
import { familyArticleSlugs } from '../../data/public/home';
import { breadcrumbSchema, useSeo } from '../../utils/seo';
import {
  ConcernsSection,
  DiagnosticOutcomeSection,
  FamilyHero,
  FinalCtaSection,
  HowItWorksSection,
  MaterialsSection,
  ProgramsSection,
  SituationsSection,
} from './HomeSections';

export default function HomePage() {
  const familyArticles = familyArticleSlugs
    .map((slug) => articles.find((article) => article.slug === slug))
    .filter((article): article is NonNullable<typeof article> => Boolean(article));

  useSeo({
    title: 'Luma IQ — пространство для родителей',
    description: 'Luma IQ помогает родителям сохранить отношения в семье, снизить конфликты и получить персональный маршрут решения семейной ситуации.',
    canonical: '/',
    schema: breadcrumbSchema([{ name: 'Главная', url: '/' }]),
  });

  return (
    <main>
      <FamilyHero />
      <ConcernsSection />
      <SituationsSection />
      <HowItWorksSection />
      <DiagnosticOutcomeSection />
      <ProgramsSection />
      <MaterialsSection articles={familyArticles} />
      <FinalCtaSection />
    </main>
  );
}
