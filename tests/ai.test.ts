// The AI client's overload handling (pipeline/ai.ts), with a fake fetch and no real waiting.
import assert from 'node:assert/strict';
import test from 'node:test';
import { makeAi, OverBudget } from '../pipeline/ai.ts';
import type { State } from '../pipeline/types.ts';

function withGemini(reply: (model: string) => Response) {
  const saved = { fetch: globalThis.fetch, env: { ...process.env } };
  Object.assign(process.env, { GEMINI_API_KEY: 'test', AI_PROVIDER: 'gemini', GEMINI_MODEL: 'big', GEMINI_FALLBACK: 'lite' });
  const seen: string[] = [];
  globalThis.fetch = (async (url: string | URL) => {
    const model = String(url).match(/models\/([^:]+)/)![1];
    seen.push(model);
    return reply(model);
  }) as typeof fetch;
  const waits: number[] = [];
  const ai = makeAi({ aiCalls: { day: '', count: 0 } } as unknown as State, { wait: async (ms) => void waits.push(ms) });
  const restore = () => {
    globalThis.fetch = saved.fetch;
    for (const k of ['GEMINI_API_KEY', 'AI_PROVIDER', 'GEMINI_MODEL', 'GEMINI_FALLBACK']) {
      if (saved.env[k] === undefined) delete process.env[k];
      else process.env[k] = saved.env[k];
    }
  };
  return { ai, seen, waits, restore };
}

const busy = () => new Response(JSON.stringify({ error: { message: 'This model is currently experiencing high demand.' } }), { status: 503 });
const ok = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"fine":true}' }] } }] }), { status: 200 });

test('ai: every Gemini model overloaded → one short retry each, then the run stops asking', async () => {
  const g = withGemini(busy);
  try {
    // First call: big (retry once) → lite (retry once) → this call fails, the run goes on.
    await assert.rejects(g.ai.json('summary', 's', 'p', {}), (e: Error) => !(e instanceof OverBudget) && /503/.test(e.message));
    assert.deepEqual(g.seen, ['big', 'big', 'lite', 'lite']);
    // Second call in a row on the last model: the run's AI work stops (a later run tries again).
    await assert.rejects(g.ai.json('summary', 's', 'p', {}), OverBudget);
    assert.deepEqual(g.seen, ['big', 'big', 'lite', 'lite', 'lite', 'lite']);
    // Retry pauses are 10 s, not the old 15/30/45 s ladder. (The other waits are the 6.5 s pacing,
    // which piles up here because the fake wait does not move the clock.)
    assert.equal(g.waits.filter((w) => w === 10000).length, 3);
    assert.ok(!g.waits.some((w) => [15000, 30000, 45000].includes(w)));
  } finally {
    g.restore();
  }
});

test('ai: a success in between resets the overload count', async () => {
  let n = 0;
  // big is down; lite fails, works, then fails twice.
  const g = withGemini((model) => (model === 'big' ? busy() : [busy, busy, ok, busy, busy, busy, busy][n++]()));
  try {
    await assert.rejects(g.ai.json('t', 's', 'p', {}), /503/); // lite overloaded once (count 1)
    assert.deepEqual(await g.ai.json('t', 's', 'p', {}), { fine: true }); // count back to 0
    await assert.rejects(g.ai.json('t', 's', 'p', {}), (e: Error) => !(e instanceof OverBudget)); // count 1: still going
    await assert.rejects(g.ai.json('t', 's', 'p', {}), OverBudget); // count 2: stop
  } finally {
    g.restore();
  }
});
