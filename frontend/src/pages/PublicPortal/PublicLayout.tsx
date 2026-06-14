import { Link } from 'react-router-dom';
import LegalFooter from '../../components/LegalFooter/LegalFooter';
import { publicNav } from '../../data/public/content';
import s from './PublicPortal.module.css';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={s.page}>
      <header className={s.header}>
        <div className={s.headerInner}>
          <Link to="/" className={s.brand}>
            <span className={s.brandMark}>L</span>
            <span className={s.brandText}>
              <span>LUMA IQ</span>
              <small>психологические программы</small>
            </span>
          </Link>
          <nav className={s.nav} aria-label="Публичная навигация">
            {publicNav.map((item) => (
              <Link key={item.path} to={item.path}>{item.label}</Link>
            ))}
          </nav>
          <div className={s.headerActions}>
            <Link className={s.authLink} to="/auth">Личный кабинет</Link>
            <Link className={s.startLink} to="/diagnostics/ai-psychologist">Пройти диагностику с ИИ психологом</Link>
          </div>
        </div>
      </header>
      {children}
      <LegalFooter />
    </div>
  );
}
