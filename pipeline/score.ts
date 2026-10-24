// Step: the deterministic part. Vibe, "is it still on", severity, confidence and
// review gates are computed here from counts and rules — never by the AI — so the
// /how-we-know page can state them exactly. Keep RULES and that page in sync.
import { byIso, RULES } from './config.ts';
import { independentGroups, reportedAt } from './events.ts';
import type { Article, ProtestEvent } from './types.ts';
import { dayIn, hoursSince, publisherOf } from './util.ts';

/** National/wire newsrooms with corrections policies; a source from one adds a small bonus. */
export const ESTABLISHED = new Set([
  'reuters.com', 'apnews.com', 'afp.com', 'bbc.co.uk', 'bbc.com', 'theguardian.com', 'nytimes.com', 'washingtonpost.com',
  'npr.org', 'cnn.com', 'aljazeera.com', 'dw.com', 'france24.com', 'lemonde.fr', 'elpais.com', 'spiegel.de', 'ft.com',
  'thehindu.com', 'indianexpress.com', 'hindustantimes.com', 'ndtv.com', 'indiatimes.com', 'livemint.com', 'scroll.in',
  'theprint.in', 'thewire.in', 'deccanherald.com', 'newindianexpress.com', 'tribuneindia.com', 'ptinews.com', 'aninews.in',
  'dawn.com', 'tribune.com.pk', 'geo.tv', 'thedailystar.net', 'bdnews24.com', 'tbsnews.net', 'kathmandupost.com',
  'nation.africa', 'standardmedia.co.ke', 'thejakartapost.com', 'kompas.com', 'tempo.co', 'antaranews.com',
  'thelocal.fr', 'thelocal.de', 'thelocal.es', 'politico.com', 'politico.eu', 'axios.com', 'latimes.com',
]);

const SERIOUS_WORDS = /\b(brave|heroic|thugs?|goons?|mob|rioters|hooligans|anarchists|massive|huge crowd|shameful|disgraceful)\b/i;

export function confidence(e: ProtestEvent): number {
  const n = e.publishers;
  let c = n >= 5 ? 0.9 : n === 4 ? 0.86 : n === 3 ? 0.8 : n === 2 ? 0.7 : 0.4;
  if (e.sources.some((s) => ESTABLISHED.has(publisherOf(s.url)))) c += 0.05;
  if (e.conflicts.length) c -= 0.15;
  if (hoursSince(e.lastReportAt) > 72 && e.isOngoing) c -= 0.05;
  return Math.round(Math.min(0.97, Math.max(0.3, c)) * 100) / 100;
}

export interface ScoreOptions {
  now?: number;
  reviewer: boolean; // a Telegram reviewer is configured
}

