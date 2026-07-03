import { Link } from 'react-router-dom';
import { b2bLegalDocuments } from '../../data/b2bLegal';
import s from './SiteFooter.module.css';

export default function SiteFooter() {
  return (
    <footer className={s.footer}>
      <div className={s.inner}>
        <div className={s.brand}>
          <strong>Luma IQ</strong>
          <span>ИИ-платформа для маркетинговой упаковки и разработки контента</span>
        </div>
        <nav className={s.links} aria-label="Юридические документы">
          {b2bLegalDocuments.map((document) => (
            <Link key={document.path} to={document.path}>
              {document.title}
            </Link>
          ))}
          <Link to="/legal/cookies">Политика cookies</Link>
          <Link to="/contacts">Контакты</Link>
        </nav>
        <a className={s.email} href="mailto:team@lumaiq.ru">team@lumaiq.ru</a>
      </div>
    </footer>
  );
}
