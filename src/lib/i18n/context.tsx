"use client";

import { createContext, useContext, useEffect, useMemo } from "react";
import { createTranslator, type Translator } from "./index";
import { DEFAULT_LOCALE, type Locale } from "./types";

type LocaleContextValue = { locale: Locale; t: Translator };

const LocaleContext = createContext<LocaleContextValue>({
  locale: DEFAULT_LOCALE,
  t: createTranslator(DEFAULT_LOCALE),
});

/**
 * Fournit la locale aux composants client. Le layout racine ne connaît pas la
 * langue (elle dépend du dossier ouvert), donc c'est ce provider qui aligne
 * `<html lang>` — sinon un lecteur d'écran lirait de l'anglais avec une voix
 * française, et Chrome proposerait de traduire une page déjà traduite.
 */
export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, t: createTranslator(locale) }),
    [locale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useI18n(): LocaleContextValue {
  return useContext(LocaleContext);
}

/** Raccourci quand seul le traducteur est utile. */
export function useT(): Translator {
  return useContext(LocaleContext).t;
}
