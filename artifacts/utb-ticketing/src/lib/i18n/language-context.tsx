import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { fr as dateFnsFr, enUS as dateFnsEnUS, zhCN as dateFnsZhCN, type Locale } from 'date-fns/locale';

import { TRANSLATIONS, type Language } from './translations';

const STORAGE_KEY = 'trajet-ci-lang';

const DATE_LOCALES: Record<Language, Locale> = {
  fr: dateFnsFr,
  en: dateFnsEnUS,
  zh: dateFnsZhCN,
};

const NUMBER_LOCALES: Record<Language, string> = {
  fr: 'fr-CI',
  en: 'en-US',
  zh: 'zh-CN',
};

/** Value for <html lang>, so the browser picks the right fonts (Chinese glyphs) and screen readers the right voice. */
const HTML_LANG: Record<Language, string> = {
  fr: 'fr',
  en: 'en',
  zh: 'zh-CN',
};

function readStoredLanguage(): Language {
  if (typeof window === 'undefined') return 'fr';
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === 'en' || stored === 'zh' ? stored : 'fr';
  } catch {
    return 'fr'; // storage unavailable
  }
}

function resolve(dict: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object' && part in acc) {
      return (acc as Record<string, unknown>)[part];
    }
    return undefined;
  }, dict);
}

interface LanguageContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  /** Plural-aware t(): picks "<key>_one" or "<key>_other" and fills {{count}}. */
  tc: (key: string, count: number, vars?: Record<string, string | number>) => string;
  dateLocale: Locale;
  numberLocale: string;
}

export const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(readStoredLanguage);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore: the choice just won't be remembered
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = HTML_LANG[language];
  }, [language]);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const value = resolve(TRANSLATIONS[language], key);
      let result = typeof value === 'string' ? value : key;
      if (vars) {
        for (const [name, replacement] of Object.entries(vars)) {
          result = result.replace(`{{${name}}}`, String(replacement));
        }
      }
      return result;
    },
    [language],
  );

  // French treats 0 and 1 as singular ("0 chambre"), English only 1; Chinese has a single form
  const tc = useCallback(
    (key: string, count: number, vars?: Record<string, string | number>) => {
      const singular = language === 'fr' ? count <= 1 : count === 1;
      return t(`${key}_${singular ? 'one' : 'other'}`, { count, ...vars });
    },
    [language, t],
  );

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage,
      t,
      tc,
      dateLocale: DATE_LOCALES[language],
      numberLocale: NUMBER_LOCALES[language],
    }),
    [language, setLanguage, t, tc],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
