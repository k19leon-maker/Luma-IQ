export const ANALYTICS_CONSENT_KEY = 'lumaiq.cookies.analytics';
export const ANALYTICS_CONSENT_EVENT = 'lumaiq:analytics-consent';

type AnalyticsParams = Record<string, string | number | boolean | undefined>;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    ym?: ((counterId: number, method: string, ...args: unknown[]) => void) & {
      a?: IArguments[];
      l?: number;
    };
  }
}

let initialized = false;

function yandexMetrikaId(): number | null {
  const value = Number(import.meta.env.VITE_YANDEX_METRIKA_ID);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function googleAnalyticsId(): string {
  return String(import.meta.env.VITE_GA_MEASUREMENT_ID ?? '').trim();
}

function appendScript(id: string, src: string) {
  if (document.getElementById(id)) return;
  const script = document.createElement('script');
  script.id = id;
  script.async = true;
  script.src = src;
  document.head.appendChild(script);
}

export function hasAnalyticsConsent(): boolean {
  if (typeof window === 'undefined') return false;
  const explicit = window.localStorage.getItem(ANALYTICS_CONSENT_KEY);
  if (explicit !== null) return explicit === 'granted';
  return window.localStorage.getItem('lumaiq.cookies.accepted') === 'true';
}

export function initializeAnalytics() {
  if (initialized || !hasAnalyticsConsent()) return;
  initialized = true;

  const metrikaId = yandexMetrikaId();
  if (metrikaId) {
    window.ym = window.ym || function () {
      if (!window.ym) return;
      window.ym.a = window.ym.a || [];
      window.ym.a.push(arguments);
    };
    window.ym.l = Date.now();
    appendScript('yandex-metrika', 'https://mc.yandex.ru/metrika/tag.js');
    window.ym(metrikaId, 'init', {
      clickmap: true,
      trackLinks: true,
      accurateTrackBounce: true,
      webvisor: false,
    });
  }

  const gaId = googleAnalyticsId();
  if (gaId) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function (...args: unknown[]) {
      window.dataLayer?.push(args);
    };
    appendScript('google-analytics', `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`);
    window.gtag('js', new Date());
    window.gtag('config', gaId, { send_page_view: false });
  }
}

export function setAnalyticsConsent(granted: boolean) {
  window.localStorage.setItem(ANALYTICS_CONSENT_KEY, granted ? 'granted' : 'denied');
  window.dispatchEvent(new CustomEvent(ANALYTICS_CONSENT_EVENT, { detail: { granted } }));
  if (granted) initializeAnalytics();
}

export function trackPageView(path: string) {
  if (!hasAnalyticsConsent()) return;
  initializeAnalytics();
  const metrikaId = yandexMetrikaId();
  if (metrikaId) window.ym?.(metrikaId, 'hit', path);
  if (googleAnalyticsId()) {
    window.gtag?.('event', 'page_view', {
      page_path: path,
      page_location: window.location.href,
      page_title: document.title,
    });
  }
}

export function trackEvent(name: string, params: AnalyticsParams = {}) {
  if (!hasAnalyticsConsent()) return;
  initializeAnalytics();
  const cleanParams = Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== undefined),
  );
  const metrikaId = yandexMetrikaId();
  if (metrikaId) window.ym?.(metrikaId, 'reachGoal', name, cleanParams);
  if (googleAnalyticsId()) window.gtag?.('event', name, cleanParams);
}

export function trackOncePerSession(key: string, name: string, params: AnalyticsParams = {}) {
  if (!hasAnalyticsConsent()) return;
  const storageKey = `lumaiq.analytics.once.${key}`;
  if (window.sessionStorage.getItem(storageKey) === 'true') return;
  window.sessionStorage.setItem(storageKey, 'true');
  trackEvent(name, params);
}
