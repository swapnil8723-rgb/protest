# LOUD design system — "neo-brutalist candy, serious about facts"

Source of truth for every visual decision. Tokens live in `src/styles/global.css` (`:root` + `@theme`).
If a component needs a value that is not a token, add the token here first.

## 1. The idea in one line
A protest tracker that looks like the sticker-covered laptop of a 21-year-old journalism student:
loud colour, thick outlines, chunky stickers, hard shadows — and underneath it, a newsroom's discipline.

**The interface jokes. The facts never do.**

## 2. Principles
1. **The answer before the art.** Every event page answers four questions above the fold on a 360px phone:
   what is happening, why, what they want, is it still on. Decoration never pushes those down.
2. **Data is the decoration.** Colours come from vibe status, the volume meter from real report counts,
   the globe pins from real coordinates, the confidence bar from the real score. No stock imagery, no faces, ever.
3. **Premium = restraint in the details.** Loud palette, but one accent per component, generous whitespace,
   tight type, perfectly aligned 4px grid, no gradients on text, no glassmorphism, no emoji in UI chrome.
4. **Serious Mode is a hard switch, not a theme.** Deaths, serious injuries or mass arrests → the component
   drops colour, tilt, stickers, motion and jokes. Grey on white. Same layout, quieter voice. One exception (owner
   decision, 11 Oct 2026): a 2px `--serious-alert` red border and a red SERIOUS label, so serious events stand out.
5. **Colour never carries meaning alone.** Every status has its word; every number has its unit and its source.

## 3. Colour

