// One-line provider switch (PLAN): AI_PROVIDER=gemini | anthropic | replay.
//  gemini    — Google AI Studio free tier; gemini-2.5-flash, falls back to 2.5-flash-lite on quota
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

export function makeAi(state: State): Ai {
  const provider = (process.env.AI_PROVIDER || (process.env.GEMINI_API_KEY ? 'gemini' : process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'replay')).toLowerCase();
  const today = new Date().toISOString().slice(0, 10);
  if (state.aiCalls.day !== today) state.aiCalls = { day: today, count: 0 };

  const budget = () => {
    if (state.aiCalls.count >= LIMITS.aiCallsPerDay) throw new OverBudget(`daily AI cap ${LIMITS.aiCallsPerDay} reached`);
    state.aiCalls.count++;
    ai.calls++;
  };

  let lastCall = 0;
  const pace = async (ms: number) => {
    const wait = lastCall + ms - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
  };

  // Best free-tier model first; when its daily quota runs out (or Google retires it) the run
  // continues on the next one. Override with GEMINI_MODEL / GEMINI_FALLBACK.
  const geminiModels = [
    process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    ...(process.env.GEMINI_FALLBACK || 'gemini-2.5-flash-lite').split(',').filter(Boolean),
  ];
  const gemini = async (system: string, prompt: string, schema: object) => {
    const key = process.env.GEMINI_API_KEY;
    if (!key) throw new Error('GEMINI_API_KEY not set');
    for (let attempt = 0; ; attempt++) {
      const model = geminiModels[0];
      await pace(6500); // free tier ≈ 10 requests/minute on Flash
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, responseMimeType: 'application/json', responseJsonSchema: schema },
        }),
        signal: AbortSignal.timeout(120000),
      });
      const body: any = await res.json().catch(() => ({}));
      const msg = String(body?.error?.message ?? '');
      const outOfQuota = res.status === 429 && /per ?day|daily|PerDay/i.test(msg + JSON.stringify(body?.error?.details ?? ''));
      if ((res.status === 404 || outOfQuota || (res.status === 429 && attempt >= 3)) && geminiModels.length > 1) {
        console.warn(`gemini: ${model} unavailable (${res.status}), switching to ${geminiModels[1]}`);
        geminiModels.shift();
        attempt = -1;
        continue;
      }
      if ((res.status === 429 || res.status >= 500) && attempt < 3) {
        await sleep(15000 * (attempt + 1));
        continue;
      }
      if (!res.ok) throw new Error(`gemini ${res.status}: ${msg}`.slice(0, 300));
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
        await sleep(10000 * (attempt + 1));
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