export function score(events: Map<string, ProtestEvent>, articles: Map<string, Article>, opts: ScoreOptions) {
  const now = opts.now ?? Date.now();
  const byEvent = new Map<string, Article[]>();
  for (const a of articles.values()) if (a.eventId) (byEvent.get(a.eventId) ?? byEvent.set(a.eventId, []).get(a.eventId)!).push(a);

  for (const e of events.values()) {
    if (e.stage !== 'live' || e.mergedInto) continue;
    const arts = (byEvent.get(e.id) ?? []).filter((a) => a.fetch === 'ok');
    const times = arts.map((a) => Date.parse(reportedAt(a))).filter(Number.isFinite);
    const within = (from: number, to: number) => times.filter((t) => now - t >= from * 3.6e6 && now - t < to * 3.6e6).length;
    e.reports24h = within(0, 24);
    e.reportsPrev24h = within(24, 48);
    e.reports48h = e.reports24h + e.reportsPrev24h;
    const newest = Math.max(...times, ...e.sources.map((s) => Date.parse(s.publishedAt ?? '') || 0));
    if (Number.isFinite(newest) && newest > 0) e.lastReportAt = new Date(Math.min(newest, now)).toISOString();
    // Publishers counted on the sources the summary kept (on-story, renumbered).
    const srcArts = e.sources.map((s) => arts.find((a) => a.url === s.url) ?? ({ url: s.url, title: s.title } as Article));
    e.publishers = independentGroups(srcArts).length;

    // Is it still on?
    const tz = byIso.get(e.place.country)?.tz ?? 'UTC';
    const today = dayIn(tz, now);
    const quiet = hoursSince(e.lastReportAt, now) > RULES.wrapAfterHours;
    const explicitEnd = ['ended', 'called-off', 'demands-met'].includes(e.status);
    let ongoing: boolean;
    if (e.status === 'scheduled') ongoing = false;
    else if (explicitEnd || quiet) ongoing = false;
    else if (e.kind === 'one-day') ongoing = (e.endedOn ?? e.startedOn) >= today; // over once its local day ends
    else ongoing = true;
    e.isOngoing = ongoing;
    if (!ongoing && e.status === 'ongoing' && e.kind === 'one-day') e.status = 'ended';

    // Severity → Serious Mode
    const deaths = e.numbers.deaths?.value ?? 0;
    const arrests = e.numbers.arrests?.value ?? 0;
    // Serious Mode: harm at the protest, mass arrests, or a protest about a death / sexual violence.
    e.severity = deaths > 0 || e.seriousInjuries || arrests >= RULES.massArrests || e.sensitive ? 'serious' : 'normal';
    e.confidence = confidence(e);
    e.lastCheckedAt = new Date(now).toISOString();
  }

  // Vibes need the whole live set (Peak loud = top 10%).
  const live = [...events.values()].filter((e) => e.stage === 'live' && e.isOngoing && e.review !== 'rejected' && !e.mergedInto);
  const ranked = [...live].sort((a, b) => b.reports48h - a.reports48h);
  const peakN = Math.max(1, Math.round(ranked.length * RULES.peakTopShare));
  const peak = new Set(ranked.slice(0, peakN).filter((e) => e.reports48h >= RULES.minPeakVolume).map((e) => e.id));
  const top = new Set(ranked.slice(0, RULES.reviewTopN).map((e) => e.id));

  for (const e of events.values()) {
    if (e.stage !== 'live') continue;
    if (e.mergedInto) {
      e.published = false; // folded into another event; its URL redirects there (vercel.json)
      continue;
    }
    if (e.status === 'scheduled') e.vibe = 'heating-up';
    else if (!e.isOngoing) e.vibe = 'wrapped-up';
    else if (e.severity === 'serious') e.vibe = 'tense';
    else if (peak.has(e.id)) e.vibe = 'peak-loud';
    else if (e.reports24h > e.reportsPrev24h) e.vibe = 'heating-up';
    else e.vibe = 'cooling-down';

    // Review gates (PLAN: deaths/injuries/mass arrests, top 10, confidence < 0.8, disagreement)
    const reasons: string[] = [];
    if (e.severity === 'serious') reasons.push('serious');
    if (top.has(e.id) && e.isOngoing) reasons.push('top-10');
    if (e.confidence < RULES.reviewConfidence) reasons.push('low-confidence');
    if (e.conflicts.length) reasons.push('sources-disagree');
    if (SERIOUS_WORDS.test(`${e.title} ${e.summary} ${e.tea.why} ${e.tea.want} ${e.tea.changed}`)) reasons.push('tone-words');
    e.reviewReasons = reasons;

    const cleared = new Set(e.approvedFor ?? []);
    if (e.review === 'rejected') {
      e.published = false;
      continue;
    }
    const open = reasons.filter((r) => !cleared.has(r));
    if (!open.length) e.review = cleared.size ? 'approved' : 'auto';
    else e.review = 'pending';

    let ok: boolean;
    if (e.review !== 'pending') ok = true;
    else if (opts.reviewer) ok = false; // wait for the human
    else if (open.every((r) => r === 'low-confidence' || r === 'top-10')) {
      // No reviewer configured (owner decision, 24 Oct 2026): two independent newsrooms
      // and nothing else flagged is enough; the card shows its 70–75% score. Requiring
      // three hid every two-source story, e.g. all 26 confirmed US protests that week.
      ok = e.publishers >= RULES.minPublishers;
    } else {
      // Harm, disagreeing sources or loaded words: only on strong sourcing, never with
      // tone problems or low confidence.
      ok = !open.includes('tone-words') && !open.includes('low-confidence') && e.publishers >= 3;
    }
    // Once public, a page stays up (Serious Mode restyles it); only a human Reject takes it down.
    const was = e.published;
    e.published = was || ok;
    if (e.published && !e.publishedAt) e.publishedAt = new Date(now).toISOString();
  }
}
