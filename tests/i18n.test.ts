// Languages: the pipeline's translation step and the site's language helpers.
import assert from 'node:assert/strict';
import test from 'node:test';
import type { Ai } from '../pipeline/ai.ts';
import { newEvent } from '../pipeline/events.ts';
import { resolvePlace } from '../pipeline/geo.ts';
import { englishHash, needsTranslation, toEventText, translate } from '../pipeline/translate.ts';
import type { ProtestEvent } from '../pipeline/types.ts';
import { basePath, fmtDate, href, inCountry, langOf, useT } from '../src/i18n/index.ts';
import en from '../src/i18n/en.ts';
import hi from '../src/i18n/hi.ts';
import mr from '../src/i18n/mr.ts';
import es from '../src/i18n/es.ts';
import fr from '../src/i18n/fr.ts';
import de from '../src/i18n/de.ts';
import { loc } from '../src/i18n/event.ts';

function liveEvent(): ProtestEvent {
  const e = newEvent('Farmers march over crop prices', resolvePlace('Pune', 'Maharashtra', 'in')!, '2026-10-05', ['farmers'], 'x');
  Object.assign(e, {
    stage: 'live', published: true, slug: 'pune-farmers-march-oct-2026', seoTitle: 'Pune farmers march over crop prices',
    tea: { why: 'Crop prices fell below cost.', want: 'A minimum support price.', changed: 'Oct 5: march reached the collector office.' },
    summary: 'Farmers marched in Pune.', demands: ['MSP', 'Loan waiver'], response: 'The collector said talks will be held.',
    updates: [{ at: '2026-10-05', text: 'March reached the collector office.', sources: [1] }],
    numbers: { crowd: { value: 100, text: 'hundreds of farmers', sources: [1] } },
  });
  return e;
}
const card = (over: object = {}) => ({
  title: 'पुणे में किसानों का मार्च', seo_title: 'पुणे किसान मार्च', why: 'फ़सल के दाम लागत से नीचे गिरे।', want: 'न्यूनतम समर्थन मूल्य।', changed: '5 अक्टूबर: मार्च कलेक्टर कार्यालय पहुँचा।',
  summary: 'पुणे में किसानों ने मार्च किया।', demands: ['MSP', 'क़र्ज़ माफ़ी'], response: 'कलेक्टर ने कहा बातचीत होगी।',
  updates: ['मार्च कलेक्टर कार्यालय पहुँचा।'], conflicts: [], crowd: 'सैकड़ों किसान', arrests: '', injuries: '', deaths: '', ...over,
});

test('translation: lines up with the English or is dropped', () => {
  const e = liveEvent();
  assert.ok(toEventText(e, card()));
  assert.ok(toEventText(e, card({ demands: ["MSP", "", "क़र्ज़ माफ़ी"] }))); // stray empty item ignored
  assert.equal(toEventText(e, card({ demands: ['MSP'] })), null); // one demand missing
  assert.equal(toEventText(e, card({ updates: [] })), null);
  assert.equal(toEventText(e, card({ title: '' })), null);
  assert.equal(toEventText(e, card())!.numbers.crowd, 'सैकड़ों किसान');
  assert.equal(toEventText(e, card())!.numbers.arrests, undefined); // no English figure → none invented
});

test('translation: runs once per English version, keeps good languages', async () => {
  const e = liveEvent();
  const events = new Map([[e.id, e]]);
  let calls = 0;
  const ai = { name: 'fake', calls: 0, async json() { calls++; return { hi: card(), mr: card(), es: card(), fr: card(), de: card({ demands: [] }) } as any; } } as Ai;
  assert.equal(needsTranslation(e), true);
  await translate(ai, events, () => {});
  assert.equal(calls, 2); // one call for all five, one retry for the language that did not line up
  assert.ok(e.i18n?.hi && e.i18n.fr);
  assert.equal(e.i18n?.de, undefined); // still misaligned after the retry: German page stays English
  assert.equal(e.i18n?.of, englishHash(e));
  assert.deepEqual(e.i18n?.missing, ['de']);
  await translate(ai, events, () => {}); // next runs ask only for German again, up to 3 tries
  assert.equal(calls, 4);
  assert.ok(e.i18n?.hi); // earlier languages kept
  await translate(ai, events, () => {});
  assert.equal(calls, 6);
  await translate(ai, events, () => {});
  assert.equal(calls, 6); // gave up after 3 tries; English unchanged → no new call
  e.tea = { ...e.tea, changed: 'Oct 6: talks began.' };
  assert.equal(needsTranslation(e), true);
});

test('site: localized event keeps facts, numbers and the English figure phrasing', () => {
  const e = liveEvent();
  e.i18n = { of: 'x', at: '2026-10-06T00:00:00Z', hi: toEventText(e, card())! };
  const h = loc(e, 'hi');
  assert.equal(h.title, 'पुणे में किसानों का मार्च');
  assert.equal(h.numbers.crowd!.value, 100);
  assert.equal(h.numbers.crowd!.en, 'hundreds of farmers'); // drives "100+" instead of an exact 100
  assert.deepEqual(h.updates[0].sources, [1]);
  assert.equal(loc(e, 'mr'), e); // no Marathi yet → English
});

test('site: URLs, prefixes and country phrases', () => {
  assert.equal(langOf('/hi/today'), 'hi');
  assert.equal(langOf('/today'), 'en');
  assert.equal(langOf('/hi.html'), 'hi');
  assert.equal(langOf('/de'), 'de');
  assert.equal(langOf('/city/in/maharashtra/pune'), 'en');
  assert.equal(href('de', '/'), '/de');
  assert.equal(href('fr', '/p/x'), '/fr/p/x');
  assert.equal(basePath('/mr/country/india'), '/country/india');
  assert.equal(inCountry('us', 'en', 'United States'), 'in the United States');
  assert.equal(inCountry('us', 'fr', 'United States'), 'aux États-Unis');
  assert.equal(inCountry('in', 'fr', 'India'), 'en Inde');
  assert.equal(inCountry('gb', 'de', 'United Kingdom'), 'im Vereinigten Königreich');
  assert.equal(inCountry('in', 'hi', 'India'), 'भारत में');
  assert.match(fmtDate('2026-10-04', 'hi'), /4/);
  assert.equal(useT('es')('today.count', { n: 1 }), '1 protesta');
  assert.equal(useT('es')('today.count', { n: 3 }), '3 protestas');
});

test('dictionaries: every language has every key, placeholders match', () => {
  const ph = (v: unknown) => [...JSON.stringify(v).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
  for (const [name, d] of Object.entries({ hi, mr, es, fr, de })) {
    for (const k of Object.keys(en) as (keyof typeof en)[]) {
      assert.ok(k in d, `${name} is missing ${k}`);
      // A translation may drop {country} for {in} (or the reverse) but no other placeholder.
      const norm = (s: string) => s.split(',').filter((x) => x && x !== 'in' && x !== 'country').filter((x, i, a) => a.indexOf(x) === i).join(',');
      assert.equal(norm(ph(d[k])), norm(ph(en[k])), `${name}.${k} placeholders`);
    }
  }
});
