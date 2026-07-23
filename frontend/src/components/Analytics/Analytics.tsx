import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  ANALYTICS_CONSENT_EVENT,
  initializeAnalytics,
  trackPageView,
} from '../../utils/analytics';

export default function Analytics() {
  const location = useLocation();

  useEffect(() => {
    const initialize = () => initializeAnalytics();
    initialize();
    window.addEventListener(ANALYTICS_CONSENT_EVENT, initialize);
    return () => window.removeEventListener(ANALYTICS_CONSENT_EVENT, initialize);
  }, []);

  useEffect(() => {
    trackPageView(`${location.pathname}${location.search}`);
  }, [location.pathname, location.search]);

  return null;
}
