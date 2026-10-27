// Step: reader reports from the "Add a protest" form (api/report.ts → private Blob inbox).
// Each report waits ≥ RULES.readerDelayMinutes, then gets the automatic check:
//   form rules → city found in the gazetteer → link opened (if given) → AI check
//   (is it a protest, safe to show, rewritten neutral) → duplicate check.
// Passing reports go live as "Reader report · not verified yet" cards. They stay
// `stage: 'candidate'`, so newsroom articles can still match them; once 2 independent
// newsrooms confirm one, summarize() turns it into a normal verified card.
import fs from 'node:fs';
import type { Ai } from './ai.ts';
import { OverBudget, Pending } from './ai.ts';
import { fetchPage } from './article.ts';
import { byIso, CAUSES, RULES } from './config.ts';
import { findSimilar, newEvent } from './events.ts';
import { resolvePlace } from './geo.ts';
import { readerPrompt, readerSchema, SYSTEM, type ReaderOut } from './prompts.ts';
import { makeSlug } from './summarize.ts';
import type { ProtestEvent } from './types.ts';
import { dayIn, hostOf, hoursSince, isBlockedUrl, nowIso, sha, titleSimilarity } from './util.ts';

export interface InboxItem {
  id: string;
  at: string;
  data: any;
}
export interface Inbox {
  list(): Promise<InboxItem[]>;
  done(ids: string[]): Promise<void>;
}

/** The site's /api/inbox, authenticated with this workflow's GitHub OIDC token. */
export function httpInbox(site: string): Inbox | null {
  const reqUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const reqToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!reqUrl || !reqToken) return null;
  // READER_INBOX_URL: a manual run can point at another host (used to test Cloudflare before the switch).
  const url = process.env.READER_INBOX_URL || `${site}/api/inbox`;
  const auth = async () => {
    const r = await fetch(`${reqUrl}&audience=loud-pipeline`, { headers: { authorization: `Bearer ${reqToken}` } });
    if (!r.ok) throw new Error(`OIDC token ${r.status}`);
    return `Bearer ${((await r.json()) as any).value}`;
  };
  return {
    async list() {
      const r = await fetch(url, { headers: { authorization: await auth() }, signal: AbortSignal.timeout(60000) });
      if (!r.ok) throw new Error(`inbox ${r.status}`);
      return ((await r.json()) as any).items ?? [];
    },
    async done(ids) {
      if (!ids.length) return;
      const r = await fetch(url, {
        method: 'DELETE',
        headers: { authorization: await auth(), 'content-type': 'application/json' },
        body: JSON.stringify({ pathnames: ids }),
        signal: AbortSignal.timeout(60000),
      });
      if (!r.ok) throw new Error(`inbox delete ${r.status}`);
    },
  };
}

/** Local testing: READER_INBOX_FILE=reports.json (an array of InboxItem). */
export function fileInbox(file: string): Inbox {
  return {
    async list() {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    },
    async done(ids) {
      const left = (JSON.parse(fs.readFileSync(file, 'utf8')) as InboxItem[]).filter((i) => !ids.includes(i.id));
      fs.writeFileSync(file, JSON.stringify(left, null, 1));
    },
  };
}

