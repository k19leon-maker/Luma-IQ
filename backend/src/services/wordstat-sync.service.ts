import crypto from 'crypto';
import { env } from '../config/env';
import { googleSheetsService } from './google-sheets.service';
import {
  type WordstatDevice,
  type WordstatDynamicsPoint,
  type WordstatPhrase,
  yandexWordstatService,
} from './yandex-wordstat.service';

const SHEETS = {
  keywords: "'SEO — Запросы'",
  history: "'SEO — История Wordstat'",
  queue: "'SEO — Очередь'",
  settings: "'SEO — Настройки'",
} as const;

const PRICE_RUB = {
  top: 0.02,
  dynamics: 0.02,
  regions: 0.05,
} as const;

type QueueRow = {
  rowNumber: number;
  id: string;
  phrase: string;
  clusterId: string;
  problemId: string;
  region: string;
  device: string;
  historyMonths: number;
  status: string;
  cells: string[];
};

function normalizePhrase(value: string): string {
  return value.toLocaleLowerCase('ru-RU').replace(/\s+/g, ' ').trim();
}

function stableId(prefix: string, value: string): string {
  return `${prefix}-${crypto.createHash('sha1').update(value).digest('hex').slice(0, 12).toUpperCase()}`;
}

function deviceCode(value: string): WordstatDevice {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'desktop') return 'DEVICE_DESKTOP';
  if (normalized === 'phone') return 'DEVICE_PHONE';
  if (normalized === 'tablet') return 'DEVICE_TABLET';
  return 'DEVICE_ALL';
}

function regionIds(value: string): string[] | undefined {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === 'все' || normalized === 'all') return undefined;
  if (normalized.includes('росси')) return ['225'];
  if (normalized.includes('моск')) return ['213'];
  if (normalized.includes('петербург') || normalized.includes('спб')) return ['2'];
  const explicit = value.split(',').map((item) => item.trim()).filter((item) => /^\d+$/.test(item));
  return explicit.length ? explicit : undefined;
}

function completedMonthlyRange(months: number): { fromDate: string; toDate: string } {
  const now = new Date();
  const lastMonthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59));
  const from = new Date(Date.UTC(lastMonthEnd.getUTCFullYear(), lastMonthEnd.getUTCMonth() - months + 1, 1));
  return { fromDate: from.toISOString(), toDate: lastMonthEnd.toISOString() };
}

function average(points: WordstatDynamicsPoint[]): number {
  if (!points.length) return 0;
  return Math.round(points.reduce((sum, point) => sum + Number(point.count || 0), 0) / points.length);
}

function trend(points: WordstatDynamicsPoint[]): string {
  if (points.length < 6) return 'Недостаточно данных';
  const counts = points.map((point) => Number(point.count || 0));
  const previous = counts.slice(-6, -3).reduce((sum, value) => sum + value, 0) / 3;
  const recent = counts.slice(-3).reduce((sum, value) => sum + value, 0) / 3;
  if (!previous) return 'Недостаточно данных';
  const delta = Math.round(((recent - previous) / previous) * 100);
  return `${delta > 0 ? '+' : ''}${delta}%`;
}

function seasonality(points: WordstatDynamicsPoint[]): string {
  if (points.length < 6) return 'Недостаточно данных';
  const counts = points.map((point) => Number(point.count || 0));
  const avg = counts.reduce((sum, value) => sum + value, 0) / counts.length;
  const max = Math.max(...counts);
  if (!avg) return 'Нет спроса';
  if (max / avg >= 1.5) return 'Высокая';
  if (max / avg >= 1.25) return 'Средняя';
  return 'Низкая';
}

function keywordRow(input: {
  phrase: string;
  count: number;
  type: string;
  queue: QueueRow;
  fetchedAt: string;
  dynamics?: WordstatDynamicsPoint[];
}): Array<string | number> {
  const normalized = normalizePhrase(input.phrase);
  const keywordId = stableId('KW', `${normalized}|${input.queue.region}|${input.queue.device}`);
  return [
    keywordId,
    input.phrase,
    normalized,
    '',
    '',
    input.queue.problemId,
    input.queue.clusterId,
    input.type,
    '',
    input.queue.region,
    input.queue.device,
    input.count,
    input.dynamics ? average(input.dynamics) : '',
    input.dynamics ? trend(input.dynamics) : '',
    input.dynamics ? seasonality(input.dynamics) : '',
    '',
    '',
    '',
    'На проверку',
    '',
    input.fetchedAt,
    'Yandex Wordstat API',
  ];
}

