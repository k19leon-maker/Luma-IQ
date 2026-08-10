import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import authRouter from './routes/auth.routes';
import aiRouter from './routes/ai.routes';
import audioRouter from './routes/audio.routes';
import jtbdRouter from './routes/jtbd.routes';
import projectRouter from './routes/project.routes';
import contentRouter from './routes/content.routes';
import productsRouter from './routes/products.routes';
import contentPlanRouter from './routes/content-plan.routes';
import usersRouter from './routes/users.routes';
import strategyExportRouter from './routes/strategy-export.routes';
import filesRouter from './routes/files.routes';
import paymentRouter from './routes/payment.routes';
import checkoutRouter from './routes/checkout.routes';
import adminRouter from './routes/admin.routes';
import artifactRouter from './routes/artifact.routes';
import b2cRouter from './routes/b2c.routes';
import billingRouter from './routes/billing.routes';
import onboardingRouter from './routes/onboarding.routes';
import tasksRouter from './routes/tasks.routes';
import castDevRouter from './routes/castdev.routes';
import semeynoAiRelayRouter from './routes/semeyno-ai-relay.routes';
import telegramBotRouter from './routes/telegram-bot.routes';
import { env } from './config/env';
import { errorHandler } from './middleware/error.middleware';
import { healthService } from './services/health.service';
import { requestContext } from './middleware/request-context.middleware';

export function createApp() {
  const app = express();
  const allowedOrigins = [...new Set([
    ...env.FRONTEND_URL.split(',').map(s => s.trim()),
    'http://localhost:5173',
    'http://localhost:5174',
  ])];

  app.set('trust proxy', 1);
  app.use(requestContext);
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        connectSrc: ["'self'", ...allowedOrigins],
        upgradeInsecureRequests: env.NODE_ENV === 'production' ? [] : null,
      },
    },
    crossOriginResourcePolicy: { policy: 'same-site' },
  }));
  app.use(cors({
    origin: allowedOrigins,
    credentials: true,
  }));
  app.use(morgan('dev'));
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  app.use(passport.initialize());

  app.get('/api/v1/health', (_req, res) => {
    res.json({ status: 'ok', service: 'lumaiq-backend' });
  });
  app.get('/api/v1/health/deep', async (_req, res) => {
    const health = await healthService.deep();
    res.status(health.status === 'fail' ? 503 : 200).json(health);
  });

  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/ai', aiRouter);
  app.use('/api/v1/audio', audioRouter);
  app.use('/api/v1/jtbd', jtbdRouter);
  app.use('/api/v1/projects', projectRouter);
  app.use('/api/v1/content', contentRouter);
  app.use('/api/v1/products', productsRouter);
  app.use('/api/v1/content-plan', contentPlanRouter);
  app.use('/api/v1/users', usersRouter);
  app.use('/api/v1/strategy', strategyExportRouter);
  app.use('/api/v1/files', filesRouter);
  app.use('/api/v1/payments', paymentRouter);
  app.use('/api/v1/checkout', checkoutRouter);
  app.use('/api/v1/billing', billingRouter);
  app.use('/api/v1/onboarding', onboardingRouter);
  app.use('/api/v1/tasks', tasksRouter);
  app.use('/api/v1/castdev', castDevRouter);
  app.use('/api/v1/internal/semeyno-ai-relay', semeynoAiRelayRouter);
  app.use('/api/v1/telegram-bots', telegramBotRouter);
  app.use('/api/v1/admin', adminRouter);
  app.use('/api/v1/artifacts', artifactRouter);
  app.use('/api/v1/b2c', b2cRouter);

  app.use(errorHandler);

  return app;
}
