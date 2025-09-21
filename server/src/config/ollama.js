import axios from 'axios';
import { getEnv } from './env.js';

export function getOllamaClient() {
  const { OLLAMA_BASE_URL } = getEnv();
  const client = axios.create({ baseURL: OLLAMA_BASE_URL, timeout: 120000 });
  return client;
}
