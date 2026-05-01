import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProgressStore } from '../../store/progress.store';
import { useProjectsStore } from '../../store/projects.store';
import { useContentPlanStore } from '../../store/contentPlan.store';
import { productsApi, ApiProduct } from '../../api/products.api';
import DashboardEmpty      from '../../components/LumaIQ/DashboardEmpty';
import DashboardInProgress from '../../components/LumaIQ/DashboardInProgress';
import DashboardComplete   from '../../components/LumaIQ/DashboardComplete';

// ── Next-step logic ───────────────────────────────────────────────────────────

export interface SectionFlags {
  unpacking: boolean;
  audience:  boolean;
  utp:       boolean;
  social:    boolean;
  main:      boolean;
  mini:      boolean;
  free:      boolean;
}

export interface NextStep {
  route:   string;
  label:   string;
  hint:    string;
  btnText: string;
}

export function getNextStep(f: SectionFlags): NextStep {
  if (!f.unpacking) return { route: '/strategy/unpacking',    label: 'Распаковку',          hint: 'Расскажите об экспертизе — AI создаст профиль эксперта',          btnText: 'Начать распаковку →'   };
  if (!f.audience)  return { route: '/strategy/audience',     label: 'Целевую аудиторию',   hint: 'AI проанализирует и определит идеальный сегмент клиентов',         btnText: 'Анализировать ЦА →'    };
  if (!f.utp)       return { route: '/strategy/utp',          label: 'УТП',                 hint: 'На основе распаковки AI создаст уникальное торговое предложение',   btnText: 'Создать УТП →'         };
  if (!f.social)    return { route: '/strategy/social',       label: 'Оформление соцсетей', hint: 'AI создаст описания профиля для Instagram, Telegram и ВКонтакте',   btnText: 'Оформить соцсети →'    };
  if (!f.main)      return { route: '/strategy/product-main', label: 'Основной продукт',    hint: 'Опишите флагманскую программу — самый важный продукт в линейке',    btnText: 'Создать продукт →'     };
  if (!f.mini)      return { route: '/strategy/product-mini', label: 'Мини-продукт',        hint: 'Создайте входной продукт по доступной цене',                        btnText: 'Создать мини-продукт →'};
  return              { route: '/strategy/lead-magnet',       label: 'Лид-магнит',          hint: 'Создайте бесплатный продукт для привлечения аудитории',             btnText: 'Создать лид-магнит →'  };
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate         = useNavigate();
  const activeProjectId  = useProjectsStore((s) => s.activeProjectId);
  const [products, setProducts] = useState<ApiProduct[]>([]);

  // Load products + content plan when project changes
  useEffect(() => {
    if (!activeProjectId) return;
    productsApi.list(activeProjectId).then(setProducts).catch(() => {});
    useContentPlanStore.getState().loadItems(activeProjectId);
  }, [activeProjectId]);

  // Read 4 strategy flags individually (no object selector → no infinite loop)
  const unpacking = useProgressStore((s) => s.unpackingCompleted);
  const audience  = useProgressStore((s) => s.audienceCompleted);
  const utp       = useProgressStore((s) => s.utpCompleted);
  const social    = useProgressStore((s) => s.socialCompleted);

  // Products existence (from API, not flags — source of truth)
  const hasMain = products.some((p) => p.type === 'MAIN');
  const hasMini = products.some((p) => p.type === 'MINI');
  const hasFree = products.some((p) => p.type === 'FREE');

  const flags: SectionFlags = { unpacking, audience, utp, social, main: hasMain, mini: hasMini, free: hasFree };

  const completedCount  = Object.values(flags).filter(Boolean).length; // 0–7
  const completionPct   = Math.round(completedCount / 7 * 100);

  const nextStep = getNextStep(flags);

  if (completedCount === 0) {
    return (
      <DashboardEmpty
        onStartUnpacking={() => navigate('/strategy/unpacking')}
      />
    );
  }

  if (completionPct === 100) {
    return (
      <DashboardComplete
        products={products}
        onGenerateContent={() => navigate('/content-plan')}
      />
    );
  }

  return (
    <DashboardInProgress
      products={products}
      flags={flags}
      completedCount={completedCount}
      completionPct={completionPct}
      nextStep={nextStep}
      onContinue={() => navigate(nextStep.route)}
    />
  );
}
