'use client';
import React, { createContext, useContext, useState, useEffect } from 'react';
import { TRANSLATIONS } from '@/lib/sriLankaData';

const LanguageContext = createContext();

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState('en');

  useEffect(() => {
    const saved = localStorage.getItem('jobzy_lang');
    if (saved && ['en', 'si', 'ta'].includes(saved)) {
      setLang(saved);
    }
  }, []);

  const switchLanguage = (newLang) => {
    setLang(newLang);
    localStorage.setItem('jobzy_lang', newLang);
  };

  const t = (key) => {
    if (TRANSLATIONS[lang] && TRANSLATIONS[lang][key]) {
      return TRANSLATIONS[lang][key];
    }
    if (TRANSLATIONS.en[key]) {
      return TRANSLATIONS.en[key];
    }
    return key;
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang: switchLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
