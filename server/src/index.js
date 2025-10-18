import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import { connectMongo } from './config/db.js';
import interviewRoutes from './routes/interview.js';
import eventsRoutes from './routes/events.js';
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

  try {
    await connectMongo();
    console.log('[server] MongoDB connected');
  } catch (error) {
    console.error('[server] MongoDB connection failed:', error);
  }

  try {
    await initRedis().catch((e) => {
      console.error('[server] redis init error (continuing without cache/queue)', e);
    });
  } catch (error) {
    console.error('[server] Redis initialization failed:', error);
  }

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, ts: Date.now() });
  });

  // Serve local storage files when using local backend
  try {
    const localRoot = await getLocalRoot();
    app.use('/files', express.static(localRoot));
    console.log('[server] static files served from', localRoot);
  } catch (error) {
    console.error('[server] Failed to setup static files:', error);
  }

  // Register routes with error handling
  try {
    app.use('/api/interview', interviewRoutes);
    console.log('[server] Interview routes registered');
  } catch (error) {
    console.error('[server] Failed to register interview routes:', error);
  }

  try {
    app.use('/api/interview/event', eventsRoutes);
    console.log('[server] Events routes registered');
  } catch (error) {
    console.error('[server] Failed to register events routes:', error);
  }

  try {
    app.use('/api/proctor', proctorRoutes);
    console.log('[server] Proctor routes registered');
  } catch (error) {
    console.error('[server] Failed to register proctor routes:', error);
  }

  try {
    app.use('/api/vision', visionRoutes);
    console.log('[server] Vision routes registered');
  } catch (error) {
    console.error('[server] Failed to register vision routes:', error);
  }

  try {
    app.use('/api/scoring', scoringRoutes);
    console.log('[server] Scoring routes registered');
  } catch (error) {
    console.error('[server] Failed to register scoring routes:', error);
  }

  try {
    app.use('/api/rag', ragRoutes);
    console.log('[server] RAG routes registered');
  } catch (error) {
    console.error('[server] Failed to register RAG routes:', error);
  }

  try {
    app.use('/api/admin', adminRoutes);
    console.log('[server] Admin routes registered');
  } catch (error) {
    console.error('[server] Failed to register admin routes:', error);
  }

  try {
    app.use('/api/alerts', alertsRoutes);
    console.log('[server] Alerts routes registered');
  } catch (error) {
    console.error('[server] Failed to register alerts routes:', error);
  }

  try {
    app.use('/api/auth', authRoutes);
    console.log('[server] Auth routes registered');
  } catch (error) {
    console.error('[server] Failed to register auth routes:', error);
  }

  const { PORT } = getEnv();
  app.listen(PORT, () => {
    console.log(`[server] listening on http://localhost:${PORT}`);
    console.log(`[server] Available endpoints:`);
    console.log(`[server] - Health: http://localhost:${PORT}/api/health`);
    console.log(`[server] - RAG ingest: http://localhost:${PORT}/api/rag/ingest`);
    console.log(`[server] - Vision reference: http://localhost:${PORT}/api/vision/reference`);
  });
}

bootstrap().catch((e) => {
  console.error('[server] fatal', e);
  process.exit(1);
});
