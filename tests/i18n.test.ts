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
import it from '../src/i18n/it.ts';
import pt from '../src/i18n/pt.ts';
import nl from '../src/i18n/nl.ts';
import { howContent } from '../src/i18n/how.ts';
import { loc } from '../src/i18n/event.ts';
import { infoContent } from '../src/i18n/pages.ts';

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
  // regression: summaries that start with a short word plus a date are real summaries
  assert.ok(toEventText({ ...e, summary: 'On October 2, farmers marched in Pune for better prices.' }, card({ summary: '2 अक्टूबर को पुणे में किसानों ने बेहतर दामों के लिए मार्च किया।' })));
  assert.ok(toEventText({ ...e, summary: 'In Bengaluru, the chief minister staged a sit-in.' }, card({ summary: 'À Bengaluru, le ministre en chef a organisé un sit-in.' })));
  assert.equal(toEventText({ ...e, summary: 'On October 2, farmers marched in Pune for better prices.' }, card({ summary: '' })), null);
  assert.equal(toEventText(e, card())!.numbers.crowd, 'सैकड़ों किसान');
  assert.equal(toEventText(e, card())!.numbers.arrests, undefined); // no English figure → none invented
});

test('translation: runs once per English version, keeps good languages', async () => {
  const e = liveEvent();
  const events = new Map([[e.id, e]]);
  let calls = 0;
  const asked: string[][] = [];
  const ai = { name: 'fake', calls: 0, async json(_t: string, _s: string, _p: string, schema: any) { calls++; asked.push(Object.keys(schema.properties)); return { hi: card(), mr: card(), es: card(), fr: card(), de: card({ demands: [] }), it: card(), pt: card(), nl: card() } as any; } } as unknown as Ai;
  assert.equal(needsTranslation(e), true);
  await translate(ai, events, () => {});
  assert.equal(calls, 2); // one call for every language, one retry for the language that did not line up
  assert.deepEqual(asked[0].sort(), ['de', 'es', 'fr', 'it', 'nl', 'pt']); // new events: no Hindi or Marathi (owner, 11 Nov 2026)
  assert.ok(e.i18n?.fr && e.i18n.it && e.i18n.pt && e.i18n.nl);
  assert.equal(e.i18n?.hi, undefined);
  assert.equal(e.i18n?.de, undefined); // still misaligned after the retry: German page stays English
  assert.equal(e.i18n?.of, englishHash(e));
  assert.deepEqual(e.i18n?.missing, ['de']);
  await translate(ai, events, () => {}); // next runs ask only for German again, up to 3 tries
  assert.equal(calls, 4);
  assert.deepEqual(asked[2], ['de']);
  assert.ok(e.i18n?.fr); // earlier languages kept
  await translate(ai, events, () => {});
  assert.equal(calls, 6);
  await translate(ai, events, () => {});
  assert.equal(calls, 6); // gave up after 3 tries; English unchanged → no new call
  e.tea = { ...e.tea, changed: 'Oct 6: talks began.' };
  assert.equal(needsTranslation(e), true);
});

