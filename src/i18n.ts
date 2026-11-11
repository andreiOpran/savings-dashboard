import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import ro from './locales/ro.json';

export const LANGUAGES = { ro: 'Română', en: 'English' } as const;
export type Lang = keyof typeof LANGUAGES;
const KEY = 'economii:lang';

function initialLanguage(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'ro' || saved === 'en') return saved;
  } catch { /* storage unavailable */ }
  return navigator.language?.toLowerCase().startsWith('ro') ? 'ro' : 'en';
}

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, ro: { translation: ro } },
  lng: initialLanguage(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false }, // React already escapes
});

i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
  try { localStorage.setItem(KEY, lng); } catch { /* storage unavailable */ }
});
document.documentElement.lang = i18n.language;

export default i18n;
