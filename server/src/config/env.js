export function getEnv() {
  const {
    MONGODB_URI = 'mongodb://127.0.0.1:27017/voice-interview',
    PORT = '4000',
    OLLAMA_BASE_URL = 'http://127.0.0.1:11434',
    OLLAMA_LLM = 'mistral',
    OLLAMA_EMBED_MODEL = 'nomic-embed-text',
    SCRAPE_ALLOWLIST_DOMAINS = 'geeksforgeeks.org,interviewbit.com',
    VISION_BASE_URL = 'http://127.0.0.1:5001',
  } = process.env;

  return {
    MONGODB_URI,
    PORT: Number(PORT),
    OLLAMA_BASE_URL,
    OLLAMA_LLM,
    OLLAMA_EMBED_MODEL,
    SCRAPE_ALLOWLIST_DOMAINS: SCRAPE_ALLOWLIST_DOMAINS.split(',').map(s => s.trim()).filter(Boolean),
    VISION_BASE_URL,
  };
}
