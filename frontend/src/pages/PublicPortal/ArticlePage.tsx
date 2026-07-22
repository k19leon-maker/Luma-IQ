import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { articles, categories, problems } from '../../data/public/content';
import { useB2CDiagnosticState } from '../../hooks/useB2CDiagnosticState';
import { absoluteUrl, breadcrumbSchema, useSeo } from '../../utils/seo';
import { ArticleContent } from './ArticleContent';
import Breadcrumbs from './Breadcrumbs';
import s from './PublicPortal.module.css';

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function ArticlePage() {
  const { slug } = useParams();
  const article = articles.find((item) => item.slug === slug);
  const diagnosticCta = useB2CDiagnosticState();
  const category = article ? categories.find((item) => item.slug === article.category) : undefined;
  const relatedArticles = article?.relatedArticleSlugs
    ?.map((relatedSlug) => articles.find((item) => item.slug === relatedSlug))
    .filter((item): item is NonNullable<typeof item> => Boolean(item)) ?? [];
  const relatedProblems = article?.relatedProblemSlugs
    ?.map((relatedSlug) => problems.find((item) => item.slug === relatedSlug))
    .filter((item): item is NonNullable<typeof item> => Boolean(item)) ?? [];
  const headings = article?.sections.filter((block) => block.type === 'heading') ?? [];

  const schema = useMemo(() => {
    const breadcrumbs = breadcrumbSchema([
      { name: 'Главная', url: '/' },
      { name: 'Статьи', url: '/articles' },
      { name: article?.title ?? 'Статья не найдена', url: article ? `/articles/${article.slug}` : '/articles' },
    ]);
    if (!article) return breadcrumbs;
    const graph: object[] = [
      breadcrumbs,
      {
        '@type': 'Article',
        headline: article.title,
        description: article.seo?.description ?? article.excerpt,
        datePublished: article.publishedAt,
        dateModified: article.updatedAt ?? article.publishedAt,
        author: { '@type': 'Organization', name: article.author.name },
        image: article.coverImage ? absoluteUrl(article.coverImage) : undefined,
        mainEntityOfPage: absoluteUrl(`/articles/${article.slug}`),
      },
    ];
    if (article.faq?.length) {
      graph.push({
        '@type': 'FAQPage',
        mainEntity: article.faq.map((item) => ({
          '@type': 'Question',
          name: item.question,
          acceptedAnswer: { '@type': 'Answer', text: item.answer },
        })),
      });
    }
    return {
      '@context': 'https://schema.org',
      '@graph': graph,
    };
  }, [article]);

  useSeo({
    title: article?.seo?.title ?? article?.title ?? 'Статья не найдена',
    description: article?.seo?.description ?? article?.excerpt,
    canonical: article ? `/articles/${article.slug}` : '/articles',
    type: 'article',
    image: article?.coverImage,
    schema,
  });

  if (!article) {
    return (
      <main className={s.section}>
        <div className={s.notFound}>
          <Breadcrumbs items={[{ label: 'Статьи', path: '/articles' }, { label: 'Статья не найдена' }]} />
          <h1>Статья не найдена</h1>
          <Link className={s.primaryBtn} to="/articles">К статьям</Link>
        </div>
      </main>
    );
  }

  return (
    <main className={s.articlePage}>
      <header className={s.articleHero}>
        <Breadcrumbs items={[{ label: 'Статьи', path: '/articles' }, { label: article.title }]} />
        <div className={s.articleLabels}>
          {category && <span>{category.name}</span>}
          <span>{article.readingTime ?? 'Короткое чтение'}</span>
        </div>
        <h1>{article.title}</h1>
        <p>{article.lead ?? article.excerpt}</p>
        <div className={s.articleByline}>
          <div><strong>{article.author.name}</strong><span>{article.author.role}</span></div>
          <time dateTime={article.publishedAt}>{formatDate(article.publishedAt)}</time>
        </div>
      </header>

      {article.coverImage && (
        <figure className={s.articleCover}>
          <img src={article.coverImage} alt={article.coverAlt ?? ''} width="1600" height="900" />
        </figure>
      )}

      <div className={s.articleLayout}>
        {headings.length > 1 && (
          <nav className={s.articleToc} aria-label="Содержание статьи">
            <strong>В этой статье</strong>
            {headings.map((heading) => <a key={heading.id} href={`#${heading.id}`}>{heading.title}</a>)}
          </nav>
        )}
        <article className={s.articleBody}>
          <ArticleContent blocks={article.sections} />

          {article.reviewer && (
            <aside className={s.reviewerCard}>
              <span>Экспертная проверка</span>
              <strong>{article.reviewer.name}</strong>
              <p>{article.reviewer.role}</p>
            </aside>
          )}

          {article.faq && article.faq.length > 0 && (
            <section className={s.articleFaq}>
              <h2>Частые вопросы</h2>
              {article.faq.map((item) => (
                <details key={item.question}>
                  <summary>{item.question}</summary>
                  <p>{item.answer}</p>
                </details>
              ))}
            </section>
          )}

          {article.cta && (
            <section className={s.articleCta}>
              <span>Следующий шаг</span>
              <h2>{article.cta.title}</h2>
              <p>{article.cta.description}</p>
              <Link className={s.primaryBtn} to={diagnosticCta.path}>{diagnosticCta.label}</Link>
            </section>
          )}
        </article>
      </div>

      {(relatedArticles.length > 0 || relatedProblems.length > 0) && (
        <section className={s.relatedSection}>
          <div className={s.relatedHeading}><span>Продолжить разбираться</span><h2>Читайте также</h2></div>
          <div className={s.relatedGrid}>
            {relatedProblems.map((problem) => (
              <Link key={problem.slug} to={`/problems/${problem.slug}`}>
                <span>Ситуация</span><h3>{problem.name}</h3><p>{problem.description}</p>
              </Link>
            ))}
            {relatedArticles.map((item) => (
              <Link key={item.slug} to={`/articles/${item.slug}`}>
                <span>Статья</span><h3>{item.title}</h3><p>{item.excerpt}</p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
