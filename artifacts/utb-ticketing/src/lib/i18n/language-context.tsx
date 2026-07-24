import { createContext, useCallback, useMemo, useState, type ReactNode } from 'react';
import { fr as dateFnsFr, enUS as dateFnsEnUS, type Locale } from 'date-fns/locale';

import { TRANSLATIONS, type Language } from './translations';

const STORAGE_KEY = 'trajet-ci-lang';

const DATE_LOCALES: Record<Language, Locale> = {
  fr: dateFnsFr,
  en: dateFnsEnUS,
};

const NUMBER_LOCALES: Record<Language, string> = {
  fr: 'fr-CI',
  en: 'en-US',
};

function readStoredLanguage(): Language {
  if (typeof window === 'undefined') return 'fr';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === 'en' ? 'en' : 'fr';
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
  dateLocale: Locale;
  numberLocale: string;
}

export const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(readStoredLanguage);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

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

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage,
      t,
      dateLocale: DATE_LOCALES[language],
      numberLocale: NUMBER_LOCALES[language],
    }),
    [language, setLanguage, t],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}
