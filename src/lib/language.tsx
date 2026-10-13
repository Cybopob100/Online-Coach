import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { getLang, Lang, LANGS, setCurrentLang } from './i18n';

const KEY = 'app.language';

type LanguageState = { lang: Lang; setLang: (lang: Lang) => void; ready: boolean };

const LanguageContext = createContext<LanguageState>({ lang: getLang(), setLang: () => {}, ready: false });

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(getLang());
  const [ready, setReady] = useState(false);

  // Загружаем сохранённый язык до первого показа интерфейса
  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((saved) => {
        if (saved && LANGS.some((l) => l.code === saved)) {
          setCurrentLang(saved as Lang);
          setLangState(saved as Lang);
        }
      })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const setLang = useCallback((next: Lang) => {
    setCurrentLang(next);
    setLangState(next);
    AsyncStorage.setItem(KEY, next).catch(() => {});
  }, []);

  return <LanguageContext.Provider value={{ lang, setLang, ready }}>{children}</LanguageContext.Provider>;
}

/** Подписывает экран на смену языка: при выборе другого языка экран перерисуется. */
export const useLang = () => useContext(LanguageContext);
