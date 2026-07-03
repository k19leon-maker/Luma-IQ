import { Link } from 'react-router-dom';
import { b2bLegalDocuments } from '../../data/b2bLegal';
import s from './B2BLegalNotice.module.css';

export default function B2BLegalNotice() {
  return (
    <div className={s.notice}>
      <p>Продолжая использование сервиса, вы соглашаетесь с документами:</p>
      <div className={s.links}>
        {b2bLegalDocuments.map((document) => (
          <Link key={document.path} to={document.path} target="_blank">
            {document.title}
          </Link>
        ))}
      </div>
    </div>
  );
}