test('translation: Hindi/Marathi stay where they were, old pages never lose their text', async () => {
  const now = Date.parse('2026-11-20T00:00:00Z');
  // An October event that already had Hindi, wrapped up long ago.
  const old = liveEvent();
  Object.assign(old, { firstSeenAt: '2026-10-05T08:00:00Z', publishedAt: '2026-10-05T09:00:00Z', lastReportAt: '2026-10-06T08:00:00Z', isOngoing: false, status: 'ended' });
  old.i18n = { of: 'older-english', at: '2026-10-06T00:00:00Z', hi: toEventText(old, card())!, fr: toEventText(old, card({ title: 'Ancien titre' }))! };
  const { wantedLangs } = await import('../pipeline/translate.ts');
  assert.deepEqual(wantedLangs(old, now).map((l) => l.code), ['hi', 'es', 'fr', 'de']); // keeps Hindi; no Italian/Portuguese/Dutch for the archive
  // The same event while it is still live gets the new languages too.
  assert.deepEqual(wantedLangs({ ...old, isOngoing: true }, now).map((l) => l.code), ['hi', 'es', 'fr', 'de', 'it', 'pt', 'nl']);

  // The English changed and French comes back misaligned: the old French stays up (marked missing), Hindi updates.
  const asked: string[][] = [];
  const ai = { name: 'fake', calls: 0, async json(_t: string, _s: string, _p: string, schema: any) { asked.push(Object.keys(schema.properties)); return { hi: card({ title: 'नया शीर्षक' }), es: card(), fr: card({ updates: [] }), de: card() } as any; } } as unknown as Ai;
  await translate(ai, new Map([[old.id, old]]), () => {});
  assert.deepEqual(asked[0].sort(), ['de', 'es', 'fr', 'hi']);
  assert.equal(old.i18n?.hi?.title, 'नया शीर्षक');
  assert.equal(old.i18n?.fr?.title, 'Ancien titre'); // kept: /fr/p/... must not turn into a 404
  assert.deepEqual(old.i18n?.missing, ['fr']); // ...and asked for again next run
  assert.equal(old.i18n?.of, englishHash(old));
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
  assert.equal(inCountry('nl', 'en', 'Netherlands'), 'in the Netherlands');
  assert.equal(inCountry('nl', 'fr', 'Netherlands'), 'aux Pays-Bas');
  assert.equal(inCountry('it', 'fr', 'Italy'), 'en Italie');
  assert.equal(inCountry('ua', 'de', 'Ukraine'), 'in der Ukraine');
  assert.equal(inCountry('ch', 'de', 'Switzerland'), 'in der Schweiz');
  assert.equal(inCountry('fr', 'pt', 'France'), 'na França');
  assert.equal(inCountry('jp', 'pt', 'Japan'), 'no Japão');
  assert.equal(inCountry('us', 'pt', 'United States'), 'nos Estados Unidos');
  assert.equal(inCountry('pt', 'pt', 'Portugal'), 'em Portugal');
  assert.equal(inCountry('gb', 'it', 'United Kingdom'), 'nel Regno Unito');
  assert.equal(inCountry('de', 'it', 'Germany'), 'in Germania');
  assert.equal(inCountry('gb', 'nl', 'United Kingdom'), 'in het Verenigd Koninkrijk');
  assert.equal(inCountry('nl', 'nl', 'Netherlands'), 'in Nederland');
  assert.equal(inCountry('lb', 'fr', 'Lebanon'), 'au Liban');
  assert.equal(inCountry('iq', 'de', 'Iraq'), 'im Irak');
  assert.equal(inCountry('ps', 'fr', 'Palestine'), 'en Palestine'); // not "Territoires palestiniens"
  assert.equal(inCountry('ps', 'hi', 'Palestine'), 'फ़िलिस्तीन में');
  assert.match(fmtDate('2026-10-04', 'hi'), /4/);
  assert.equal(useT('es')('today.count', { n: 1 }), '1 protesta');
  assert.equal(useT('es')('today.count', { n: 3 }), '3 protestas');
});

test('dictionaries: every language has every key, placeholders match', () => {
  const ph = (v: unknown) => [...JSON.stringify(v).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
  for (const [name, d] of Object.entries({ hi, mr, es, fr, de, it, pt, nl })) {
    for (const k of Object.keys(en) as (keyof typeof en)[]) {
      assert.ok(k in d, `${name} is missing ${k}`);
      // A translation may drop {country} for {in} (or the reverse) but no other placeholder.
      const norm = (s: string) => s.split(',').filter((x) => x && x !== 'in' && x !== 'country').filter((x, i, a) => a.indexOf(x) === i).join(',');
      assert.equal(norm(ph(d[k])), norm(ph(en[k])), `${name}.${k} placeholders`);
    }
  }
});

test('about and privacy: every language has the same sections and links', () => {
  const ph = (v: unknown) => [...new Set([...JSON.stringify(v).matchAll(/{(w+)}/g)].map((m) => m[1]))].sort().join(',');
  for (const page of ['about', 'privacy'] as const) {
    const base = infoContent(page, 'en');
    for (const lang of ['hi', 'mr', 'es', 'fr', 'de', 'it', 'pt', 'nl'] as const) {
      const c = infoContent(page, lang);
      assert.deepEqual(c.sections.map((x) => x.id), base.sections.map((x) => x.id), `${lang} ${page} sections`);
      base.sections.forEach((b, i) => {
        const x = c.sections[i];
        assert.equal(x.p?.length ?? 0, b.p?.length ?? 0, `${lang} ${page}#${b.id} paragraphs`);
        assert.equal(x.list?.length ?? 0, b.list?.length ?? 0, `${lang} ${page}#${b.id} list`);
        assert.equal(ph(x), ph(b), `${lang} ${page}#${b.id} placeholders`);
      });
      assert.equal(ph(c.intro), ph(base.intro), `${lang} ${page} intro placeholders`);
      assert.ok(c.title && c.description && c.h1 && c.updated, `${lang} ${page} headings`);
    }
  }
});

test('method page: every language has the same steps, stickers and rules', () => {
  const base = howContent('en');
  for (const lang of ['hi', 'mr', 'es', 'fr', 'de', 'it', 'pt', 'nl'] as const) {
    const h = howContent(lang);
    for (const k of ['steps', 'vibes', 'confidence', 'reader', 'rules', 'credits'] as const) assert.equal(h[k].length, base[k].length, `${lang} ${k}`);
    assert.deepEqual(h.vibes.map((v) => v[1]), base.vibes.map((v) => v[1]), `${lang} sticker classes`);
    for (const k of ['intro', 'readerIntro', 'corrections'] as const) assert.equal([...h[k].matchAll(/{(w+)}/g)].map((m) => m[1]).sort().join(), [...base[k].matchAll(/{(w+)}/g)].map((m) => m[1]).sort().join(), `${lang} ${k} placeholders`);
  }
});
