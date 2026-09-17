import { ui, defaultLang, showDefaultLang, languages, type LangCode, routeTranslations, getCanonicalSlug } from './ui';

// Extract the language prefix from a URL pathname.
// Examples:
//   /about                  -> 'en'  (default lang, root path)
//   /es/                    -> 'es'
//   /es/acerca-de           -> 'es'
//   /fr/fusionner-pdf       -> 'fr'
//   /                       -> 'en'
export function getLangFromUrl(url: URL): LangCode {
  const [, maybeLang] = url.pathname.split('/');
  if (maybeLang && maybeLang in languages) {
    return maybeLang as LangCode;
  }
  return defaultLang;
}

// Build a path for the given target language, preserving the current page's
// logical route (i.e. translating the canonical slug into the target locale).
// When targetLang is the default and we hide the default lang, returns the unprefixed path.
export function useTranslatedPath(targetLang?: LangCode) {
  return function translatePath(path: string, lang?: LangCode): string {
    const currentLang = lang ?? targetLang ?? defaultLang;
    const cleanPath = path.replace(/^\/+/, '').replace(/\/+$/, '');

    // Home
    if (cleanPath === '') {
      if (currentLang === defaultLang && !showDefaultLang) return '/';
      return `/${currentLang}/`;
    }

    // Already prefixed — strip & re-translate
    const segments = cleanPath.split('/');
    const first = segments[0];
    let restSegments = segments;
    let baseCanonical = cleanPath;
    if (first in languages) {
      // path looks like "es/acerca-de" — treat the rest as already-localized
      restSegments = segments.slice(1);
      baseCanonical = restSegments.join('/') || '';
    }

    // baseCanonical may be a translated slug; reverse-look it up so we know the logical page
    const langForReverse = (first in languages ? (first as LangCode) : defaultLang);
    const canonical = getCanonicalSlug(langForReverse, baseCanonical);

    // Translate the canonical slug into the target language
    const targetTranslated = routeTranslations[currentLang]?.[canonical] ?? canonical;

    if (currentLang === defaultLang && !showDefaultLang) {
      return `/${targetTranslated}/`;
    }
    return `/${currentLang}/${targetTranslated}/`;
  };
}

// Given a URL, find the canonical (English) route slug for the page being viewed.
// e.g. /es/acerca-de -> 'about', /fr/fusionner-pdf -> 'merge-pdf', /merge-pdf -> 'merge-pdf'
export function getRouteFromUrl(url: URL): string {
  const lang = getLangFromUrl(url);
  const [, ...segments] = url.pathname.split('/');
  const filtered = (lang === defaultLang && !showDefaultLang) ? segments : segments.slice(1);
  const slug = filtered.filter(Boolean).join('/') || '';
  return getCanonicalSlug(lang, slug);
}

// Build a t() function for the requested language that gracefully falls back
// to the default language when a key is missing.
export function useTranslations(lang: LangCode | undefined) {
  const target = (lang && lang in ui) ? lang : defaultLang;
  return function t(key: keyof typeof ui[typeof defaultLang]): string {
    const primary = ui[target]?.[key];
    if (primary !== undefined) return primary as string;
    return ui[defaultLang][key] as string;
  };
}
