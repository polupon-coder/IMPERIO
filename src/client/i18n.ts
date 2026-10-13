// Idioma de la interfaz (español o inglés). Cada dispositivo guarda su elección.
// Los textos se escriben en español y t() los traduce con el diccionario de i18n-en.ts;
// lo que no esté en el diccionario se muestra en español.
import { useSyncExternalStore } from 'react';
import { NAMES, NAMES_EN } from '../engine';
import { EN, EN_PATTERNS } from './i18n-en';

export type Lang = 'es' | 'en';
const KEY = 'imperio:lang';

function initial(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'es' || saved === 'en') return saved;
  } catch {
    /* sin almacenamiento */
  }
  return typeof navigator !== 'undefined' && !navigator.language.toLowerCase().startsWith('es') ? 'en' : 'es';
}

let lang: Lang = initial();
const listeners = new Set<() => void>();

export const getLang = () => lang;
export function setLang(l: Lang) {
  lang = l;
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* sin almacenamiento */
  }
  document.documentElement.lang = l;
  listeners.forEach((f) => f());
}
if (typeof document !== 'undefined') document.documentElement.lang = lang;

/** Vuelve a pintar el componente cuando cambia el idioma. */
export function useLang(): Lang {
  return useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    () => lang,
  );
}

/** Traduce un texto de la interfaz. Los huecos {0}, {1}… se rellenan con `args`. */
export function t(es: string, ...args: Array<string | number>): string {
  const tpl = lang === 'en' ? EN[es] ?? es : es;
  return args.length ? tpl.replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i)] ?? '')) : tpl;
}

/** Nombres de terrenos, recursos, tropas, edificios y lados en el idioma actual. */
export const nm = () => (lang === 'en' ? NAMES_EN : NAMES);

/** Nombres de las máquinas (los pone el servidor en español). */
const BOT_NAMES_EN: Record<string, string> = {
  'Rey del Noroeste': 'King of the Northwest',
  'Rey del Noreste': 'King of the Northeast',
  'Rey del Sureste': 'King of the Southeast',
  'Rey del Suroeste': 'King of the Southwest',
};
/** Nombre de jugador a mostrar (las máquinas se traducen). */
export const pn = (name: string) => (lang === 'en' ? BOT_NAMES_EN[name] ?? name : name);
/** Sustituye los nombres de las máquinas dentro de un texto (registro, combates). */
export const withBotNames = (text: string) => {
  if (lang !== 'en') return text;
  for (const [es, en] of Object.entries(BOT_NAMES_EN)) text = text.split(es).join(en);
  return text;
};

/**
 * Mensajes que llegan del servidor o del motor en español (errores, motivos): se traducen con el
 * diccionario o, si llevan datos, con los patrones.
 */
export function tr(es: string | undefined): string {
  if (!es || lang !== 'en') return es ?? '';
  if (EN[es]) return EN[es];
  for (const [re, en] of EN_PATTERNS) if (re.test(es)) return es.replace(re, en);
  return es;
}

/** Texto de una entrada del registro en el idioma actual. */
export const logText = (e: { text: string; en?: string }) => withBotNames(lang === 'en' && e.en ? e.en : e.text);
