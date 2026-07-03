import { Link } from 'react-router-dom';
import { b2bLegalDocuments } from '../../data/b2bLegal';
import s from './LegalInfoBlock.module.css';

interface LegalInfoBlockProps {
  className?: string;
}

export default function LegalInfoBlock({ className = '' }: LegalInfoBlockProps) {
  return (
    <section className={`${s.legalPanel} ${className}`} aria-label="Юридическая информация">
      <div className={s.legalPanelHeader}>
        <span className={s.legalIcon}>✦</span>
        <div>
          <h4 className={s.legalTitle}>Юридическая информация</h4>
          <p className={s.legalMeta}>Давидюк Леонид Дмитриевич · ИНН 402914848246</p>
        </div>
      </div>
      <nav className={s.legalLinks} aria-label="Юридические документы">
        {b2bLegalDocuments.map((document) => (
          <Link key={document.path} to={document.path}>
            {document.title}
          </Link>
        ))}
      </nav>
    </section>
  );
}
