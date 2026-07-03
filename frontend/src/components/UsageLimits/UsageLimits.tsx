import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { billingApi, type BillingMe } from '../../api/billing.api';
import { appPath } from '../../utils/appRoutes';
import { formatLimitNumber } from '../../utils/planLimits';
import s from './UsageLimits.module.css';

export type UsageLimitKey =
  | 'contentUnits'
  | 'aiMessagesToday'
  | 'aiGenerations'
  | 'projects'
  | 'heavyGenerations'
  | 'strategyRebuilds'
  | 'youtubeScripts'
  | 'longreads'
  | 'credits';

export type SectionUsageLimitsSection =
  | 'ai_chat'
  | 'content'
  | 'youtube_scripts'
  | 'longreads'
  | 'strategy'
  | 'products'
  | 'projects';

export const SECTION_LIMITS: Record<SectionUsageLimitsSection, UsageLimitKey[]> = {
  ai_chat: ['aiMessagesToday', 'aiGenerations'],
  content: ['contentUnits', 'aiGenerations'],
  youtube_scripts: ['youtubeScripts', 'contentUnits', 'heavyGenerations', 'aiGenerations'],
  longreads: ['longreads', 'contentUnits', 'heavyGenerations', 'aiGenerations'],
  strategy: ['strategyRebuilds', 'heavyGenerations', 'aiGenerations'],
  products: ['heavyGenerations', 'contentUnits', 'aiGenerations'],
  projects: ['projects'],
};

type LimitDefinition = {
  label: string;
  unavailableLabel: string;
  used: keyof BillingMe['usage'];
  remaining: keyof BillingMe['usage'];
  limit: keyof BillingMe['limits'];
};

const LIMIT_DEFINITIONS: Record<UsageLimitKey, LimitDefinition> = {
  contentUnits: {
    label: 'Контент-единицы',
    unavailableLabel: 'Контент-единицы недоступны на вашем тарифе',
    used: 'contentUnitsUsed',
    remaining: 'contentUnitsRemaining',
    limit: 'monthlyContentUnits',
  },
  aiMessagesToday: {
    label: 'AI-сообщения сегодня',
    unavailableLabel: 'AI-сообщения недоступны на вашем тарифе',
    used: 'aiMessagesUsedToday',
    remaining: 'aiMessagesRemainingToday',
    limit: 'dailyAiMessagesLimit',
  },
  aiGenerations: {
    label: 'AI-генерации',
    unavailableLabel: 'AI-генерации недоступны на вашем тарифе',
    used: 'aiGenerationsUsed',
    remaining: 'aiGenerationsRemaining',
    limit: 'monthlyAiGenerationsLimit',
  },
  projects: {
    label: 'Проекты',
    unavailableLabel: 'Проекты недоступны на вашем тарифе',
    used: 'projectsUsed',
    remaining: 'projectsRemaining',
    limit: 'projectsLimit',
  },
  heavyGenerations: {
    label: 'Тяжёлые генерации',
    unavailableLabel: 'Тяжёлые генерации недоступны на вашем тарифе',
    used: 'heavyGenerationsUsed',
    remaining: 'heavyGenerationsRemaining',
    limit: 'heavyGenerationsLimit',
  },
  strategyRebuilds: {
    label: 'Пересборки стратегии',
    unavailableLabel: 'Пересборки стратегии недоступны на вашем тарифе',
    used: 'strategyRebuildsUsed',
    remaining: 'strategyRebuildsRemaining',
    limit: 'strategyRebuildsLimit',
  },
  youtubeScripts: {
    label: 'YouTube-сценарии',
    unavailableLabel: 'YouTube-сценарии недоступны на вашем тарифе',
    used: 'youtubeScriptsUsed',
    remaining: 'youtubeScriptsRemaining',
    limit: 'youtubeScriptsLimit',
  },
  longreads: {
    label: 'Лонгриды',
    unavailableLabel: 'Лонгриды недоступны на вашем тарифе',
    used: 'longreadsUsed',
    remaining: 'longreadsRemaining',
    limit: 'longreadsLimit',
  },
  credits: {
    label: 'Credits',
    unavailableLabel: 'Credits недоступны на вашем тарифе',
    used: 'creditsUsed',
    remaining: 'creditsRemaining',
    limit: 'monthlyCredits',
  },
};

export type UsageLimitBadgeProps = {
  label: string;
  remaining: number;
  limit: number;
  used?: number;
  resetText?: string;
  hrefToUpgrade?: string;
};

export type UsageLimitCardProps = {
  title: string;
  description: string;
  used: number;
  remaining: number;
  limit: number;
};

