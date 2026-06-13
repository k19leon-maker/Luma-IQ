import { Link, useParams } from 'react-router-dom';
import Breadcrumbs from './Breadcrumbs';
import { breadcrumbSchema, useSeo } from '../../utils/seo';
import s from './PublicPortal.module.css';

interface DetailItem {
  slug: string;
  title: string;
  description: string;
  content?: string;
  meta?: string;
}

export default function DetailPage({
  items,
  sectionTitle,
  sectionPath,
  fallbackTitle,
}: {
  items: DetailItem[];
  sectionTitle: string;
  sectionPath: string;
  fallbackTitle: string;
}) {
  const { slug } = useParams();
  const item = items.find((candidate) => candidate.slug === slug);

  useSeo({
    title: item?.title ?? fallbackTitle,
    description: item?.description ?? 'Страница находится в подготовке.',
    canonical: item ? `${sectionPath}/${item.slug}` : sectionPath,
    type: sectionPath === '/articles' ? 'article' : 'website',
    schema: breadcrumbSchema([
      { name: 'Главная', url: '/' },
      { name: sectionTitle, url: sectionPath },
      { name: item?.title ?? fallbackTitle, url: item ? `${sectionPath}/${item.slug}` : sectionPath },
    ]),
  });

  if (!item) {
    return (
      <main className={s.section}>
        <div className={s.notFound}>
          <Breadcrumbs items={[{ label: sectionTitle, path: sectionPath }, { label: fallbackTitle }]} />
          <h1>{fallbackTitle}</h1>
          <p className={s.detailLead}>Эта страница пока не заполнена. Вернитесь к списку раздела.</p>
          <Link className={s.primaryBtn} to={sectionPath}>К списку</Link>
        </div>
      </main>
    );
  }

  return (
    <main className={s.section}>
      <article className={s.detail}>
        <Breadcrumbs items={[{ label: sectionTitle, path: sectionPath }, { label: item.title }]} />
        <h1>{item.title}</h1>
        <p className={s.detailLead}>{item.description}</p>
        {item.meta && <span className={s.meta}>{item.meta}</span>}
        <div className={s.content}>
          <p>{item.content ?? 'Подробный контент этой страницы будет добавлен на следующем этапе. Сейчас маршрут, метаданные, хлебные крошки и SEO-шаблон уже подготовлены.'}</p>
        </div>
        <Link className={s.primaryBtn} to="/diagnostics/ai-psychologist">Пройти диагностику с ИИ психологом</Link>
      </article>
    </main>
  );
}
