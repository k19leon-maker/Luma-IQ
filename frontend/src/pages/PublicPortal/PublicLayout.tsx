import { Link } from 'react-router-dom';
import SiteFooter from '../../components/SiteFooter/SiteFooter';
import { publicNav } from '../../data/public/content';
import { useB2CDiagnosticState } from '../../hooks/useB2CDiagnosticState';
import s from './PublicPortal.module.css';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  const diagnosticCta = useB2CDiagnosticState();

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
            <Link className={s.startLink} to={diagnosticCta.path}>{diagnosticCta.headerLabel}</Link>
          </div>
        </div>
      </header>
      {children}
      <SiteFooter />
    </div>
  );
}
