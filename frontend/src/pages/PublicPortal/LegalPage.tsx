import { Navigate, useLocation } from 'react-router-dom';
import { legalDocuments } from '../../data/legal';
import { useSeo } from '../../utils/seo';
import s from './PublicPortal.module.css';

export default function LegalPage() {
  const location = useLocation();
  const document = legalDocuments.find((item) => item.path === location.pathname);

  useSeo({
    title: document?.title ?? 'Юридические документы',
    description: `${document?.title ?? 'Юридические документы'} Luma IQ. Документ находится в разработке.`,
    canonical: document?.path ?? location.pathname,
  });

  if (!document) return <Navigate to="/" replace />;

  return (
    <main className={s.section}>
      <article className={s.legalArticle}>
        <p className={s.eyebrow}>Юридические документы</p>
        <h1>{document.title}</h1>
        <p className={s.detailLead}>Версия документа: {document.version}</p>
        <div className={s.legalStub}>Документ находится в разработке.</div>
      </article>
    </main>
  );
}
