import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Lang, STRINGS, Strings } from './i18n';

// Same key the website uses in localStorage, so the intent is consistent across web and app.
const KEY = 'lupa-lang';

function deviceLang(): Lang {
  const code = (getLocales()[0]?.languageCode ?? 'hr').toLowerCase();
  // Croatian readers often run phones in English; the site defaults to HR, the app follows the phone language.
  return ['hr', 'bs', 'sr', 'sh', 'cnr'].includes(code) ? 'hr' : 'en';
}

type Ctx = { lang: Lang; t: Strings; setLang: (l: Lang) => void; ready: boolean };
const LangCtx = createContext<Ctx>({ lang: 'hr', t: STRINGS.hr, setLang: () => {}, ready: false });

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(deviceLang());
  const [ready, setReady] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => { if (v === 'hr' || v === 'en') setLangState(v); }).finally(() => setReady(true));
  }, []);
  const value = useMemo<Ctx>(() => ({
    lang, t: STRINGS[lang], ready,
    setLang: (l) => { setLangState(l); AsyncStorage.setItem(KEY, l).catch(() => {}); },
  }), [lang, ready]);
  return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>;
}
export const useLang = () => useContext(LangCtx);
