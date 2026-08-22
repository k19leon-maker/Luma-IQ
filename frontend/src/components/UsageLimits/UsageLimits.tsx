import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { billingApi, type BillingMe } from '../../api/billing.api';
import {
  SECTION_PRIMARY_ACTION,
} from '../../config/ai-balance';
import { appPath } from '../../utils/appRoutes';
import { formatLimitNumber } from '../../utils/planLimits';
import s from './UsageLimits.module.css';

export type SectionUsageLimitsSection =
  | 'overview'
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

const hintActionKeys = [
  'ai_chat_quick',
  'content_post',
  'content_reel',
  'positioning',
  'product_main',
  'product_mini',
  'lead_magnet',
] as const;

export function useBillingMe(enabled = true, identityKey = '') {
  const [billing, setBilling] = useState<BillingMe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setBilling(null);
      setLoading(false);
      setError(false);
      return undefined;
    }

    let cancelled = false;
    let requestVersion = 0;
    const refresh = () => {
      const version = ++requestVersion;
      setLoading(true);
      setError(false);
      billingApi.getMe()
        .then((next) => {
          if (!cancelled && version === requestVersion) setBilling(next);
        })
        .catch(() => {
          if (!cancelled && version === requestVersion) {
            setBilling(null);
            setError(true);
          }
        })
        .finally(() => {
          if (!cancelled && version === requestVersion) setLoading(false);
        });
    };
    refresh();
    window.addEventListener('lumaiq:ai-balance-changed', refresh);

    return () => {
      cancelled = true;
      window.removeEventListener('lumaiq:ai-balance-changed', refresh);
    };
  }, [enabled, identityKey]);

  return { billing, loading, error };
}

interface SectionUsageLimitsViewProps {
  section: SectionUsageLimitsSection;
  billing: BillingMe | null;
  loading: boolean;
  error: boolean;
}

export function SectionUsageLimitsView({
  section,
  billing,
  loading,
  error,
}: SectionUsageLimitsViewProps) {

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
  const action = SECTION_PRIMARY_ACTION[section] ?? null;
  const priceByAction = new Map(billing.actionPrices.map((item) => [item.actionKey, item]));
  const primaryPrice = action ? priceByAction.get(action) : null;
  const usedPercent = limits.aiBalanceTotal > 0
    ? Math.min(100, Math.max(0, (limits.aiBalanceUsed / limits.aiBalanceTotal) * 100))
    : 0;

  return (
    <div className={s.localWrap}>
      <div className={s.badgeRow}>
        <span
          className={`${s.badge}${toneClass(tone)}`}
          aria-label={`AI-баланс: ${formatLimitNumber(limits.aiBalanceRemaining)} из ${formatLimitNumber(limits.aiBalanceTotal)} баллов осталось`}
        >
          <span className={s.balanceMain}>
            <strong>
              {tone === 'empty'
                ? 'AI-баланс закончился'
                : `AI-баланс: ${formatLimitNumber(limits.aiBalanceRemaining)} из ${formatLimitNumber(limits.aiBalanceTotal)} баллов осталось`}
            </strong>
            <span className={s.progressTrack} aria-hidden="true">
              <span className={s.progressBar} style={{ width: `${usedPercent}%` }} />
            </span>
          </span>
          <span className={s.infoWrap}>
            <button
              className={s.infoButton}
              type="button"
              aria-label="Сколько AI-баллов списывается?"
              title="AI-баланс списывается только после успешных AI-действий"
            >
              !
            </button>
            <span className={s.infoBubble}>
              <span>Баллы списываются только после успешной генерации.</span>
              {primaryPrice && <span>{primaryPrice.actionLabel} — {primaryPrice.aiPoints} AI-баллов.</span>}
              {hintActionKeys.map((key) => priceByAction.get(key)).filter(Boolean).map((item) => (
                <span key={item!.actionKey}>{item!.actionLabel} — {item!.aiPoints} AI-баллов</span>
              ))}
              <Link to={appPath('/limits')}>Посмотреть все лимиты</Link>
            </span>
          </span>
          {tone === 'empty' && <Link className={s.upgradeLink} to={upgradeHref}>Изменить тариф</Link>}
        </span>
      </div>
    </div>
  );
}

export function SectionUsageLimits({ section }: { section: SectionUsageLimitsSection }) {
  const billingState = useBillingMe();
  return <SectionUsageLimitsView section={section} {...billingState} />;
}