function mergeKeywordRows(existing: string[][], incoming: Array<Array<string | number>>): Array<Array<string | number>> {
  const byId = new Map<string, Array<string | number>>();
  for (const row of existing) {
    if (row[0]) byId.set(row[0], row);
  }
  for (const row of incoming) {
    const old = byId.get(String(row[0]));
    if (old) {
      // Preserve editorial/manual columns while refreshing Wordstat metrics.
      for (const index of [3, 4, 8, 15, 16, 17, 18, 19]) {
        if (old[index] !== undefined && old[index] !== '') row[index] = old[index];
      }
    }
    byId.set(String(row[0]), row);
  }
  return [...byId.values()];
}

function mergeHistoryRows(existing: string[][], incoming: Array<Array<string | number>>): Array<Array<string | number>> {
  const byId = new Map<string, Array<string | number>>();
  for (const row of existing) {
    if (row[0]) byId.set(row[0], row);
  }
  for (const row of incoming) byId.set(String(row[0]), row);
  return [...byId.values()];
}

function parseQueue(rows: string[][]): QueueRow[] {
  return rows
    .map((cells, index) => ({
      rowNumber: index + 2,
      id: cells[0] ?? '',
      phrase: cells[1] ?? '',
      clusterId: cells[2] ?? '',
      problemId: cells[3] ?? '',
      region: cells[4] || 'Россия',
      device: cells[5] || 'all',
      historyMonths: Math.max(1, Number(cells[7] || 24)),
      status: cells[8] || 'Новый',
      cells: Array.from({ length: 13 }, (_, cellIndex) => cells[cellIndex] ?? ''),
    }))
    .filter((row) => row.id && row.phrase);
}

function phrasesFromTop(results: WordstatPhrase[] | undefined, type: string) {
  return (results ?? []).map((item) => ({
    phrase: item.phrase,
    count: Number(item.count || 0),
    type,
  }));
}

