import { env } from '../config/env';
import { aiFeatureFlagsService } from './ai-feature-flags.service';
import { aiPilotMetricsService } from './ai-pilot-metrics.service';
import { aiPointReconciliationService } from './ai-point-reconciliation.service';

let timer: NodeJS.Timeout | null = null;
let running = false;

async function runMaintenance(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const sweep = await aiPointReconciliationService.sweepStaleReservations({
      olderThanMinutes: env.AI_POINT_STALE_MINUTES,
    });
    if (sweep.captured || sweep.released) {
      console.info('[AI maintenance] stale reservations settled', sweep);
    }

    if (await aiFeatureFlagsService.isEnabled('AI_ORCHESTRATION_V2')) {
      const metrics = await aiPilotMetricsService.report({ days: 1 });
      for (const alert of metrics.alerts) {
        console.error('[AI rollout alert]', alert);
      }
    }
  } catch (error) {
    console.error('[AI maintenance] failed', error instanceof Error ? error.message : error);
  } finally {
    running = false;
  }
}

export const aiMaintenanceService = {
  start(): void {
    if (timer) return;
    void runMaintenance();
    timer = setInterval(
      () => void runMaintenance(),
      env.AI_POINT_SWEEPER_INTERVAL_MINUTES * 60_000,
    );
    timer.unref();
  },

  stop(): void {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
  },

  runNow: runMaintenance,
};
