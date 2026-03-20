
import React, { useState, useCallback } from "react";
import { LANGUAGE_KEY } from '@/constants';
import { translations } from '@/i18n';

interface LanguageContextType {
  language: string;
  setLanguage: (lang: string) => void;
  t: (key: string, replacements?: {[key: string]: any}) => string;
}

export const LanguageContext = React.createContext<LanguageContextType>({
  language: 'en',
  setLanguage: (lang: string) => {},
  t: (key: string, replacements?: {[key: string]: any}) => key,
});

export const LanguageProvider = ({ children }: { children: React.ReactNode }) => {
  const [language, setLanguageState] = useState(localStorage.getItem(LANGUAGE_KEY) || 'zh-TW');

  const setLanguage = (lang: string) => {
    localStorage.setItem(LANGUAGE_KEY, lang);
    setLanguageState(lang);
  };

  const t = useCallback((key: string, replacements?: {[key: string]: any}) => {
    // @ts-ignore
    let translation = translations[language]?.[key] || translations['en']?.[key] || key;
    if (replacements) {
        Object.keys(replacements).forEach(rKey => {
            translation = translation.replace(`{${rKey}}`, replacements[rKey]);
        });
    }
    return translation;
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};
