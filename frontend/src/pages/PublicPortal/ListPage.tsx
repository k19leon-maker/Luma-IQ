import { Link } from 'react-router-dom';
import Breadcrumbs from './Breadcrumbs';
import { breadcrumbSchema, useSeo } from '../../utils/seo';
import s from './PublicPortal.module.css';

interface ListItem {
  slug: string;
  title: string;
  text: string;
  meta?: string;
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
        <Link className={s.primaryBtn} to="/diagnostics/ai-psychologist">Пройти диагностику с ИИ психологом</Link>
      </section>
      <section className={s.section}>
        <div className={s.grid}>
          {items.map((item) => (
            <Link key={item.slug} to={`${basePath}/${item.slug}`} className={s.card}>
              <div>
                {item.meta && <span className={s.meta}>{item.meta}</span>}
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </div>
              <span className={s.cardLink}>Открыть <span>→</span></span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
