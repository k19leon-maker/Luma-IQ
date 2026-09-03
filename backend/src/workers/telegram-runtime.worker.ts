import 'dotenv/config';
import { prisma } from '../lib/prisma';
import { telegramRuntimeWorkerService } from '../services/telegram-runtime-worker.service';

async function shutdown(signal: string): Promise<void> {
  console.log('[TelegramRuntimeV2] stopping', { signal });
  telegramRuntimeWorkerService.stop();
  await prisma.$disconnect();
  process.exit(0);
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

telegramRuntimeWorkerService.start()
  .then((started) => {
    if (!started) {
      console.log('[TelegramRuntimeV2] disabled; set TELEGRAM_RUNTIME_V2_ENABLED=true after staging readiness');
      return prisma.$disconnect();
    }
    return undefined;
  })
  .catch(async (error: Error) => {
    console.error('[TelegramRuntimeV2] startup failed', { message: error.message });
    await prisma.$disconnect();
    process.exit(1);
  });
