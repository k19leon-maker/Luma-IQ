import { ArrowUpRight, CircleAlert } from 'lucide-react';
import { Link } from 'react-router-dom';
import s from './UTP.module.css';

export interface UtpMissingDataItem {
  key: string;
  label: string;
  editPath: string | null;
}

interface Props {
  items: UtpMissingDataItem[];
}

function internalEditPath(path: string | null): string | null {
  return path?.startsWith('/app/') ? path : null;
}

export function UtpMissingData({ items }: Props) {
  if (!items.length) return null;

  return (
    <section className={s.missingData} aria-labelledby="utp-missing-data-title">
      <div className={s.missingHeading}>
        <CircleAlert aria-hidden="true" size={18} strokeWidth={1.8} />
        <div>
          <h3 id="utp-missing-data-title">Можно усилить УТП</h3>
          <p>Эти данные не блокируют работу, но помогут сделать формулировку точнее.</p>
        </div>
      </div>
      <ul>
        {items.map((item) => {
          const path = internalEditPath(item.editPath);
          return (
            <li key={item.key}>
              <span>{item.label}</span>
              {path ? (
                <Link to={path}>
                  Заполнить <ArrowUpRight aria-hidden="true" size={14} />
                </Link>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