function getTone(used: number, limit: number): 'normal' | 'warning' | 'critical' | 'empty' {
  if (limit <= 0) return 'empty';
  const remaining = Math.max(0, limit - used);
  if (remaining === 0) return 'empty';
  const ratio = used / limit;
  if (ratio >= 0.9) return 'critical';
  if (ratio >= 0.7) return 'warning';
  return 'normal';
}

function toneClass(tone: ReturnType<typeof getTone>): string {
  if (tone === 'warning') return ` ${s.badgeWarning}`;
  if (tone === 'critical') return ` ${s.badgeCritical}`;
  if (tone === 'empty') return ` ${s.badgeEmpty}`;
  return '';
}

export function UsageLimitBadge({ label, remaining, limit, used, resetText, hrefToUpgrade }: UsageLimitBadgeProps) {
  if (limit < 0) return null;
  if (limit === 0) {
    return <span className={`${s.badge} ${s.badgeEmpty}`}>{label}: недоступно на вашем тарифе</span>;
  }

  const normalizedUsed = used ?? Math.max(0, limit - remaining);
  const tone = getTone(normalizedUsed, limit);
  const safeRemaining = Math.max(0, remaining);

  let text = `${label}: ${formatLimitNumber(safeRemaining)} из ${formatLimitNumber(limit)} осталось`;
  if (tone === 'warning') text = `${label} скоро закончатся: осталось ${formatLimitNumber(safeRemaining)} из ${formatLimitNumber(limit)}`;
  if (tone === 'critical') text = `Осталось ${formatLimitNumber(safeRemaining)} из ${formatLimitNumber(limit)}: ${label.toLowerCase()}`;
  if (tone === 'empty') text = `Лимит ${label.toLowerCase()} закончился`;

  return (
    <span className={`${s.badge}${toneClass(tone)}`}>
      <strong>{text}</strong>
      {resetText && tone !== 'empty' && <span>{resetText}</span>}
      {tone === 'empty' && hrefToUpgrade && <Link className={s.upgradeLink} to={hrefToUpgrade}>Увеличить лимиты</Link>}
    </span>
  );
}

export function UsageLimitCard({ title, description, used, remaining, limit }: UsageLimitCardProps) {
  const percent = limit > 0 ? Math.min(100, Math.max(0, (used / limit) * 100)) : 0;
  const unavailable = limit === 0;

  return (
    <article className={s.card}>
      <div className={s.cardHeader}>
        <h3 className={s.cardTitle}>{title}</h3>
      </div>
      <div className={s.cardValue}>
        {unavailable ? 'Недоступно' : `${formatLimitNumber(remaining)} из ${formatLimitNumber(limit)} осталось`}
      </div>
      <p className={s.cardDescription}>{description}</p>
      {!unavailable && (
        <>
          <div className={s.progressTrack} aria-hidden="true">
            <div className={s.progressBar} style={{ width: `${percent}%` }} />
          </div>
          <div className={s.progressText}>{formatLimitNumber(used)} из {formatLimitNumber(limit)} использовано</div>
        </>
      )}
    </article>
  );
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

export function getLimitValue(billing: BillingMe, key: UsageLimitKey) {
  const def = LIMIT_DEFINITIONS[key];
  return {
    label: def.label,
    unavailableLabel: def.unavailableLabel,
    used: Number(billing.usage[def.used] ?? 0),
    remaining: Number(billing.usage[def.remaining] ?? 0),
    limit: Number(billing.limits[def.limit] ?? -1),
  };
}

export function SectionUsageLimits({ section }: { section: SectionUsageLimitsSection }) {
  const { billing, loading, error } = useBillingMe();
  const keys = SECTION_LIMITS[section];
  const resetText = section === 'ai_chat' ? 'Лимит обновится завтра' : undefined;
  const upgradeHref = appPath('/pricing');

  const badges = useMemo(() => {
    if (!billing) return [];
    return keys.map((key) => getLimitValue(billing, key));
  }, [billing, keys]);

  if (loading) {
    return (
      <div className={s.localWrap}>
        <div className={s.badgeRow}>
          <span className={s.skeletonBadge}>Загружаем лимиты... <span className={s.skeletonDot} /></span>
        </div>
      </div>
    );
  }

  if (error || !billing) {
    return (
      <div className={s.localWrap}>
        <span className={s.errorBadge}>Лимиты временно недоступны</span>
      </div>
    );
  }

  return (
    <div className={s.localWrap}>
      <div className={s.badgeRow}>
        {badges.map((item) => (
          <UsageLimitBadge
            key={item.label}
            label={item.label}
            used={item.used}
            remaining={item.remaining}
            limit={item.limit}
            resetText={resetText}
            hrefToUpgrade={upgradeHref}
          />
        ))}
      </div>
    </div>
  );
}
