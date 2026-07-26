import { Prisma } from '@prisma/client';
import {
  PRICING_PLANS,
  PUBLIC_PAID_PLAN_IDS,
  type PricingPlan,
  type PublicPaidPlanId,
} from '../config/pricing-plans';
import { prisma } from '../lib/prisma';

type PlanOverride = {
  code: string;
  isPublic: boolean | null;
  isPurchasable: boolean | null;
  displayOrder: number | null;
  shortDescription: string | null;
  extendedDescription: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type RuntimePricingPlan = PricingPlan & {
  createdAt: Date | null;
  updatedAt: Date | null;
};

function applyOverride(plan: PricingPlan, override?: PlanOverride): RuntimePricingPlan {
  if (!override || plan.legacy) {
    return { ...plan, createdAt: null, updatedAt: null };
  }
  return {
    ...plan,
    public: override.isPublic ?? plan.public,
    purchasable: override.isPurchasable ?? plan.purchasable,
    displayOrder: override.displayOrder ?? plan.displayOrder,
    shortDescription: override.shortDescription ?? plan.shortDescription,
    extendedDescription: override.extendedDescription ?? plan.extendedDescription,
    createdAt: override.createdAt,
    updatedAt: override.updatedAt,
  };
}

async function overrideMap(): Promise<Map<string, PlanOverride>> {
  const rows = await prisma.planCatalogOverride.findMany();
  return new Map(rows.map((row) => [row.code, row]));
}

export const planCatalogService = {
  async listAll(): Promise<RuntimePricingPlan[]> {
    const overrides = await overrideMap();
    return Object.values(PRICING_PLANS)
      .map((plan) => applyOverride(plan, overrides.get(plan.id)))
      .sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name));
  },

  async listPublic(): Promise<RuntimePricingPlan[]> {
    const overrides = await overrideMap();
    return PUBLIC_PAID_PLAN_IDS
      .map((id) => applyOverride(PRICING_PLANS[id], overrides.get(id)))
      .filter((plan) => plan.public)
      .sort((a, b) => a.displayOrder - b.displayOrder);
  },

  async isPurchasable(code: PublicPaidPlanId): Promise<boolean> {
    const override = await prisma.planCatalogOverride.findUnique({ where: { code } });
    return applyOverride(PRICING_PLANS[code], override ?? undefined).purchasable;
  },

  async update(input: {
    code: PublicPaidPlanId;
    actorUserId: string;
    isPublic?: boolean;
    isPurchasable?: boolean;
    displayOrder?: number;
    shortDescription?: string;
    extendedDescription?: string;
  }): Promise<RuntimePricingPlan> {
    const before = await prisma.planCatalogOverride.findUnique({ where: { code: input.code } });
    const data = {
      isPublic: input.isPublic,
      isPurchasable: input.isPurchasable,
      displayOrder: input.displayOrder,
      shortDescription: input.shortDescription,
      extendedDescription: input.extendedDescription,
      updatedById: input.actorUserId,
    };
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.planCatalogOverride.upsert({
        where: { code: input.code },
        create: { code: input.code, ...data },
        update: data,
      });
      await tx.aIConfigurationAuditLog.create({
        data: {
          actorUserId: input.actorUserId,
          configType: 'pricing_plan',
          configKey: input.code,
          operation: 'UPDATE',
          before: before as unknown as Prisma.InputJsonValue,
          after: row as unknown as Prisma.InputJsonValue,
        },
      });
      return row;
    });
    return applyOverride(PRICING_PLANS[input.code], updated);
  },
};
