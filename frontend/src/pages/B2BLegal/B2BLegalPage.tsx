import { Link, Navigate, useLocation } from 'react-router-dom';
import SiteFooter from '../../components/SiteFooter/SiteFooter';
import { b2bLegalDocuments, findB2BLegalDocument } from '../../data/b2bLegal';
import { breadcrumbSchema, useSeo } from '../../utils/seo';
import s from './B2BLegalPage.module.css';

const emailPattern = /([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi;
const exactEmailPattern = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;

function renderInlineText(text: string) {
  const parts = text.split(emailPattern);

  return parts.map((part, index) => {
    if (exactEmailPattern.test(part)) {
      return (
        <a key={`${part}-${index}`} href={`mailto:${part}`}>
          {part}
        </a>
      );
    }
    return part;
  });
}

export default function B2BLegalPage() {
  const location = useLocation();
  const document = findB2BLegalDocument(location.pathname);

  useSeo({
    title: document?.path === '/legal/privacy-policy' ? 'Политика конфиденциальности — Luma IQ' : document?.title ?? 'Юридические документы',
    description: document?.description ?? 'Юридические документы сервиса Luma IQ.',
    canonical: document?.path ?? location.pathname,
    schema: document
      ? breadcrumbSchema([
          { name: 'Luma IQ', url: '/' },
          { name: 'Юридические документы', url: '/legal/privacy-policy' },
          { name: document.title, url: document.path },
        ])
      : undefined,
  });

  if (!document) return <Navigate to="/auth" replace />;

  return (
    <>
      <main className={s.page}>
        <div className={s.shell}>
          <aside className={s.nav} aria-label="Юридические документы B2B">
            <Link className={s.logo} to="/auth">
              <span className={s.logoMark}>L</span>
              <span>
                <strong>Luma IQ</strong>
                <small>AI SaaS</small>
              </span>
            </Link>
            <nav className={s.navLinks}>
              {b2bLegalDocuments.map((item) => (
                <Link
                  key={item.path}
                  className={`${s.navLink}${item.path === document.path ? ' ' + s.navLinkActive : ''}`}
                  to={item.path}
                >
                  {item.title}
                </Link>
              ))}
            </nav>
          </aside>

          <article className={s.article}>
            <p className={s.eyebrow}>Юридические документы B2B-сервиса</p>
            <h1>{document.title}</h1>
            <div className={s.meta}>
              <span>{document.version}</span>
              {document.effectiveDate && <span>{document.effectiveDate}</span>}
            </div>

            <div className={s.content}>
              {document.sections.map((section) => (
                <section key={section.title} className={s.section}>
                  <h2>{section.title}</h2>
                  {section.blocks.map((block, index) => {
                    if (block.type === 'list') {
                      return (
                        <ul key={`${section.title}-${index}`}>
                          {block.items.map((item) => (
                            <li key={item}>{renderInlineText(item)}</li>
                          ))}
                        </ul>
                      );
                    }
                    return <p key={`${section.title}-${index}`}>{renderInlineText(block.text)}</p>;
                  })}
                </section>
              ))}
            </div>
          </article>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
