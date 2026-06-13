import { useEffect } from 'react';

const SITE_NAME = 'Luma IQ';
const DEFAULT_DESCRIPTION = 'Психологические программы, материалы и специалисты для помощи в сложных жизненных ситуациях.';

export interface SeoOptions {
  title: string;
  description?: string;
  canonical?: string;
  type?: 'website' | 'article';
  schema?: object;
}

function origin() {
  return typeof window === 'undefined' ? 'https://lumaiq.ru' : window.location.origin;
}

function upsertMeta(selector: string, attrs: Record<string, string>) {
  let node = document.head.querySelector<HTMLMetaElement>(selector);
  if (!node) {
    node = document.createElement('meta');
    document.head.appendChild(node);
  }
  Object.entries(attrs).forEach(([key, value]) => node?.setAttribute(key, value));
}

function upsertCanonical(href: string) {
  let node = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!node) {
    node = document.createElement('link');
    node.rel = 'canonical';
    document.head.appendChild(node);
  }
  node.href = href;
}

export function absoluteUrl(path = '/') {
  return `${origin()}${path.startsWith('/') ? path : `/${path}`}`;
}

export function useSeo({ title, description = DEFAULT_DESCRIPTION, canonical, type = 'website', schema }: SeoOptions) {
  useEffect(() => {
    const fullTitle = title.includes(SITE_NAME) ? title : `${title} | ${SITE_NAME}`;
    const canonicalUrl = canonical ? absoluteUrl(canonical) : window.location.href;

    document.title = fullTitle;
    upsertMeta('meta[name="description"]', { name: 'description', content: description });
    upsertMeta('meta[property="og:title"]', { property: 'og:title', content: fullTitle });
    upsertMeta('meta[property="og:description"]', { property: 'og:description', content: description });
    upsertMeta('meta[property="og:type"]', { property: 'og:type', content: type });
    upsertMeta('meta[property="og:url"]', { property: 'og:url', content: canonicalUrl });
    upsertMeta('meta[property="og:site_name"]', { property: 'og:site_name', content: SITE_NAME });
    upsertCanonical(canonicalUrl);

    const previous = document.getElementById('schema-org-jsonld');
    previous?.remove();
    if (schema) {
      const script = document.createElement('script');
      script.id = 'schema-org-jsonld';
      script.type = 'application/ld+json';
      script.textContent = JSON.stringify(schema);
      document.head.appendChild(script);
    }
  }, [canonical, description, schema, title, type]);
}

export function breadcrumbSchema(items: Array<{ name: string; url: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.url),
    })),
  };
}