const causeSet = new Set<string>(CAUSES);
const clip = (s: unknown, n: number) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…';
};
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const daysFrom = (a: string, b: string) => (Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5;

export interface ReaderResult {
  published: string[];
  held: string[];
  merged: string[];
  rejected: { id: string; reason: string }[];
  waiting: number;
}

export interface ReaderOptions {
  now?: number;
  /** Opens the reader's link; injectable for tests. */
  openLink?: (url: string) => Promise<{ title: string; text: string }>;
}

export async function processReaderReports(
  ai: Ai,
  events: Map<string, ProtestEvent>,
  inbox: Inbox,
  log: (s: string) => void,
  opts: ReaderOptions = {},
): Promise<ReaderResult> {
  const now = opts.now ?? Date.now();
  const openLink = opts.openLink ?? ((u: string) => fetchPage(u));
  const res: ReaderResult = { published: [], held: [], merged: [], rejected: [], waiting: 0 };
  const items = (await inbox.list()).sort((a, b) => (a.at < b.at ? -1 : 1));
  const handled: string[] = [];
  const reject = (id: string, reason: string) => {
    res.rejected.push({ id, reason });
    handled.push(id);
    log(`reader: rejected ${id.split('/').pop()}: ${reason}`);
  };
  let checked = 0;

  try {
    for (const item of items) {
      const r = item.data;
      const submittedAt = typeof r?.submittedAt === 'string' ? r.submittedAt : item.at;
      if (now - Date.parse(submittedAt) < RULES.readerDelayMinutes * 6e4) {
        res.waiting++;
        continue;
      }
      if (checked >= RULES.readerPerRun) {
        res.waiting++;
        continue;
      }
      if (!r || typeof r !== 'object') {
        reject(item.id, 'unreadable');
        continue;
      }

      // 1. Form rules (the form checks these too; never trust the client).
      const country = String(r.country ?? '').toLowerCase();
      const cc = byIso.get(country);
      if (!cc) {
        reject(item.id, 'country not tracked');
        continue;
      }
      const today = dayIn(cc.tz, now);
      const started = DATE.test(r.startedOn ?? '') ? r.startedOn : '';
      if (!started || daysFrom(started, today) > 30 || daysFrom(today, started) > 14) {
        reject(item.id, 'date outside last 30 days / next 2 weeks');
        continue;
      }
      if (String(r.why ?? '').trim().length < 20 || String(r.title ?? '').trim().length < 8) {
        reject(item.id, 'too little detail');
        continue;
      }

      // 2. The city must exist (pins sit on city centres only).
      const place = resolvePlace(r.city, r.region, country);
      if (!place) {
        reject(item.id, `place not found: ${clip(r.city, 40)}`);
        continue;
      }

      // 3. Open the link, if there is one.
      let linkNote = 'The reader gave no link.';
      let linkOk: boolean | undefined;
      const link = typeof r.link === 'string' && /^https?:\/\//.test(r.link) ? r.link : '';
      if (link && isBlockedUrl(link)) linkNote = `The link (${hostOf(link)}) is on our blocklist of copy/aggregator sites.`;
      else if (link) {
        try {
          const page = await openLink(link);
          linkOk = titleSimilarity(page.title, String(r.title)) > 0.15 || `${page.title} ${page.text.slice(0, 3000)}`.toLowerCase().includes(place.city.toLowerCase());
          linkNote = `The link opened (${hostOf(link)}). Page title: "${clip(page.title, 160)}". Start of text: "${clip(page.text, 900)}"`;
        } catch (e) {
          linkOk = false;
          linkNote = `The link (${hostOf(link)}) could not be opened: ${(e as Error).message.slice(0, 80)}.`;
        }
      }

      // 4. AI check + neutral rewrite.
      const report = {
        headline: clip(r.title, 120), city: place.city, region: place.region, country: cc.name, started_on: started,
        reader_says_still_on: r.stillOn, why: clip(r.why, 600), what_they_want: clip(r.want, 600), organisers: clip(r.organisers, 160),
      };
      let out: ReaderOut;
      try {
        checked++;
        out = await ai.json<ReaderOut>('reader', SYSTEM, readerPrompt(new Date(now).toISOString().slice(0, 16), report, linkNote), readerSchema, sha(item.id, 16));
      } catch (e) {
        if (e instanceof Pending) {
          log(`reader: ${item.id} queued for answer (${e.key})`);
          continue;
        }
        if (e instanceof OverBudget) throw e;
        log(`reader: check failed for ${item.id}: ${(e as Error).message}`);
        continue; // stays in the inbox, retried next run
      }
      if (out.decision === 'reject') {
        reject(item.id, `check: ${clip(out.reason, 80)}`);
        continue;
      }
      const title = clip(out.title, 90);
      if (title.length < 8 || clip(out.why, 160).length < 10) {
        reject(item.id, 'check returned no usable text');
        continue;
      }

      // 5. Already on the site (from newsrooms or another reader)?
      const dup = findSimilar(events.values(), title, place, started);
      if (dup) {
        if (dup.origin === 'reader' && dup.reader) {
          dup.reader.count++;
          dup.lastCheckedAt = new Date(now).toISOString();
        }
        handled.push(item.id);
        res.merged.push(dup.id);
        log(`reader: ${item.id.split('/').pop()} is the same protest as ${dup.id}`);
        continue;
      }

      const e = newEvent(title, place, started, [], `reader:${item.id}`);
      const status: ProtestEvent['status'] = r.stillOn === 'soon' && started > today ? 'scheduled' : r.stillOn === 'no' ? 'ended' : 'ongoing';
      Object.assign(e, {
        origin: 'reader',
        reader: { submittedAt, checkedAt: new Date(now).toISOString(), link: link || undefined, linkHost: link ? hostOf(link) : undefined, linkOk, count: 1 },
        seoTitle: clip(title, 52),
        causes: [...new Set((out.causes ?? []).filter((c) => causeSet.has(c)))].slice(0, 3),
        kind: started < today && status === 'ongoing' ? 'multi-day' : 'one-day',
        status,
        tea: { why: clip(out.why, 160), want: clip(out.want, 160), changed: `Reported by a reader on ${new Date(submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: cc.tz })}.` },
        summary: clip(out.summary, 700),
        organizers: (out.organizers ?? []).map((o) => clip(o, 80)).filter(Boolean).slice(0, 4),
        demands: (out.demands ?? []).map((d) => clip(d, 140)).filter(Boolean).slice(0, 4),
        response: 'No newsroom has reported an official response yet.',
        firstSeenAt: submittedAt,
        lastReportAt: submittedAt,
      } satisfies Partial<ProtestEvent>);
      if (out.decision === 'hold') {
        // Claims of harm wait for newsrooms: hidden, but newsroom articles can still confirm it.
        e.review = 'pending';
        e.reviewReasons = ['reader-claims-harm'];
        res.held.push(e.id);
        log(`reader: held ${e.id} "${title}" (${place.city}): ${clip(out.reason, 80)}`);
      } else {
        e.slug = makeSlug(e, out.slug_words);
        e.published = true;
        e.publishedAt = new Date(now).toISOString();
        res.published.push(e.id);
        log(`reader: published ${e.id} "${title}" (${place.city})`);
      }
      events.set(e.id, e);
      handled.push(item.id);
    }
  } finally {
    await inbox.done(handled);
  }
  return res;
}

/** The score step for unconfirmed reader reports (score() only handles stage 'live'). */
export function scoreReaders(events: Map<string, ProtestEvent>, now = Date.now()) {
  for (const e of events.values()) {
    if (e.origin !== 'reader' || e.stage !== 'candidate') continue;
    const tz = byIso.get(e.place.country)?.tz ?? 'UTC';
    const today = dayIn(tz, now);
    if (e.status === 'scheduled' && e.startedOn <= today) e.status = 'ongoing';
    // "Quiet" counts from the later of the report and the start date (a planned march).
    const since = Math.min(hoursSince(e.lastReportAt, now), Math.max(0, daysFrom(e.startedOn, today)) * 24);
    let ongoing: boolean;
    if (e.status === 'scheduled') ongoing = false;
    else if (e.status !== 'ongoing' || since > RULES.wrapAfterHours) ongoing = false;
    else if (e.kind === 'one-day') ongoing = e.startedOn >= today;
    else ongoing = true;
    e.isOngoing = ongoing;
    if (!ongoing && e.status === 'ongoing') e.status = 'ended';
    e.vibe = e.status === 'scheduled' || ongoing ? 'heating-up' : 'wrapped-up';
    e.severity = 'normal';
    e.confidence = 0;
    e.publishers = 0;
    // Unconfirmed reports do not stay up as archive pages.
    if (e.published && !ongoing && e.status !== 'scheduled' && hoursSince(e.lastReportAt, now) > 24 * (RULES.readerHideAfterDays + 2)) {
      e.published = false;
    }
    e.lastCheckedAt = new Date(now).toISOString();
  }
}
