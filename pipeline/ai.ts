// One-line provider switch (PLAN): AI_PROVIDER=gemini | anthropic | replay.
//  gemini    — Google AI Studio free tier; gemini-2.5-flash, falls back to 2.5-flash-lite on quota or overload
//  anthropic — Claude Haiku 4.5 (ANTHROPIC_API_KEY); ~$10–30/month at Phase-1 volume
//  replay    — answers from files in AI_REPLAY_DIR; unanswered prompts are queued there.
//              Used by tests and for writing launch summaries by hand.
import fs from 'node:fs';
import path from 'node:path';
import { LIMITS } from './config.ts';
import type { State } from './types.ts';
import { sha } from './util.ts';

export class Pending extends Error {
  key: string;
  constructor(key: string) {
    super(`AI answer pending: ${key}`);
    this.key = key;
  }
}
export class OverBudget extends Error {}

export interface Ai {
  name: string;
  /** replayKey: stable id for the replay provider (defaults to a hash of the prompt). */
  json<T>(task: string, system: string, prompt: string, schema: object, replayKey?: string): Promise<T>;
  calls: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Pull the first JSON object/array out of a model reply. */
export function parseJson<T>(text: string): T {
  const s = text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
  try {
    return JSON.parse(s) as T;
  } catch {
    const start = s.search(/[[{]/);
    const end = Math.max(s.lastIndexOf('}'), s.lastIndexOf(']'));
    if (start >= 0 && end > start) return JSON.parse(s.slice(start, end + 1)) as T;
    throw new Error('AI reply was not JSON');
  }
}

/** `wait` is swappable so tests can run the retry paths without real delays. */
export function makeAi(state: State, opts: { wait?: (ms: number) => Promise<void> } = {}): Ai {
  const wait = opts.wait ?? sleep;
  const provider = (process.env.AI_PROVIDER || (process.env.GEMINI_API_KEY ? 'gemini' : process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'replay')).toLowerCase();
  const today = new Date().toISOString().slice(0, 10);
  if (state.aiCalls.day !== today) state.aiCalls = { day: today, count: 0 };

  // A run killed by the workflow timeout saves nothing, so AI work stops at a deadline instead.
  const deadline = Date.now() + LIMITS.aiMinutesPerRun * 6e4;
  const checkTime = () => {
    if (Date.now() > deadline) throw new OverBudget(`run time cap ${LIMITS.aiMinutesPerRun} min reached`);
  };

  const budget = () => {
    checkTime();
    if (state.aiCalls.count >= LIMITS.aiCallsPerDay) throw new OverBudget(`daily AI cap ${LIMITS.aiCallsPerDay} reached`);
    state.aiCalls.count++;
    ai.calls++;
  };

  let lastCall = 0;
  const pace = async (ms: number) => {
    const now = Date.now();
    lastCall = Math.max(now, lastCall + ms); // reserve a slot first: calls can wait side by side
    if (lastCall > now) await wait(lastCall - now);
  };

  // Best free-tier model first; when its daily quota runs out (or Google retires it) the run
  // continues on the next one. Override with GEMINI_MODEL / GEMINI_FALLBACK.
  const geminiModels = [
    process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    ...(process.env.GEMINI_FALLBACK || 'gemini-2.5-flash-lite').split(',').filter(Boolean),
  ];
  // Calls in a row that failed because even the last model was overloaded. Two of them and the
  // run stops asking (10 Nov 2026: every model answered 503, each summary then spent ~3 min in
  // retries and a 13-minute run published nothing). The next run, 4 hours later, tries again.
  let overloadedInARow = 0;
  const gemini = async (system: string, prompt: string, schema: object) => {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error('GEMINI_API_KEY not set');
    for (let attempt = 0; ; attempt++) {
      const model = geminiModels[0];
      await pace(6500); // free tier ≈ 10 requests/minute on Flash
      let res: Response;
      try {
        res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.2, responseMimeType: 'application/json', responseJsonSchema: schema },
          }),
          signal: AbortSignal.timeout(90000),
        });
      } catch (err) {
        // A call that hangs this long is the model being overloaded: same handling as a 503.
        if (!/abort|timeout/i.test(`${(err as Error).name} ${(err as Error).message}`)) throw err;
        res = new Response(JSON.stringify({ error: { message: 'timed out after 90 s' } }), { status: 504 });
      }
      const body: any = await res.json().catch(() => ({}));
      const msg = String(body?.error?.message ?? '');
      const outOfQuota = res.status === 429 && /per ?day|daily|PerDay/i.test(msg + JSON.stringify(body?.error?.details ?? ''));
      // 503 "high demand" can last for hours: one short retry, then the lighter model.
      const overloaded = res.status >= 500 && attempt >= 1;
      if ((res.status === 404 || outOfQuota || overloaded || (res.status === 429 && attempt >= 3)) && geminiModels.length > 1) {
        console.warn(`gemini: ${model} unavailable (${res.status}), switching to ${geminiModels[1]}`);
        geminiModels.shift();
        attempt = -1;
        continue;
      }
      if (overloaded) {
        // No lighter model left: fail this call fast, and stop the run's AI work after two such calls.
        if (++overloadedInARow >= 2) throw new OverBudget(`every Gemini model is overloaded (${res.status}); AI work stops for this run`);
        throw new Error(`gemini ${res.status}: ${msg}`.slice(0, 300));
      }
      if ((res.status === 429 && attempt < 3) || (res.status >= 500 && attempt < 1)) {
        await wait(res.status === 429 ? 15000 * (attempt + 1) : 10000);
        checkTime();
        continue;
      }
      if (!res.ok) throw new Error(`gemini ${res.status}: ${msg}`.slice(0, 300));
      overloadedInARow = 0;
      const text = body?.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? '').join('') ?? '';
      return parseJson(text);
    }
  };

  const anthropic = async (system: string, prompt: string, schema: object) => {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) throw new Error('ANTHROPIC_API_KEY not set');
    for (let attempt = 0; ; attempt++) {
      await pace(500);
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5',
          max_tokens: 8000,
          temperature: 0.2,
          system,
          messages: [{
            role: 'user',
            content: `${prompt}\n\nReply with only a JSON value that matches this JSON Schema, no prose:\n${JSON.stringify(schema)}`,
          }],
        }),
        signal: AbortSignal.timeout(120000),
      });
      if ((res.status === 429 || res.status === 529 || res.status >= 500) && attempt < 3) {
        await wait(10000 * (attempt + 1));
        checkTime();
        continue;
      }
      const body: any = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(`anthropic ${res.status}: ${body?.error?.message ?? ''}`.slice(0, 300));
      return parseJson(body.content?.map((c: any) => c.text ?? '').join('') ?? '');
    }
  };

  const replayDir = path.resolve(process.env.AI_REPLAY_DIR || '.cache/ai');
  const replay = async (task: string, system: string, prompt: string, schema: object, replayKey?: string) => {
    const key = `${task}-${replayKey ?? sha(system + prompt, 16)}`;
    const answer = path.join(replayDir, 'answers', `${key}.json`);
    if (fs.existsSync(answer)) return JSON.parse(fs.readFileSync(answer, 'utf8'));
    fs.mkdirSync(path.join(replayDir, 'queue'), { recursive: true });
    fs.writeFileSync(path.join(replayDir, 'queue', `${key}.json`), JSON.stringify({ task, system, prompt, schema }, null, 1));
    throw new Pending(key);
  };

  const ai: Ai = {
    name: provider,
    calls: 0,
    async json<T>(task: string, system: string, prompt: string, schema: object, replayKey?: string): Promise<T> {
      if (provider === 'replay') return (await replay(task, system, prompt, schema, replayKey)) as T;
      budget();
      if (provider === 'gemini') return (await gemini(system, prompt, schema)) as T;
      if (provider === 'anthropic') return (await anthropic(system, prompt, schema)) as T;
      throw new Error(`unknown AI_PROVIDER ${provider}`);
    },
  };
  return ai;
}
