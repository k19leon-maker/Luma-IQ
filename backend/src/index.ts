import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import passport from 'passport';
import authRouter from './routes/auth.routes';
import aiRouter from './routes/ai.routes';
import jtbdRouter from './routes/jtbd.routes';
import projectRouter from './routes/project.routes';
import { projectService } from './services/project.service';
import { env } from './config/env';

const app = express();
const PORT = process.env.PORT || 3001;
const allowedOrigins = [...new Set([
  env.FRONTEND_URL,
  'http://localhost:5173',
  'http://localhost:5174',
])];

app.use(helmet());
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));
app.use(morgan('dev'));
app.use(express.json());
app.use(passport.initialize());

app.get('/api/v1/health', (_req, res) => {
  res.json({ status: 'ok', service: 'psy-boost-backend' });
});

app.use('/api/v1/auth', authRouter);
app.use('/api/v1/ai', aiRouter);
app.use('/api/v1/jtbd', jtbdRouter);
app.use('/api/v1/projects', projectRouter);

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
