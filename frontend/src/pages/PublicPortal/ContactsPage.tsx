import { useSeo } from '../../utils/seo';
import s from './PublicPortal.module.css';

export default function ContactsPage() {
  useSeo({
    title: 'Контакты',
    description: 'Контактная информация Luma IQ. Данные находятся в подготовке.',
    canonical: '/contacts',
  });

  return (
    <main className={s.section}>
      <article className={s.legalArticle}>
        <p className={s.eyebrow}>Контакты</p>
        <h1>Контакты Luma IQ</h1>
        <p className={s.detailLead}>Временные данные для будущего юридического оформления проекта.</p>
        <div className={s.legalStub}>Контактная информация находится в разработке.</div>
      </article>
    </main>
  );
}
