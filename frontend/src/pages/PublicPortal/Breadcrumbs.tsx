import { Link } from 'react-router-dom';
import s from './PublicPortal.module.css';

export interface Crumb {
  label: string;
  path?: string;
}

export default function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <div className={s.breadcrumbs} aria-label="Хлебные крошки">
      <Link to="/">Главная</Link>
      {items.map((item) => (
        <span key={`${item.label}-${item.path ?? 'current'}`}>
          <span> / </span>
          {item.path ? <Link to={item.path}>{item.label}</Link> : <span>{item.label}</span>}
        </span>
      ))}
    </div>
  );
}
