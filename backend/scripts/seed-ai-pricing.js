const path = require('path');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const VALID_FROM = new Date('2026-05-19T00:00:00.000Z');

const PRICING = [
  {
    provider: 'OPENAI',
    model: 'gpt-5.5',
    inputPricePer1M: '5.00',
    outputPricePer1M: '30.00',
    cachedInputPricePer1M: '0.50',
    sourceUrl: 'https://openai.com/api/pricing/',
    sourceLabel: 'OpenAI API Pricing',
  },
  {
    provider: 'OPENAI',
    model: 'gpt-5.4',
    inputPricePer1M: '2.50',
    outputPricePer1M: '15.00',
    cachedInputPricePer1M: '0.25',
    sourceUrl: 'https://openai.com/api/pricing/',
    sourceLabel: 'OpenAI API Pricing',
  },
  {
    provider: 'OPENAI',
    model: 'gpt-5.4-mini',
    inputPricePer1M: '0.75',
    outputPricePer1M: '4.50',
    cachedInputPricePer1M: '0.075',
    sourceUrl: 'https://openai.com/api/pricing/',
    sourceLabel: 'OpenAI API Pricing',
  },
  {
    provider: 'ANTHROPIC',
    model: 'claude-opus-4-6',
    inputPricePer1M: '5.00',
    outputPricePer1M: '25.00',
    cachedInputPricePer1M: '0.50',
    promptCacheWritePricePer1M: '6.25',
    sourceUrl: 'https://claude.com/pricing',
    sourceLabel: 'Claude API Pricing',
  },
  {
    provider: 'ANTHROPIC',
    model: 'claude-sonnet-4-6',
    inputPricePer1M: '3.00',
    outputPricePer1M: '15.00',
    cachedInputPricePer1M: '0.30',
    promptCacheWritePricePer1M: '3.75',
    sourceUrl: 'https://claude.com/pricing',
    sourceLabel: 'Claude API Pricing',
  },
  {
    provider: 'ANTHROPIC',
    model: 'claude-haiku-4-5-20251001',
    inputPricePer1M: '1.00',
    outputPricePer1M: '5.00',
    cachedInputPricePer1M: '0.10',
    promptCacheWritePricePer1M: '1.25',
    sourceUrl: 'https://claude.com/pricing',
    sourceLabel: 'Claude API Pricing',
  },
];

function samePrice(active, next) {
  return (
    active.inputPricePer1M.toString() === next.inputPricePer1M &&
    active.outputPricePer1M.toString() === next.outputPricePer1M &&
    (active.cachedInputPricePer1M?.toString() ?? null) === next.cachedInputPricePer1M
  );
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required');
  }

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  try {
    for (const item of PRICING) {
      const active = await prisma.aIModelPricing.findFirst({
        where: {
          provider: item.provider,
          model: item.model,
          validTo: null,
        },
        orderBy: { validFrom: 'desc' },
      });

      if (active && samePrice(active, item)) {
        console.log(`unchanged ${item.provider}/${item.model}`);
        continue;
      }

      if (active) {
        await prisma.aIModelPricing.update({
          where: { id: active.id },
          data: { validTo: VALID_FROM },
        });
        console.log(`closed old ${item.provider}/${item.model}`);
      }

      await prisma.aIModelPricing.create({
        data: {
          provider: item.provider,
          model: item.model,
          inputPricePer1M: item.inputPricePer1M,
          outputPricePer1M: item.outputPricePer1M,
          cachedInputPricePer1M: item.cachedInputPricePer1M,
          currency: 'USD',
          validFrom: VALID_FROM,
          validTo: null,
          metadata: {
            sourceUrl: item.sourceUrl,
            sourceLabel: item.sourceLabel,
            capturedAt: '2026-05-19',
            promptCacheWritePricePer1M: item.promptCacheWritePricePer1M ?? null,
            note: 'Prices are stored as historical provider cost basis per 1M tokens.',
          },
        },
      });
      console.log(`created ${item.provider}/${item.model}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