Cream light is the default (`color-scheme: light`, owner's decision 6 Oct 2026); dark is opt-in via the header
toggle (`data-theme="dark"`, remembered in localStorage).

| Token | Dark | Light (cream) | Use |
|---|---|---|---|
| `--bg` | `#0B0B12` | `#FFF8EC` | page, globe space |
| `--surface` | `#16161F` | `#FFFFFF` | cards |
| `--surface-2` | `#1F1F2B` | `#FFF1D6` | inset panels, chips |
| `--ink` | `#F6F4FF` | `#0B0B12` | body text, headings |
| `--muted` | `#A7A3BC` | `#57546A` | meta text (≥ 4.5:1 on both) |
| `--line` | `#000000` | `#0B0B12` | sticker outlines (3px) |
| `--hairline` | `#2B2B3A` | `#E9DEC8` | dividers |
| `--violet` | `#7C3AED` | `#7C3AED` | brand, primary buttons (white text) |
| `--pink` | `#FF3D81` | `#FF3D81` | Heating up, Peak loud |
| `--lime` | `#C6FF00` | `#C6FF00` | Wrapped up, "YES it's on" block |
| `--cyan` | `#00E5FF` | `#00E5FF` | Cooling down, links on dark, map pulses |
| `--yellow` | `#FFD60A` | `#FFD60A` | The Tea card, stickers |
| `--serious-bg` | `#F3F4F6` | `#F3F4F6` | Serious Mode surface |
| `--serious-ink` | `#1F2937` | `#1F2937` | Serious Mode text |
| `--serious-line` | `#9CA3AF` | `#9CA3AF` | Serious Mode inner lines |
| `--serious-alert` | `#B91C1C` | `#B91C1C` | Serious Mode card border + SERIOUS label (5.9:1 on `--serious-bg`) |

**Rules**
- Neon fills always carry **black** text (`#0B0B12`). Contrast: black on pink 6.2:1, lime 17.7:1, cyan 13.6:1, yellow 14.9:1; white on violet 5.7:1.
- Neon as *text* only at ≥ 24px bold on dark (cyan links are the single exception: underlined, on `--bg`).
- Light mode links use `--violet` (5.4:1 on cream).
- Each card has exactly one vibe colour: it is the card's hard shadow and its vibe sticker.

## 4. Vibe status (the identity)

| Vibe | Colour | Word on sticker | Rule (pipeline `score` step) |
|---|---|---|---|
| Heating up | pink | HEATING UP | reports in last 24h > the 24h before |
| Peak loud | pink + volume meter maxed | PEAK LOUD | top 10% of live events by report volume |
| Cooling down | cyan | COOLING DOWN | report volume falling for 24h |
| Wrapped up | lime | WRAPPED UP | no reports 48h, or ended / called off / demands met |
| Tense | red outline (Serious Mode) | SERIOUS (+ " · WRAPPED UP" once over) | deaths, serious injuries or mass arrests reported |

## 5. Type
| Role | Family | Settings |
|---|---|---|
| Display | **Bricolage Grotesque** (variable, self-hosted) | 800, `opsz` 96, tracking −0.035em, line-height 0.92; uppercase only on stickers |
| Body | **Inter** (variable, self-hosted) | 400/600, 17px mobile / 18px desktop, line-height 1.6 |
| Data | **JetBrains Mono** | 500, 13px, tabular — timestamps, confidence, counts |

Scale (fluid `clamp`): hero 44→112px · h1 34→64px · h2 26→36px · card title 20→22px · meta 13px.
Fonts are self-hosted (`@fontsource`), Latin subset only, `font-display: swap`, display font preloaded.

## 6. Components

**Sticker card** (`.card`) — `--surface`, 3px `--line` border, radius 18px, hard shadow `6px 6px 0 var(--vibe)`.
Feed cards tilt by a deterministic angle from the slug (−1.5° … 1.5°); hover/focus straightens to 0° and lifts −4px
(the only hover animation). No tilt on mobile < 400px, never in Serious Mode.

**Vibe sticker** — pill, 2px black border, neon fill, black uppercase Bricolage 800 12px, a 6px dot that pulses
only for Heating up / Peak loud.

**Cause sticker** — pill on `--surface-2`, 1.5px hairline border, `#` prefix in muted, lowercase label.
Doubles as a filter chip on /today.

**Volume meter** — 5 vertical bars (like a phone's signal), filled from report volume quintile. Decorative but true.

**The Tea** — yellow sticker card, black text, three labelled lines: *Why they're mad* · *What they want* · *What changed*.
In Serious Mode it becomes a plain bordered box titled *Summary*.

**Is it still on?** — the biggest thing on the event page. YES block = lime fill; NO block = `--surface-2` with ink text;
UNCLEAR is never shown (unclear events are not published). Under it, mono line: "last report 23 min ago · checked 4 min ago".

**Receipts** — numbered source list (publisher, date, outbound link `rel="nofollow noopener"`), confidence bar
(5 segments), "how we score this" link. Always visible, never collapsed.

**Timeline** — chat-bubble style, left-aligned bubbles with a mono timestamp and the source number as a superscript chip.

**Big Story** (news, not a protest; owner decision 31 Oct 2026) — violet is its colour because no vibe uses it.
Home: kept smaller than the protest sections (owner, 31 Oct 2026) — a slim band (`--violet` fill, white text 5.7:1,
3px black border, 4px hard shadow, yellow in dark mode; h2 24–28px beside a yellow "NOT A PROTEST" sticker tilted −3°,
one line of text, no joke) over up to 6 compact headline rows (`StoryCard compact`: sticker, places, title, meta).
Full story card elsewhere: sticker card with a violet shadow, a violet "STORY · DEVELOPING" sticker (white text) and a
topic chip; never a vibe sticker or volume meter, which measure protests. A story about deaths (`serious: true`) uses
Serious Mode exactly like a protest card: grey, red border and label, no tilt, no "Still loud" line.
Story page: the same Receipts panel; What happened · Who's saying what · What's next, each line with source chips.

**Globe** — canvas, orthographic, India-official boundaries (Natural Earth "IND" point of view). Land `--surface-2`,
coastlines/borders 0.6px `--hairline`, ocean disc with a soft violet rim. Pins: 6px dot in vibe colour + expanding ring
(the only looping animation). Drag to spin, tap pin → fly-to + bottom drawer card. Idle auto-rotate stops on first touch.

**Locator map** — server-rendered SVG of the country with one pin. Zero JS.

## 7. Motion (only three)
1. Pulse ring on live pins and live-dot stickers (CSS, 1.8s ease-out).
2. Globe fly-to (rAF, 900ms, ease-in-out-cubic).
3. Card hover lift/straighten (transform 160ms).

All three are disabled under `prefers-reduced-motion: reduce` (the globe also stops auto-rotating).
The news ticker on home scrolls via CSS and becomes a static wrapped row under reduced motion.

## 8. Voice & microcopy
| Situation | Copy |
|---|---|
| Loading | Listening for noise… |
| Empty city / filter | No protests here. Suspiciously quiet. |
| Error | Our map tripped over a placard. Retrying. |
| 404 | This page left the march early. |
| Footer | Made loud, checked twice. |
| Share | Spill the tea → story card |

**Never** joke inside: summaries, Tea lines, demands, government response, timeline, Serious Mode anything.
No adjectives about people ("brave", "violent mob", "rioters" unless quoting an official charge with a source).
Never name or show individual protesters.

## 9. Layout
- Mobile first. Gutter 16px, max content width 1180px, 12-col grid ≥ 1024px.
- Event page: single column ≤ 1023px; ≥ 1024px main 8 cols + sticky receipts rail 4 cols.
- Tap targets ≥ 44px. Header 60px, sticky, `backdrop` solid (no blur).

## 10. Share art (OG 1200×630, story 1080×1920)
Same template, generated at build (Satori + resvg): `--bg` background, the vibe sticker, Bricolage title,
the three Tea lines, city + date in mono, LOUD wordmark, "protesttracker.online". Serious Mode art is grey/white,
no sticker, title + "Summary" + source count.

## 11. Favicon / logo
Wordmark **LOUD** in Bricolage 800 with the O drawn as a pink speaker ring.
Icon: tilted hot-pink sticker square, 3px black outline, black "L" + two cyan sound-wave arcs. SVG favicon
(+ dark-mode safe since it carries its own fill), 32/180/192/512 PNGs rendered from the same SVG.

## 12. Don'ts
Purple-to-blue gradients, glass blur, emoji bullets, stock protest photos, faces, crowd imagery, red "BREAKING"
banners, skeuomorphic map pins, any animation not in §7, any joke within 200px of a Serious Mode card,
"brave"/"violent"/"mob"/"thugs" in generated text, more than one neon per component.
