// Languages. English lives at the root (/today); the others under a prefix (/hi/today).
// Components read the language from the URL (langOf(Astro.url)), so nothing has to
// pass a `lang` prop down. Event text comes from the pipeline's translations
// (pipeline/translate.ts → e.i18n); interface text from the dictionaries here.
import en, { type Dict } from './en.ts';
import hi from './hi.ts';
import mr from './mr.ts';
import es from './es.ts';
import fr from './fr.ts';
import de from './de.ts';

export const LANGS = ['en', 'hi', 'mr', 'es', 'fr', 'de'] as const;
export type Lang = (typeof LANGS)[number];
export type OtherLang = Exclude<Lang, 'en'>;
export const OTHER_LANGS = LANGS.filter((l): l is OtherLang => l !== 'en');

export const LANG_INFO: Record<Lang, { native: string; english: string; locale: string; og: string }> = {
  en: { native: 'English', english: 'English', locale: 'en-US', og: 'en_US' },
  hi: { native: 'हिन्दी', english: 'Hindi', locale: 'hi-IN-u-nu-latn', og: 'hi_IN' },
  mr: { native: 'मराठी', english: 'Marathi', locale: 'mr-IN-u-nu-latn', og: 'mr_IN' },
  es: { native: 'Español', english: 'Spanish', locale: 'es-ES', og: 'es_ES' },
  fr: { native: 'Français', english: 'French', locale: 'fr-FR', og: 'fr_FR' },
  de: { native: 'Deutsch', english: 'German', locale: 'de-DE', og: 'de_DE' },
};

const DICTS: Record<Lang, Dict> = { en, hi, mr, es, fr, de };

/** The page's language from its URL: /hi/... → 'hi', anything else → 'en'. */
export function langOf(url: URL | string): Lang {
  const path = typeof url === 'string' ? url : url.pathname;
  const first = (path.split('/')[1] ?? '').replace(/\.html$/, '') as Lang; // static build: /hi → /hi.html
  return (OTHER_LANGS as readonly string[]).includes(first) ? first : 'en';
}

/** A root-relative English path in the given language: ('hi', '/today') → '/hi/today'. */
export function href(lang: Lang, path: string): string {
  if (lang === 'en') return path;
  return path === '/' ? `/${lang}` : `/${lang}${path}`;
}

/** The English path behind a localized one: '/hi/today' → '/today'. */
export function basePath(path: string): string {
  const lang = langOf(path);
  if (lang === 'en') return path || '/';
  const rest = path.slice(lang.length + 1);
  return rest || '/';
}

type Vars = Record<string, string | number>;
const fill = (s: string, vars?: Vars) => (vars ? s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`)) : s);

/**
 * t('home.loudest') or t('today.count', { n: 3 }). A plural entry is { one, other }
 * (plus few/many where a language needs them), chosen with Intl.PluralRules.
 */
export function useT(lang: Lang) {
  const dict = DICTS[lang];
  const plural = new Intl.PluralRules(LANG_INFO[lang].locale);
  return function t(key: keyof Dict, vars?: Vars): string {
    const v = (dict[key] ?? en[key]) as Dict[keyof Dict];
    if (typeof v === 'string') return fill(v, vars);
    const n = Number(vars?.n ?? 0);
    const forms = v as Record<string, string>;
    return fill(forms[plural.select(n)] ?? forms.other, vars);
  };
}

/** Intl calls PS "Palestinian Territories"; the site (and India's MEA) says "Palestine". */
const NAME_OVERRIDES: Record<string, Partial<Record<Lang, string>>> = {
  ps: { fr: 'Palestine', de: 'Palästina', es: 'Palestina', hi: 'फ़िलिस्तीन', mr: 'पॅलेस्टाईन' },
};

/** Country name in the page language (Intl knows them all). */
export function countryName(iso: string, lang: Lang, fallback: string): string {
  if (lang === 'en') return fallback;
  if (NAME_OVERRIDES[iso]?.[lang]) return NAME_OVERRIDES[iso][lang]!;
  try {
    return new Intl.DisplayNames([LANG_INFO[lang].locale.split('-u-')[0]], { type: 'region' }).of(iso.toUpperCase()) ?? fallback;
  } catch {
    return fallback;
  }
}

/** "in India" / "in the United States" / "aux États-Unis" / "im Vereinigten Königreich" / "भारत में". */
export function inCountry(iso: string, lang: Lang, fallback: string): string {
  const name = countryName(iso, lang, fallback);
  switch (lang) {
    case 'en': return ['us', 'gb', 'nl'].includes(iso) ? `in the ${name}` : `in ${name}`;
    case 'es': return `en ${name}`;
    case 'fr': return ({ us: 'aux États-Unis', gb: 'au Royaume-Uni', pk: 'au Pakistan', bd: 'au Bangladesh', np: 'au Népal', ke: 'au Kenya', nl: 'aux Pays-Bas', pt: 'au Portugal', dk: 'au Danemark', me: 'au Monténégro', cy: 'à Chypre', lb: 'au Liban', ma: 'au Maroc', ca: 'au Canada', jp: 'au Japon', lu: 'au Luxembourg', mt: 'à Malte' } as Record<string, string>)[iso] ?? `en ${name}`;
    case 'de': return ({ us: 'in den USA', gb: 'im Vereinigten Königreich', nl: 'in den Niederlanden', ch: 'in der Schweiz', tr: 'in der Türkei', ua: 'in der Ukraine', sk: 'in der Slowakei', md: 'in der Republik Moldau', lb: 'im Libanon', iq: 'im Irak', ir: 'im Iran' } as Record<string, string>)[iso] ?? `in ${name}`;
    case 'hi': return `${name} में`;
    case 'mr': return `${name} मध्ये`;
  }
}

/** "Oct 4, 2026" in the page language. Calendar dates: no time-zone shift. */
export function fmtDate(day: string, lang: Lang, withYear = true): string {
  const d = new Date(day.slice(0, 10) + 'T12:00:00Z');
  return new Intl.DateTimeFormat(LANG_INFO[lang].locale, { month: 'short', day: 'numeric', year: withYear ? 'numeric' : undefined, timeZone: 'UTC' }).format(d);
}

export function fmtMonth(day: string, lang: Lang): string {
  const d = new Date(day.slice(0, 10) + 'T12:00:00Z');
  return new Intl.DateTimeFormat(LANG_INFO[lang].locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);
}

export const fmtNumber = (n: number, lang: Lang) => n.toLocaleString(LANG_INFO[lang].locale);

/** Strings the browser scripts need (relative times, globe, form), embedded per page. */
export function clientStrings(lang: Lang) {
  const t = useT(lang);
  return {
    locale: LANG_INFO[lang].locale,
    justNow: t('time.justNow'),
    stale: t('time.stale'),
    copied: t('share.copied'),
    getTea: t('globe.getTea'),
    readSummary: t('globe.readSummary'),
    close: t('globe.close'),
    pins: t('globe.pins'),
  };
}
