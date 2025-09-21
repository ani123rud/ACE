import { Router } from 'express';
import { scrapeAndIngest } from '../services/scraper/scrape.js';

const r = Router();

r.post('/', async (req, res) => {
  const { domain, urls, mode } = req.body || {};
  if (!Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({ error: 'urls[] required' });
  }
  const result = await scrapeAndIngest({ domain, urls, mode: mode || 'static' });
  res.json(result);
});

export default r;
