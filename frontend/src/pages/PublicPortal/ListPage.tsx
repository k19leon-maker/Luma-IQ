import { Link } from 'react-router-dom';
import Breadcrumbs from './Breadcrumbs';
import { useB2CDiagnosticState } from '../../hooks/useB2CDiagnosticState';
import { breadcrumbSchema, useSeo } from '../../utils/seo';
import s from './PublicPortal.module.css';

interface ListItem {
  slug: string;
  title: string;
  text: string;
  meta?: string;
  image?: string;
  imageAlt?: string;
  tags?: string[];
}

export default function ListPage({
  title,
  description,
  basePath,
  items,
}: {
  title: string;
  description: string;
  basePath: string;
  items: ListItem[];
}) {
  const diagnosticCta = useB2CDiagnosticState();

  useSeo({
    title,
    description,
    canonical: basePath,
    schema: breadcrumbSchema([
      { name: 'Главная', url: '/' },
      { name: title, url: basePath },
    ]),
  });

  return (
    <main>
      <section className={`${s.section} ${s.listHero}`}>
        <Breadcrumbs items={[{ label: title }]} />
        <h1>{title}</h1>
        <p>{description}</p>
        <Link className={s.primaryBtn} to={diagnosticCta.path}>{diagnosticCta.label}</Link>
      </section>
      <section className={s.section}>
        <div className={s.grid}>
          {items.map((item) => (
            <Link key={item.slug} to={`${basePath}/${item.slug}`} className={`${s.card} ${item.image ? s.articleCard : ''}`}>
              {item.image && <img src={item.image} alt={item.imageAlt ?? ''} width="720" height="405" loading="lazy" />}
              <div>
                {item.meta && <span className={s.meta}>{item.meta}</span>}
                <h3>{item.title}</h3>
                <p>{item.text}</p>
                {item.tags && <div className={s.cardTags}>{item.tags.slice(0, 3).map((tag) => <span key={tag}>{tag}</span>)}</div>}
              </div>
              <span className={s.cardLink}>Открыть <span>→</span></span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
