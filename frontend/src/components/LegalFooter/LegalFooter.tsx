import { Link } from 'react-router-dom';
import { legalDocuments } from '../../data/legal';
import s from './LegalFooter.module.css';

export default function LegalFooter() {
  return (
    <footer className={s.footer}>
      <div className={s.inner}>
        <div>
          <strong>Luma IQ</strong>
          <span>Психологические программы, материалы и специалисты</span>
        </div>
        <nav aria-label="Юридические документы">
          {legalDocuments.map((document) => (
            <Link key={document.path} to={document.path}>{document.title}</Link>
          ))}
          <Link to="/contacts">Контакты</Link>
        </nav>
      </div>
    </footer>
  );
}
