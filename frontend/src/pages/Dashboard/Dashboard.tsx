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
  about:     boolean;
  positioning: boolean;
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
  if (!f.about)     return { route: '/strategy/about',        label: 'О себе',              hint: 'Заполните базовую информацию об эксперте: роль, опыт, продукты, регалии и ограничения', btnText: 'Открыть «О себе» →' };
  if (!f.positioning) return { route: '/strategy/positioning', label: 'Позиционирование',    hint: 'Выберите стратегический вектор упаковки на базе брифа',            btnText: 'Выбрать вектор →' };
  if (!f.audience)  return { route: '/strategy/audience',     label: 'Целевую аудиторию',   hint: 'AI проанализирует и определит идеальный сегмент клиентов',         btnText: 'Анализировать ЦА →'    };
  if (!f.utp)       return { route: '/strategy/utp',          label: 'УТП',                 hint: 'На основе брифа, позиционирования и ЦА AI создаст УТП',             btnText: 'Создать УТП →'         };
  if (!f.social)    return { route: '/strategy/social',       label: 'Оформление соцсетей', hint: 'AI создаст описания профиля для Instagram, Telegram и ВКонтакте',   btnText: 'Оформить соцсети →'    };
  if (!f.main)      return { route: '/products/main', label: 'Основной продукт',    hint: 'Опишите флагманскую программу — самый важный продукт в линейке',    btnText: 'Создать продукт →'     };
  if (!f.mini)      return { route: '/products/mini', label: 'Мини-продукт',        hint: 'Создайте входной продукт по доступной цене',                        btnText: 'Создать мини-продукт →'};
  return              { route: '/products/lead-magnet',       label: 'Лид-магнит',          hint: 'Создайте бесплатный продукт для привлечения аудитории',             btnText: 'Создать лид-магнит →'  };
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
  const about     = useProgressStore((s) => s.expertProfileCompleted);
  const positioning = useProgressStore((s) => s.positioningCompleted);
  const unpacking = useProgressStore((s) => s.unpackingCompleted);
  const audience  = useProgressStore((s) => s.audienceCompleted);
  const utp       = useProgressStore((s) => s.utpCompleted);
  const social    = useProgressStore((s) => s.socialCompleted);

  // Products existence (from API, not flags — source of truth)
  const hasMain = products.some((p) => p.type === 'MAIN');
  const hasMini = products.some((p) => p.type === 'MINI');
  const hasFree = products.some((p) => p.type === 'FREE');

  const flags: SectionFlags = { about: about || unpacking, positioning, unpacking, audience, utp, social, main: hasMain, mini: hasMini, free: hasFree };

  const completedCount  = Object.entries(flags).filter(([key, value]) => key !== 'unpacking' && value).length; // 0–8
  const completionPct   = Math.round(completedCount / 8 * 100);

  const nextStep = getNextStep(flags);

  if (completedCount === 0) {
    return (
      <DashboardEmpty
        onStartUnpacking={() => navigate('/strategy/about')}
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
