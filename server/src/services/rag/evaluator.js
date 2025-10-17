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
    // Improved fallback heuristic without breaking the flow
    const len = (aText || '').trim().split(/\s+/).filter(Boolean).length;
    const hasKeywords = /\b(function|class|algorithm|method|variable|object|array|loop|condition|if|else|for|while|return|print|console|error|exception|try|catch|async|await|promise|callback|event|api|http|request|response|data|database|sql|mongodb|react|component|state|props|hook|effect|context|redux|store|action|reducer|middleware|router|route|controller|service|model|view|template|style|css|html|javascript|typescript|python|java|c\+\+|php|ruby|go|rust|swift|kotlin|scala|clojure|haskell|erlang|elixir)\b/i.test(aText);
    const hasTechnicalTerms = /\b(api|endpoint|authentication|authorization|validation|serialization|parsing|encoding|decoding|encryption|hash|token|jwt|oauth|ssl|tls|cors|csrf|middleware|framework|library|package|dependency|version|build|compile|deploy|server|client|browser|mobile|desktop|web|app|application|software|program|code|script|function|method|class|object|variable|constant|parameter|argument|return|value|type|interface|abstract|inherit|polymorph|encapsulat|override|overload|constructor|destructor|garbage|collection|memory|leak|performance|optimization|scalability|security|vulnerability|attack|injection|breach|hack|exploit|patch|update|fix|bug|issue|error|exception|debug|log|trace|test|unit|integration|e2e|mock|stub|spy|fixture|assertion|expectation)\b/i.test(aText);

    let score;
    if (len < 3) {
      score = 1; // Very short answer
    } else if (len < 10) {
      score = 3; // Too brief
    } else if (len < 20) {
      score = 4; // Brief but present
    } else if (len < 50) {
      score = hasKeywords ? 6 : 5; // Decent length, check for keywords
    } else if (len < 100) {
      score = hasKeywords && hasTechnicalTerms ? 8 : (hasKeywords ? 7 : 6);
    } else {
      score = hasKeywords && hasTechnicalTerms ? 9 : (hasKeywords ? 8 : 7);
    }

    const feedback = len < 3
      ? 'Please provide a more complete answer with specific details.'
      : len < 20
      ? 'Your answer is quite brief. Consider elaborating with more detail and examples.'
      : hasKeywords && hasTechnicalTerms
      ? 'Good technical answer with relevant keywords. Consider adding concrete examples.'
      : hasKeywords
      ? 'Good use of technical terms. Try to be more specific with examples and implementation details.'
      : 'Thanks for your answer. Consider using more technical terminology and providing concrete examples.';

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

