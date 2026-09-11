import 'dotenv/config';
import { prisma } from '../lib/prisma';
import { systemTelegramWorkerService } from '../services/system-telegram-worker.service';

async function shutdown(signal: string): Promise<void> {
  console.log('[SystemTelegramWorker] stopping', { signal });
  systemTelegramWorkerService.stop();
  await prisma.$disconnect();
  process.exit(0);
}

process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

systemTelegramWorkerService.start()
  .then((started) => {
    if (!started) {
      console.log('[SystemTelegramWorker] disabled');
      return prisma.$disconnect();
    }
    return undefined;
  })
  .catch(async (error: Error) => {
    console.error('[SystemTelegramWorker] startup failed', { message: error.message });
    await prisma.$disconnect();
    process.exit(1);
  });
