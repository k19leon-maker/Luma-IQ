import { Link } from 'react-router-dom';
import { useSeo } from '../../utils/seo';
import s from './PublicPortal.module.css';

export default function NotFoundPage() {
  useSeo({
    title: 'Страница не найдена',
    description: 'Такой страницы в Luma IQ пока нет.',
    canonical: '/404',
  });

  return (
    <main className={s.section}>
      <div className={s.notFound}>
        <h1>Страница не найдена</h1>
        <p className={s.detailLead}>Проверьте адрес или вернитесь на главную страницу.</p>
        <Link className={s.primaryBtn} to="/">На главную</Link>
      </div>
    </main>
  );
}
