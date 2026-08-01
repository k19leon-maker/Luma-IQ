import { projectContextService } from './project-context.service';

export interface InstagramReadinessItem {
  key: 'about' | 'positioning' | 'audience' | 'utp' | 'products';
  label: string;
  path: string;
  ready: boolean;
}

export interface InstagramProfileReadiness {
  score: number;
  sufficient: boolean;
  items: InstagramReadinessItem[];
}

const ITEM_CONFIG: Array<InstagramReadinessItem & { blockKey: string; weight: number }> = [
  { key: 'about', label: 'О себе', path: '/app/strategy/about', blockKey: 'expert_profile', weight: 25, ready: false },
  { key: 'positioning', label: 'Позиционирование', path: '/app/strategy/positioning', blockKey: 'positioning_summary', weight: 25, ready: false },
  { key: 'audience', label: 'Целевая аудитория', path: '/app/strategy/audience', blockKey: 'audience_summary', weight: 25, ready: false },
  { key: 'utp', label: 'УТП', path: '/app/strategy/utp', blockKey: 'utp_summary', weight: 15, ready: false },
  { key: 'products', label: 'Продукты', path: '/app/products/main', blockKey: 'products_summary', weight: 10, ready: false },
];

function hasContent(content: string | undefined): boolean {
  if (!content) return false;
  const normalized = content.replace(/Не заполнено\.?/gi, '').replace(/[-\s:]/g, '');
  return normalized.length >= 4;
}

export const instagramProfileReadinessService = {
  async get(userId: string, projectId: string): Promise<InstagramProfileReadiness> {
    const context = await projectContextService.build({
      userId,
      projectId,
      workflow: 'instagram.profile',
      step: 'generate',
    });
    let score = 0;
    const items = ITEM_CONFIG.map(({ blockKey, weight, ...item }) => {
      const ready = hasContent(context.blocks.find((block) => block.key === blockKey)?.content);
      if (ready) score += weight;
      return { ...item, ready };
    });
    return { score, sufficient: score >= 60, items };
  },
};
