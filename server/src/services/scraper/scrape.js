import axios from 'axios';
import { load as cheerioLoad } from 'cheerio';
import Material from '../../models/Material.js';
import Question from '../../models/Question.js';
import { chunkText } from '../../utils/chunk.js';
import { embedTexts } from '../rag/embed.js';
import { getEnv } from '../../config/env.js';

function isAllowed(url) {
  const { SCRAPE_ALLOWLIST_DOMAINS } = getEnv();
  try {
    const u = new URL(url);
    return SCRAPE_ALLOWLIST_DOMAINS.some(d => u.hostname.includes(d));
  } catch {
    return false;
  }
}

export async function scrapeAndIngest({ domain, urls, mode = 'static' }) {
  const materials = [];
  const questions = [];

  for (const url of urls) {
    if (!isAllowed(url)) continue;
    try {
      const { data: html } = await axios.get(url, {
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        }
      });
      const $ = cheerioLoad(html);
      const text = $('body').text().replace(/\s+/g, ' ').trim();
      const chunks = chunkText(text, 1200, 200);
      let embeds = [];
      try {
        embeds = await embedTexts(chunks);
      } catch (e) {
        console.warn('[scrape] embedding failed for', url, e.message);
        embeds = chunks.map(() => []);
      }
      for (let i = 0; i < chunks.length; i++) {
        materials.push({ domain, url, chunkId: `${i}`, text: chunks[i], embedding: embeds[i] || [], source: url });
      }

      // naive Q/A extraction placeholders (tunable selectors can be added)
      $('h2, h3, li, p').each((_, el) => {
        const q = $(el).text().trim();
        if (q && q.length > 20 && q.endsWith('?')) {
          questions.push({ domain, question: q, difficulty: 'medium', source: url });
        }
      });
    } catch (e) {
      console.warn('[scrape] fetch failed', url, e.message);
    }
  }

  if (materials.length) await Material.insertMany(materials, { ordered: false }).catch(() => {});
  if (questions.length) await Question.insertMany(questions, { ordered: false }).catch(() => {});

  return { materialsAdded: materials.length, questionsAdded: questions.length };
}
