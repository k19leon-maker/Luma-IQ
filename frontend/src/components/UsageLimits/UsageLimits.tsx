import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { billingApi, type BillingMe } from '../../api/billing.api';
import {
  AI_ACTION_COSTS,
  AI_ACTION_LABELS,
  SECTION_PRIMARY_ACTION,
  type AiActionType,
} from '../../config/ai-balance';
import { appPath } from '../../utils/appRoutes';
import { formatLimitNumber } from '../../utils/planLimits';
import s from './UsageLimits.module.css';

export type SectionUsageLimitsSection =
  | 'ai_chat'
  | 'content'
  | 'youtube_scripts'
  | 'longreads'
  | 'strategy'
  | 'products'
  | 'projects';

function getTone(remaining: number, limit: number): 'normal' | 'warning' | 'empty' {
  if (limit <= 0 || remaining <= 0) return 'empty';
  if (remaining / limit < 0.15) return 'warning';
  return 'normal';
}

function toneClass(tone: ReturnType<typeof getTone>): string {
  if (tone === 'warning') return ` ${s.badgeWarning}`;
  if (tone === 'empty') return ` ${s.badgeEmpty}`;
  return '';
}

export function useBillingMe() {
  const [billing, setBilling] = useState<BillingMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    billingApi.getMe()
      .then((next) => {
        if (!cancelled) setBilling(next);
      })
      .catch(() => {
        if (!cancelled) {
          setBilling(null);
          setError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { billing, loading, error };
}

function actionCostText(action: AiActionType): string {
  const cost = AI_ACTION_COSTS[action];
  const label = AI_ACTION_LABELS[action].toLowerCase();
  if (action === 'ai_chat') return `Сообщение обычно списывает ${cost} AI-балл.`;
  return `${label.charAt(0).toUpperCase()}${label.slice(1)} спишет ${cost} AI-баллов.`;
}

export function SectionUsageLimits({ section }: { section: SectionUsageLimitsSection }) {
  const { billing, loading, error } = useBillingMe();

  if (loading) {
    return (
      <div className={s.localWrap}>
        <div className={s.badgeRow}>
          <span className={s.skeletonBadge}>Загружаем AI-баланс... <span className={s.skeletonDot} /></span>
        </div>
      </div>
    );
  }

  if (error || !billing?.publicLimits) {
    return (
      <div className={s.localWrap}>
        <span className={s.errorBadge}>AI-баланс временно недоступен</span>
      </div>
    );
  }

  const limits = billing.publicLimits;
  const upgradeHref = appPath('/pricing');

  if (section === 'projects') {
    const tone = getTone(limits.projectsRemaining, limits.projectsTotal);
    return (
      <div className={s.localWrap}>
        <div className={s.badgeRow}>
          <span className={`${s.badge}${toneClass(tone)}`}>
            <strong>
              {tone === 'empty'
                ? 'Лимит проектов закончился'
                : `Проекты: ${formatLimitNumber(limits.projectsRemaining)} из ${formatLimitNumber(limits.projectsTotal)} доступно`}
            </strong>
            <span>Проект — отдельное направление, ниша, продукт или сегмент аудитории.</span>
            {tone === 'empty' && <Link className={s.upgradeLink} to={upgradeHref}>Изменить тариф</Link>}
          </span>
        </div>
      </div>
    );
  }

  const tone = getTone(limits.aiBalanceRemaining, limits.aiBalanceTotal);
  const action = SECTION_PRIMARY_ACTION[section] ?? 'ai_chat';

  return (
    <div className={s.localWrap}>
      <div className={s.badgeRow}>
        <span className={`${s.badge}${toneClass(tone)}`}>
          <strong>
            {tone === 'empty'
              ? 'AI-баланс закончился'
              : `AI-баланс: ${formatLimitNumber(limits.aiBalanceRemaining)} из ${formatLimitNumber(limits.aiBalanceTotal)} баллов осталось`}
          </strong>
          <span>{actionCostText(action)}</span>
          {tone === 'empty' && <Link className={s.upgradeLink} to={upgradeHref}>Изменить тариф</Link>}
        </span>
      </div>
    </div>
  );
}
