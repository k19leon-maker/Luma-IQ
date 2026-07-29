export type LandingAsset = {
  src: string;
  width: number;
  height: number;
};

const asset = (src: string, width: number, height: number): LandingAsset => ({
  src: `/assets/luma-iq/${src}`,
  width,
  height,
});

export const LANDING_LOGOS = {
  horizontal: asset('01_logos/luma-iq-logo-horizontal.svg', 280, 72),
  horizontalDark: asset('01_logos/luma-iq-logo-horizontal-dark.svg', 280, 72),
  symbol: asset('01_logos/luma-iq-symbol.svg', 64, 64),
  favicon: asset('01_logos/luma-iq-favicon.svg', 64, 64),
} as const;

export const LANDING_ICONS = {
  analytics: asset('02_icons_svg/icon-analytics.svg', 64, 64),
  arrow: asset('02_icons_svg/icon-arrow.svg', 64, 64),
  audience: asset('02_icons_svg/icon-audience.svg', 64, 64),
  chatbot: asset('02_icons_svg/icon-chatbot.svg', 64, 64),
  check: asset('02_icons_svg/icon-check.svg', 64, 64),
  content: asset('02_icons_svg/icon-content.svg', 64, 64),
  context: asset('02_icons_svg/icon-context.svg', 64, 64),
  funnel: asset('02_icons_svg/icon-funnel.svg', 64, 64),
  offers: asset('02_icons_svg/icon-offers.svg', 64, 64),
  product: asset('02_icons_svg/icon-product.svg', 64, 64),
  savings: asset('02_icons_svg/icon-savings.svg', 64, 64),
  shield: asset('02_icons_svg/icon-shield.svg', 64, 64),
  speed: asset('02_icons_svg/icon-speed.svg', 64, 64),
  strategy: asset('02_icons_svg/icon-strategy.svg', 64, 64),
  tasks: asset('02_icons_svg/icon-tasks.svg', 64, 64),
  team: asset('02_icons_svg/icon-team.svg', 64, 64),
} as const;

export const LANDING_ILLUSTRATIONS = {
  caseBeforeAfter: asset('03_illustrations_svg/case-before-after.svg', 1200, 680),
  contextCapital: asset('03_illustrations_svg/context-capital.svg', 1000, 1000),
  finalCta: asset('03_illustrations_svg/final-cta-decoration.svg', 1400, 520),
  heroContext: asset('03_illustrations_svg/hero-context-architecture.svg', 1200, 900),
  marketShift: asset('03_illustrations_svg/market-shift-old-vs-new.svg', 1200, 760),
  marketingTeam: asset('03_illustrations_svg/marketing-team-grid.svg', 1200, 760),
  pricing: asset('03_illustrations_svg/pricing-three-tiers.svg', 1000, 760),
  workflow: asset('03_illustrations_svg/workflow-five-steps.svg', 1200, 420),
} as const;

export const LANDING_BACKGROUNDS = {
  blackGoldWave: asset('04_backgrounds_svg/black-gold-wave-wide.svg', 1200, 360),
  topographicCorner: asset('04_backgrounds_svg/gold-topographic-corner.svg', 600, 600),
  warmGrid: asset('04_backgrounds_svg/warm-grid-pattern.svg', 800, 800),
} as const;

export const LANDING_MEDIA = {
  heroDashboard: asset('hero-dashboard.webp', 2000, 1063),
  oldModelExpertOverload: asset('old-model-expert-overload.webp', 1060, 1180),
} as const;
