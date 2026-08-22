export type GlobalNavigationSectionId =
  | 'ai-dialog'
  | 'tasks'
  | 'content-plan'
  | 'projects'
  | 'strategy'
  | 'products'
  | 'packaging'
  | 'content'
  | 'chatbots'
  | 'analytics'
  | 'education'
  | 'settings';

export type NavigationIconId =
  | 'ai-dialog'
  | 'tasks'
  | 'content-plan'
  | 'projects'
  | 'strategy'
  | 'products'
  | 'packaging'
  | 'content'
  | 'chatbots'
  | 'analytics'
  | 'education'
  | 'settings';

export type NavigationPathMatchMode = 'exact' | 'prefix';

export interface NavigationPathMatch {
  path: string;
  mode?: NavigationPathMatchMode;
}

export interface SectionNavigationItem {
  id: string;
  label: string;
  path: string;
  matches?: readonly NavigationPathMatch[];
}

export interface GlobalNavigationSection {
  id: GlobalNavigationSectionId;
  label: string;
  icon: NavigationIconId;
  path: string;
  hasSubNavigation: boolean;
  projectScoped?: boolean;
  matches?: readonly NavigationPathMatch[];
  children?: readonly SectionNavigationItem[];
  comingSoon?: boolean;
}

export type NavigationResolutionMode =
  | 'app'
  | 'admin'
  | 'onboarding'
  | 'unknown';

export interface NavigationResolution {
  mode: NavigationResolutionMode;
  pathname: string;
  globalSectionId: GlobalNavigationSectionId | null;
  subsectionId: string | null;
  hasSubNavigation: boolean;
}
