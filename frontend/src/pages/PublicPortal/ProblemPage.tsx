import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { articles, problems } from '../../data/public/content';
import { useB2CDiagnosticState } from '../../hooks/useB2CDiagnosticState';
import { breadcrumbSchema, useSeo } from '../../utils/seo';
import Breadcrumbs from './Breadcrumbs';
import s from './PublicPortal.module.css';

export function ProblemPage() {
  const { slug } = useParams();
  const problem = problems.find((item) => item.slug === slug);
  const diagnosticCta = useB2CDiagnosticState();
  const relatedArticles = problem?.relatedArticleSlugs
    ?.map((articleSlug) => articles.find((item) => item.slug === articleSlug))
    .filter((item): item is NonNullable<typeof item> => Boolean(item)) ?? [];
  const schema = useMemo(() => breadcrumbSchema([
    { name: 'Главная', url: '/' },
    { name: 'Проблемы', url: '/problems' },
    { name: problem?.name ?? 'Страница не найдена', url: problem ? `/problems/${problem.slug}` : '/problems' },
  ]), [problem]);

  useSeo({
    title: problem?.seo?.title ?? problem?.name ?? 'Страница не найдена',
    description: problem?.seo?.description ?? problem?.description,
    canonical: problem ? `/problems/${problem.slug}` : '/problems',
    schema,
  });

  if (!problem) {
    return (
      <main className={s.section}>
        <div className={s.notFound}>
          <Breadcrumbs items={[{ label: 'Проблемы', path: '/problems' }, { label: 'Страница не найдена' }]} />
          <h1>Страница не найдена</h1>
          <Link className={s.primaryBtn} to="/problems">К ситуациям</Link>
        </div>
      </main>
    );
  }

  const isRichProblem = Boolean(problem.signs?.length || problem.causes?.length || problem.firstStep);
  return (
    <main className={s.problemPage}>
      <header className={s.problemHero}>
        <Breadcrumbs items={[{ label: 'Проблемы', path: '/problems' }, { label: problem.name }]} />
        <span className={s.problemEyebrow}>Семейная ситуация</span>
        <h1>{problem.name}</h1>
        <p>{problem.lead ?? problem.description}</p>
        <Link className={s.primaryBtn} to={diagnosticCta.path}>{diagnosticCta.label}</Link>
      </header>

      {isRichProblem ? (
        <div className={s.problemContent}>
          {problem.signs && (
            <section><span>Как это может выглядеть</span><h2>Признаки повторяющегося конфликта</h2><ul>{problem.signs.map((item) => <li key={item}>{item}</li>)}</ul></section>
          )}
          {problem.causes && (
            <section><span>Что стоит учитывать</span><h2>Возможные причины</h2><p>Одинаковое поведение может возникать по разным причинам. Эти варианты — ориентиры для наблюдения, а не диагноз.</p><ul>{problem.causes.map((item) => <li key={item}>{item}</li>)}</ul></section>
          )}
          {problem.firstStep && (
            <section className={s.firstStep}><span>Первый безопасный шаг</span><h2>Начните с наблюдения за сценарием</h2><p>{problem.firstStep}</p></section>
          )}
          {problem.safetyNote && <aside className={s.safetyNote}><strong>Когда нужна срочная помощь</strong><p>{problem.safetyNote}</p></aside>}
        </div>
      ) : (
        <section className={s.problemStub}><p>{problem.description}</p></section>
      )}

      {relatedArticles.length > 0 && (
        <section className={s.relatedSection}>
          <div className={s.relatedHeading}><span>Материалы по ситуации</span><h2>С чего начать</h2></div>
          <div className={s.relatedGrid}>
            {relatedArticles.map((article) => (
              <Link key={article.slug} to={`/articles/${article.slug}`}>
                <span>{article.readingTime ?? 'Статья'}</span><h3>{article.title}</h3><p>{article.excerpt}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {problem.cta && (
        <section className={s.problemCta}>
          <div><span>Персональный маршрут</span><h2>{problem.cta.title}</h2><p>{problem.cta.description}</p><Link className={s.primaryBtn} to={diagnosticCta.path}>{diagnosticCta.label}</Link></div>
        </section>
      )}
    </main>
  );
}
