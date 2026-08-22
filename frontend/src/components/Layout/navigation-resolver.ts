import { GLOBAL_NAVIGATION } from '../../config/app-navigation';
import type {
  GlobalNavigationSection,
  NavigationPathMatch,
  NavigationResolution,
  SectionNavigationItem,
} from './navigation.types';

interface RouteCandidate {
  section: GlobalNavigationSection;
  subsection: SectionNavigationItem | null;
  match: NavigationPathMatch;
}

function stripQueryAndHash(pathname: string): string {
  return pathname.split(/[?#]/, 1)[0] || '/';
}

export function normalizeNavigationPathname(pathname: string): string {
  const rawPath = stripQueryAndHash(pathname.trim() || '/');
  const withLeadingSlash = rawPath.startsWith('/') ? rawPath : `/${rawPath}`;
  const withoutAppPrefix = withLeadingSlash === '/app'
    ? '/dashboard'
    : withLeadingSlash.startsWith('/app/')
      ? withLeadingSlash.slice('/app'.length)
      : withLeadingSlash;

  if (withoutAppPrefix.length > 1 && withoutAppPrefix.endsWith('/')) {
    return withoutAppPrefix.replace(/\/+$/, '');
  }

  return withoutAppPrefix;
}

function pathMatches(pathname: string, match: NavigationPathMatch): boolean {
  const expectedPath = normalizeNavigationPathname(match.path);
  if ((match.mode ?? 'exact') === 'exact') return pathname === expectedPath;
  return pathname === expectedPath || pathname.startsWith(`${expectedPath}/`);
}

function matchScore(match: NavigationPathMatch): number {
  const normalizedPath = normalizeNavigationPathname(match.path);
  return normalizedPath.length * 2 + ((match.mode ?? 'exact') === 'exact' ? 1 : 0);
}

function sectionMatches(section: GlobalNavigationSection): readonly NavigationPathMatch[] {
  if (section.matches) return section.matches;
  if (section.children?.length) return [];
  return [{ path: section.path, mode: 'exact' }];
}

function subsectionMatches(item: SectionNavigationItem): readonly NavigationPathMatch[] {
  return item.matches ?? [{ path: item.path, mode: 'exact' }];
}

function collectCandidates(): RouteCandidate[] {
  return GLOBAL_NAVIGATION.flatMap((section) => {
    const ownCandidates = sectionMatches(section).map((match) => ({
      section,
      subsection: null,
      match,
    }));
    const childCandidates = (section.children ?? []).flatMap((subsection) =>
      subsectionMatches(subsection).map((match) => ({ section, subsection, match })),
    );
    return [...ownCandidates, ...childCandidates];
  });
}

const ROUTE_CANDIDATES = collectCandidates();

export function resolveNavigation(pathname: string): NavigationResolution {
  const normalizedPathname = normalizeNavigationPathname(pathname);

  if (normalizedPathname === '/admin') {
    return {
      mode: 'admin',
      pathname: normalizedPathname,
      globalSectionId: null,
      subsectionId: null,
      hasSubNavigation: false,
    };
  }

  if (normalizedPathname === '/onboarding') {
    return {
      mode: 'onboarding',
      pathname: normalizedPathname,
      globalSectionId: null,
      subsectionId: null,
      hasSubNavigation: false,
    };
  }

  const candidate = ROUTE_CANDIDATES
    .filter(({ match }) => pathMatches(normalizedPathname, match))
    .sort((left, right) => matchScore(right.match) - matchScore(left.match))[0];

  if (!candidate) {
    return {
      mode: 'unknown',
      pathname: normalizedPathname,
      globalSectionId: null,
      subsectionId: null,
      hasSubNavigation: false,
    };
  }

  return {
    mode: 'app',
    pathname: normalizedPathname,
    globalSectionId: candidate.section.id,
    subsectionId: candidate.subsection?.id ?? null,
    hasSubNavigation: candidate.section.hasSubNavigation,
  };
}
