import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import passport from 'passport';
import dotenv from 'dotenv';
import authRouter from './routes/auth.routes';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }));
app.use(morgan('dev'));
app.use(express.json());
app.use(passport.initialize());

app.get('/api/v1/health', (_req, res) => {
  res.json({ status: 'ok', service: 'psy-boost-backend' });
});

app.use('/api/v1/auth', authRouter);
// app.use('/api/v1/jtbd', jtbdRouter);
// app.use('/api/v1/products', productsRouter);
// app.use('/api/v1/generate', generateRouter);

app.listen(PORT, () => {
  console.log(`Backend запущен на http://localhost:${PORT}`);
});

export default app;
