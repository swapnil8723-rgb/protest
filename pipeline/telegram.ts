// Human review from your phone. No webhook/server: each pipeline run polls
// getUpdates for Approve/Reject taps, then sends cards for newly flagged events.
// Env: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID (your chat with the bot).
import { byIso } from './config.ts';
import type { ProtestEvent, State } from './types.ts';

const token = process.env.TELEGRAM_BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;
export const reviewerConfigured = () => !!(token && chatId);

async function call(method: string, body: object): Promise<any> {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const j: any = await res.json().catch(() => ({}));
  if (!j.ok) throw new Error(`telegram ${method}: ${j.description ?? res.status}`);
  return j.result;
}

const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);

/** Apply taps since the last run. Returns ids whose review changed. */
export async function pollDecisions(state: State, events: Map<string, ProtestEvent>, log: (s: string) => void): Promise<string[]> {
  if (!reviewerConfigured()) return [];
  const changed: string[] = [];
  const updates = await call('getUpdates', { offset: state.telegramOffset ?? 0, timeout: 0, allowed_updates: ['callback_query'] });
  for (const u of updates) {
    state.telegramOffset = u.update_id + 1;
    const q = u.callback_query;
    if (!q || String(q.message?.chat?.id) !== String(chatId)) continue;
    const [verb, id] = String(q.data || '').split(':');
    const e = events.get(id);
    if (!e) {
      await call('answerCallbackQuery', { callback_query_id: q.id, text: 'Event no longer exists' }).catch(() => {});
      continue;
    }
    if (verb === 'ok') {
      e.review = 'approved';
      e.approvedFor = [...new Set([...(e.approvedFor ?? []), ...e.reviewReasons])];
    } else if (verb === 'no') {
      e.review = 'rejected';
      e.published = false;
    } else continue;
    changed.push(id);
    log(`telegram: ${verb === 'ok' ? 'approved' : 'rejected'} ${id}`);
    await call('answerCallbackQuery', { callback_query_id: q.id, text: verb === 'ok' ? 'Approved — publishing next run' : 'Rejected — hidden' }).catch(() => {});
    await call('editMessageReplyMarkup', { chat_id: chatId, message_id: q.message.message_id, reply_markup: { inline_keyboard: [] } }).catch(() => {});
    await call('sendMessage', { chat_id: chatId, reply_to_message_id: q.message.message_id, text: verb === 'ok' ? '✅ Approved' : '❌ Rejected' }).catch(() => {});
  }
  return changed;
}

/** Send a review card for each event that is pending and has not been sent for these reasons. */
export async function sendReviews(events: Map<string, ProtestEvent>, site: string, log: (s: string) => void) {
  if (!reviewerConfigured()) return 0;
  let sent = 0;
  for (const e of events.values()) {
    if (e.stage !== 'live' || e.review !== 'pending') continue;
    const sig = e.reviewReasons.join(',');
    if (e.telegram?.sig === sig) continue;
    const country = byIso.get(e.place.country)?.name ?? e.place.country;
    const n = e.numbers;
    const figs = [
      n.crowd && `crowd ${n.crowd.text}`,
      n.arrests && `arrests ${n.arrests.text}`,
      n.injuries && `injuries ${n.injuries.text}`,
      n.deaths && `deaths ${n.deaths.text}`,
    ].filter(Boolean);
    const text = [
      `<b>Review: ${esc(e.title)}</b>`,
      `${esc(e.place.city)}, ${esc(country)} · since ${e.startedOn} · ${e.isOngoing ? 'ONGOING' : 'not ongoing'}`,
      `Flags: <b>${esc(e.reviewReasons.join(', '))}</b> · confidence ${Math.round(e.confidence * 100)}% · ${e.publishers} publishers`,
      '',
      `<b>Why:</b> ${esc(e.tea.why)}`,
      `<b>Want:</b> ${esc(e.tea.want)}`,
      `<b>Changed:</b> ${esc(e.tea.changed)}`,
      figs.length ? `<b>Numbers:</b> ${esc(figs.join(' · '))}` : '',
      e.conflicts.length ? `<b>Disagreements:</b> ${esc(e.conflicts.join(' | '))}` : '',
      '',
      esc(e.summary),
      '',
      ...e.sources.slice(0, 8).map((s) => `[${s.n}] <a href="${esc(s.url)}">${esc(s.publisher)}</a> ${esc(s.title.slice(0, 80))}`),
      e.slug ? `\nPage: ${site}/p/${e.slug}` : '',
    ]
      .filter((l) => l !== '')
      .join('\n')
      .slice(0, 4000);
    try {
      const msg = await call('sendMessage', {
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        reply_markup: { inline_keyboard: [[{ text: '✅ Approve', callback_data: `ok:${e.id}` }, { text: '❌ Reject', callback_data: `no:${e.id}` }]] },
      });
      e.telegram = { messageId: msg.message_id, sentAt: new Date().toISOString(), sig };
      sent++;
    } catch (err) {
      log(`telegram: send ${e.id} failed: ${(err as Error).message}`);
    }
  }
  return sent;
}
