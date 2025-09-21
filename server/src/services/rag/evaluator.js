import { getOllamaClient } from '../../config/ollama.js';

export async function evaluateAnswer({ question, candidateText, context, history }) {
  const client = getOllamaClient();
  const system = `You are a rigorous technical interviewer. Use provided context as references. Be concise. Output ONLY valid minified JSON.`;
  // Trim long inputs for speed
  const ctx = Array.isArray(context) ? context.slice(0, 5).map((c) => String(c).slice(0, 500)) : [];
  const qText = String(question || '').slice(0, 500);
  const aText = String(candidateText || '').slice(0, 700);
  const prompt = `\nContext:\n${ctx.map((c, i) => `[${i + 1}] ${c}`).join('\n')}\n\nQuestion: ${qText}\nCandidate Answer: ${aText}\n\nInstructions:\n- Score from 0 to 10\n- Give 1-2 sentence feedback\n- Propose NEXT_QUESTION and difficulty (easy|medium|hard) based on performance\n- Output strictly JSON matching: { "score": number, "feedback": string, "nextQuestion": string|null, "nextDifficulty": "easy"|"medium"|"hard" }\n`;

  const model = process.env.OLLAMA_EVAL_LLM || process.env.OLLAMA_SCORER_LLM || process.env.OLLAMA_LLM || 'llama3.2:1b';
  let data;
  try {
    const resp = await client.post('/api/generate', {
      model,
      prompt: `${system}\n\n${prompt}`,
      options: { temperature: 0.2, num_predict: 120, num_ctx: 1536 },
      stream: false,
    });
    data = resp.data;
  } catch (e) {
    // Fallback heuristic without breaking the flow
    const len = (aText || '').trim().split(/\s+/).filter(Boolean).length;
    const score = len < 3 ? 2 : len < 20 ? 5 : 7;
    const feedback = len < 3
      ? 'Please provide a more complete answer with specific details.'
      : 'Thanks for your answer. Consider adding concrete examples and clarifying key concepts.';
    return { score, feedback, nextQuestion: null, nextDifficulty: 'medium' };
  }

  const text = data.response || '';
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  let parsed = { score: 0, feedback: '', nextQuestion: null, nextDifficulty: 'easy' };
  try {
    if (start !== -1 && end !== -1) {
      parsed = JSON.parse(text.slice(start, end + 1));
    }
  } catch (_) {}
  // Defensive defaults to ensure UI always has feedback
  if (typeof parsed.score !== 'number' || isNaN(parsed.score)) parsed.score = 0;
  if (!parsed.feedback || typeof parsed.feedback !== 'string') {
    // Simple heuristic fallback
    const len = (candidateText || '').trim().split(/\s+/).filter(Boolean).length;
    if (!candidateText || len < 3) parsed.feedback = 'Please provide a more complete answer with specific details.';
    else parsed.feedback = 'Thanks for your answer. Consider adding concrete examples and clarifying key concepts.';
  }
  if (!['easy','medium','hard'].includes(parsed.nextDifficulty)) parsed.nextDifficulty = 'easy';
  if (parsed.nextQuestion != null && typeof parsed.nextQuestion !== 'string') parsed.nextQuestion = null;
  return parsed;
}

