import 'dotenv/config';
import { createApp } from './app';
import { projectService } from './services/project.service';
import { env } from './config/env';

const app = createApp();
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Backend запущен на http://localhost:${PORT}`);

  // В dev-режиме создаём dev-пользователя (нужен для работы с dev-token + БД)
  if (env.isDev) {
    projectService.ensureDevUser()
      .then(() => console.log('[Dev] Dev user ready'))
      .catch((err: Error) => console.warn('[Dev] Dev user bootstrap skipped (DB unavailable?):', err.message));
  }
});

export default app;
