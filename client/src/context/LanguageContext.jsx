import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import en from '../i18n/en';
import fr from '../i18n/fr';

const dictionaries = { EN: en, FR: fr };
const LanguageContext = createContext(null);

const lookup = (dictionary, key) => key.split('.').reduce((node, part) => node?.[part], dictionary);

const initialLanguage = () => {
  const stored = localStorage.getItem('ccts.language');
  if (stored === 'EN' || stored === 'FR') return stored;
  return navigator.language?.toLowerCase().startsWith('fr') ? 'FR' : 'EN';
};

// Switching language only changes this context, so forms keep what was typed.
export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(initialLanguage);

  useEffect(() => {
    localStorage.setItem('ccts.language', language);
    document.documentElement.lang = language.toLowerCase();
    document.title = dictionaries[language].app.title;
  }, [language]);

  const t = useCallback((key, values = {}) => {
    const text = lookup(dictionaries[language], key) ?? lookup(en, key) ?? key;
    if (typeof text !== 'string') return text;
    return text.replace(/\{(\w+)\}/g, (match, name) => values[name] ?? match);
  }, [language]);

  const formatDateTime = useCallback((value) => new Intl.DateTimeFormat(language === 'FR' ? 'fr-CM' : 'en-GB', {
    dateStyle: 'medium', timeStyle: 'medium', timeZone: 'Africa/Douala',
  }).format(new Date(value)), [language]);

  const value = useMemo(() => ({ language, setLanguage, t, formatDateTime }), [language, t, formatDateTime]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export const useLanguage = () => useContext(LanguageContext);
