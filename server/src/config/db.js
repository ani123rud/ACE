import mongoose from 'mongoose';
import { getEnv } from './env.js';

export async function connectMongo(retries = 5) {
  const { MONGODB_URI } = getEnv();
  for (let i = 0; i < retries; i++) {
    try {
      await mongoose.connect(MONGODB_URI);
      console.log('[mongo] connected');
      return;
    } catch (e) {
      console.warn(`[mongo] connect failed (attempt ${i + 1}/${retries})`, e.message);
      await new Promise(r => setTimeout(r, 1500));
    }
  }
  throw new Error('Could not connect to MongoDB');
}
