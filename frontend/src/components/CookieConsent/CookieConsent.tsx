import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { ANALYTICS_CONSENT_KEY, setAnalyticsConsent } from '../../utils/analytics';
import s from './CookieConsent.module.css';

const COOKIE_KEY = 'lumaiq.cookies.accepted';

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const hasChoice = window.localStorage.getItem(COOKIE_KEY) === 'true'
      || window.localStorage.getItem(ANALYTICS_CONSENT_KEY) !== null;
    setVisible(!hasChoice);
  }, []);

  const accept = () => {
    window.localStorage.setItem(COOKIE_KEY, 'true');
    setAnalyticsConsent(true);
    setVisible(false);
  };

  const decline = () => {
    setAnalyticsConsent(false);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className={s.banner} role="region" aria-label="Cookie consent">
      <p>Мы используем cookies для улучшения работы сайта.</p>
      <div className={s.actions}>
        <button onClick={accept} type="button">Принять</button>
        <button onClick={decline} type="button">Только необходимые</button>
        <Link to="/legal/cookies">Подробнее</Link>
      </div>
    </div>
  );
}
