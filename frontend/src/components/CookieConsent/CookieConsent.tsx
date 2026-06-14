import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import s from './CookieConsent.module.css';

const COOKIE_KEY = 'lumaiq.cookies.accepted';

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(window.localStorage.getItem(COOKIE_KEY) !== 'true');
  }, []);

  const accept = () => {
    window.localStorage.setItem(COOKIE_KEY, 'true');
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className={s.banner} role="region" aria-label="Cookie consent">
      <p>Мы используем cookies для улучшения работы сайта.</p>
      <div className={s.actions}>
        <button onClick={accept} type="button">Принять</button>
        <Link to="/legal/cookies">Подробнее</Link>
      </div>
    </div>
  );
}