export const wordstatSyncService = {
  async run() {
    const [queueValues, keywordValues, historyValues] = await Promise.all([
      googleSheetsService.getValues(`${SHEETS.queue}!A2:M1000`),
      googleSheetsService.getValues(`${SHEETS.keywords}!A2:V2000`),
      googleSheetsService.getValues(`${SHEETS.history}!A2:L5000`),
    ]);

    const queue = parseQueue(queueValues);
    const candidates = queue
      .filter((row) => row.status === 'Новый' || row.status === 'Ошибка')
      .slice(0, env.WORDSTAT_MAX_SEEDS_PER_RUN);

    const callsPerSeed = 2 + (env.WORDSTAT_INCLUDE_REGIONS ? 1 : 0);
    const estimatedCost = candidates.length * (
      PRICE_RUB.top + PRICE_RUB.dynamics + (env.WORDSTAT_INCLUDE_REGIONS ? PRICE_RUB.regions : 0)
    );
    if (estimatedCost > env.WORDSTAT_MAX_COST_RUB_PER_RUN) {
      throw new Error(
        `Estimated Wordstat cost ${estimatedCost.toFixed(2)} RUB exceeds WORDSTAT_MAX_COST_RUB_PER_RUN`,
      );
    }

    const incomingKeywords: Array<Array<string | number>> = [];
    const incomingHistory: Array<Array<string | number>> = [];
    let successful = 0;
    let failed = 0;
    let calls = 0;

    for (const item of candidates) {
      item.cells[8] = 'В работе';
      item.cells[10] = new Date().toISOString();
      item.cells[12] = '';

      try {
        const devices = [deviceCode(item.device)];
        const regions = regionIds(item.region);
        const dateRange = completedMonthlyRange(item.historyMonths);
        const [top, dynamics] = await Promise.all([
          yandexWordstatService.getTop({ phrase: item.phrase, regions, devices }),
          yandexWordstatService.getDynamics({
            phrase: item.phrase,
            regions,
            devices,
            fromDate: dateRange.fromDate,
            toDate: dateRange.toDate,
          }),
        ]);
        calls += 2;
        if (env.WORDSTAT_INCLUDE_REGIONS) {
          await yandexWordstatService.getRegionsDistribution({ phrase: item.phrase, devices });
          calls += 1;
        }

        const fetchedAt = new Date().toISOString();
        const dynamicsPoints = dynamics.results ?? [];
        incomingKeywords.push(keywordRow({
          phrase: item.phrase,
          count: Number(top.totalCount || 0),
          type: 'Основной',
          queue: item,
          fetchedAt,
          dynamics: dynamicsPoints,
        }));

        const related = [
          ...phrasesFromTop(top.results, 'Содержит фразу'),
          ...phrasesFromTop(top.associations, 'Похожий'),
        ];
        const deduped = new Map<string, { phrase: string; count: number; type: string }>();
        for (const phrase of related) {
          const key = normalizePhrase(phrase.phrase);
          const current = deduped.get(key);
          if (!current || phrase.count > current.count) deduped.set(key, phrase);
        }
        for (const phrase of deduped.values()) {
          incomingKeywords.push(keywordRow({ ...phrase, queue: item, fetchedAt }));
        }

        const seedKeywordId = stableId(
          'KW',
          `${normalizePhrase(item.phrase)}|${item.region}|${item.device}`,
        );
        for (const point of dynamicsPoints) {
          const period = point.date.slice(0, 7);
          incomingHistory.push([
            stableId('SNAP', `${seedKeywordId}|${period}`),
            seedKeywordId,
            item.phrase,
            'Месяц',
            point.date,
            (regions ?? []).join(','),
            item.region,
            item.device,
            Number(point.count || 0),
            point.share || '',
            fetchedAt,
            'Yandex Wordstat API',
          ]);
        }

        item.cells[8] = 'Готово';
        item.cells[11] = fetchedAt;
        item.cells[12] = `Получено фраз: ${deduped.size + 1}`;
        successful += 1;
      } catch (error) {
        item.cells[8] = 'Ошибка';
        item.cells[11] = new Date().toISOString();
        item.cells[12] = error instanceof Error ? error.message.slice(0, 300) : 'Неизвестная ошибка';
        failed += 1;
      }
    }

    const mergedKeywords = mergeKeywordRows(keywordValues, incomingKeywords);
    const mergedHistory = mergeHistoryRows(historyValues, incomingHistory);
    const queueOutput = queue.map((row) => row.cells);
    const completedAt = new Date().toISOString();
    const actualCost = calls * PRICE_RUB.top + (env.WORDSTAT_INCLUDE_REGIONS ? successful * 0.03 : 0);

    await googleSheetsService.batchUpdateValues([
      { range: `${SHEETS.keywords}!A2:V${mergedKeywords.length + 1}`, values: mergedKeywords },
      { range: `${SHEETS.history}!A2:L${mergedHistory.length + 1}`, values: mergedHistory },
      { range: `${SHEETS.queue}!A2:M${queueOutput.length + 1}`, values: queueOutput },
      { range: `${SHEETS.settings}!B2`, values: [[failed ? 'Завершено с ошибками' : 'Подключено']] },
      { range: `${SHEETS.settings}!B10`, values: [[completedAt]] },
      {
        range: `${SHEETS.settings}!B11`,
        values: [[`Обработано: ${successful}; ошибок: ${failed}; API-вызовов: ${calls}; стоимость: ${actualCost.toFixed(2)} ₽`]],
      },
    ]);

    return {
      candidates: candidates.length,
      successful,
      failed,
      apiCalls: calls,
      estimatedCostRub: Number(actualCost.toFixed(2)),
      keywords: incomingKeywords.length,
      historyPoints: incomingHistory.length,
      callsPerSeed,
    };
  },
};
