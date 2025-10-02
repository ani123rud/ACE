import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { connectMongo } from './config/db.js';
import interviewRoutes from './routes/interview.js';
import proctorRoutes from './routes/proctor.js';
import { getEnv } from './config/env.js';
import visionRoutes from './routes/vision.js';
import scoringRoutes from './routes/scoring.js';
import ragRoutes from './routes/rag.js';
import adminRoutes from './routes/admin.js';
import { initRedis } from './config/redis.js';
import alertsRoutes from './routes/alerts.js';
import path from 'path';
import { getLocalRoot } from './utils/storage.js';
import authRoutes from './routes/auth.js';

dotenv.config();

async function bootstrap() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '2mb' }));
  app.use(morgan('dev'));

  await connectMongo();
  await initRedis().catch((e) => {
    console.error('[server] redis init error (continuing without cache/queue)', e);
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, ts: Date.now() });
  });

  // Serve local storage files when using local backend
  try {
    const localRoot = await getLocalRoot();
    app.use('/files', express.static(localRoot));
    console.log('[server] static files served from', localRoot);
  } catch {}

  app.use('/api', interviewRoutes);
  app.use('/api/proctor', proctorRoutes);
  app.use('/api/vision', visionRoutes);
  app.use('/api/scoring', scoringRoutes);
  app.use('/api/rag', ragRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/alerts', alertsRoutes);
  app.use('/api/auth', authRoutes);

  const { PORT } = getEnv();
  app.listen(PORT, () => {
    console.log(`[server] listening on http://localhost:${PORT}`);
  });
}

bootstrap().catch((e) => {
  console.error('[server] fatal', e);
  process.exit(1);
});
