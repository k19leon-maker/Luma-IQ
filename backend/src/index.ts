import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import authRouter from './routes/auth.routes';
import aiRouter from './routes/ai.routes';
import jtbdRouter from './routes/jtbd.routes';
import projectRouter from './routes/project.routes';
import contentRouter from './routes/content.routes';
import productsRouter from './routes/products.routes';
import contentPlanRouter from './routes/content-plan.routes';
import usersRouter from './routes/users.routes';
import strategyExportRouter from './routes/strategy-export.routes';
import filesRouter from './routes/files.routes';
import paymentRouter from './routes/payment.routes';
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
app.use(cookieParser());
app.use(passport.initialize());

app.get('/api/v1/health', (_req, res) => {
  res.json({ status: 'ok', service: 'lumaiq-backend' });
});

app.use('/api/v1/auth', authRouter);
app.use('/api/v1/ai', aiRouter);
app.use('/api/v1/jtbd', jtbdRouter);
app.use('/api/v1/projects', projectRouter);
app.use('/api/v1/content', contentRouter);
app.use('/api/v1/products', productsRouter);
app.use('/api/v1/content-plan', contentPlanRouter);
app.use('/api/v1/users', usersRouter);
app.use('/api/v1/strategy', strategyExportRouter);
app.use('/api/v1/files', filesRouter);
app.use('/api/v1/payments', paymentRouter);

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
