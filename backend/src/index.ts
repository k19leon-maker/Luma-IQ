import 'dotenv/config';
import { createApp } from './app';
import { projectService } from './services/project.service';
import { env } from './config/env';
import { castDevTranscriptionQueueService } from './services/castdev-transcription-queue.service';
import { batchJobService } from './services/batch-job.service';
import { aiMaintenanceService } from './services/ai-maintenance.service';
import { telegramBotRuntimeService } from './services/telegram-bot-runtime.service';

const app = createApp();
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Backend запущен на http://localhost:${PORT}`);
  castDevTranscriptionQueueService.recoverPending()
    .then((count) => {
      if (count > 0) console.log(`[CastDevQueue] восстановлено задач: ${count}`);
    })
    .catch((err: Error) => console.error('[CastDevQueue] recovery failed:', err.message));
  batchJobService.recoverPending()
    .then((count) => {
      if (count > 0) console.log(`[BatchJob] восстановлено задач: ${count}`);
      batchJobService.startPolling();
    })
    .catch((err: Error) => console.error('[BatchJob] recovery failed:', err.message));
  aiMaintenanceService.start();
  telegramBotRuntimeService.start();

  // В dev-режиме создаём dev-пользователя (нужен для работы с dev-token + БД)
  if (env.isDev) {
    projectService.ensureDevUser()
      .then(() => console.log('[Dev] Dev user ready'))
      .catch((err: Error) => console.warn('[Dev] Dev user bootstrap skipped (DB unavailable?):', err.message));
  }
});

export default app;
