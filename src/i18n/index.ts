import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './locales/en.json';
import fr from './locales/fr.json';
import rw from './locales/rw.json';

if (!i18n.isInitialized) {
  i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources: { en: { translation: en }, fr: { translation: fr }, rw: { translation: rw } },
      fallbackLng: 'en',
      supportedLngs: ['en', 'fr', 'rw'],
      interpolation: { escapeValue: false },
      detection: {
        order: ['localStorage', 'navigator', 'htmlTag'],
        caches: ['localStorage'],
        lookupLocalStorage: 'i18nextLng',
      },
      returnNull: false,
    });

  const applyLang = (lng: string) => {
    try { document.documentElement.setAttribute('lang', lng.slice(0, 2)); } catch { /* noop */ }
  };
  applyLang(i18n.language || 'en');
  i18n.on('languageChanged', applyLang);
}

export default i18n;
