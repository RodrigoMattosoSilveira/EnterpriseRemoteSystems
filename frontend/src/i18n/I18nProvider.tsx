import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  browserLanguages,
  clearStoredLocale,
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  matchSupportedLocale,
  persistLocale,
  readStoredLocale,
  resolveLocale,
  type AppLocale,
  type LocaleResolution,
} from "./locale";
import {
  formatCurrency as formatCurrencyValue,
  formatDate as formatDateValue,
  formatDateTime as formatDateTimeValue,
  formatNumber as formatNumberValue,
  type DateInput,
} from "./formatters";
import { messagesByLocale, type TranslationKey } from "./resources";
import { interpolateMessage, type TranslationParameters } from "./translate";

export interface I18nContextValue {
  locale: AppLocale;
  localeSource: LocaleResolution["source"];
  setLocale: (locale: AppLocale) => void;
  useBrowserLocale: () => void;
  t: (key: TranslationKey, parameters?: TranslationParameters) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  formatCurrency: (
    value: number,
    currency: string,
    options?: Omit<Intl.NumberFormatOptions, "currency" | "style">,
  ) => string;
  formatDate: (
    value: DateInput,
    options?: Intl.DateTimeFormatOptions,
  ) => string;
  formatDateTime: (
    value: DateInput,
    options?: Intl.DateTimeFormatOptions,
  ) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

const VISIBLE_LOCALE_RECONCILIATION_INTERVAL_MS = 250;

function currentStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function currentBrowserLanguages(): string[] {
  return typeof navigator === "undefined" ? [] : browserLanguages(navigator);
}

function resolveCurrentLocale(): LocaleResolution {
  const storage = currentStorage();
  return resolveLocale({
    storedLocale: readStoredLocale(storage),
    browserLanguages: currentBrowserLanguages(),
  });
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [resolution, setResolution] = useState<LocaleResolution>(resolveCurrentLocale);
  const { locale } = resolution;

  const setLocale = useCallback((nextLocale: AppLocale) => {
    persistLocale(currentStorage(), nextLocale);
    setResolution({ locale: nextLocale, source: "stored" });
  }, []);

  const useBrowserLocale = useCallback(() => {
    clearStoredLocale(currentStorage());
    setResolution(resolveLocale({ browserLanguages: currentBrowserLanguages() }));
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const synchronizeLocaleFromCurrentEnvironment = () => {
      const nextResolution = resolveCurrentLocale();
      setResolution((currentResolution) =>
        currentResolution.locale === nextResolution.locale &&
        currentResolution.source === nextResolution.source
          ? currentResolution
          : nextResolution,
      );
    };

    const synchronizeLocaleAcrossTabs = (event: StorageEvent) => {
      if (event.key !== LOCALE_STORAGE_KEY) {
        return;
      }

      const storedLocale = matchSupportedLocale(event.newValue);
      if (storedLocale) {
        setResolution({ locale: storedLocale, source: "stored" });
        return;
      }

      setResolution(resolveLocale({ browserLanguages: currentBrowserLanguages() }));
    };

    const synchronizeVisibleTab = () => {
      if (typeof document === "undefined" || document.visibilityState !== "visible") {
        return;
      }
      synchronizeLocaleFromCurrentEnvironment();
    };

    window.addEventListener("storage", synchronizeLocaleAcrossTabs);
    window.addEventListener("focus", synchronizeLocaleFromCurrentEnvironment);
    document.addEventListener("visibilitychange", synchronizeVisibleTab);

    // `storage`, focus, and visibilitychange are the normal fast paths. Keep a
    // small visible-tab reconciliation loop as a defensive fallback because a
    // browser/DevTools lifecycle can miss those events while Local Storage has
    // already changed. The state equality guard above makes the steady-state
    // check a no-op without triggering React rerenders.
    const reconciliationInterval = window.setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        synchronizeLocaleFromCurrentEnvironment();
      }
    }, VISIBLE_LOCALE_RECONCILIATION_INTERVAL_MS);

    return () => {
      window.removeEventListener("storage", synchronizeLocaleAcrossTabs);
      window.removeEventListener("focus", synchronizeLocaleFromCurrentEnvironment);
      document.removeEventListener("visibilitychange", synchronizeVisibleTab);
      window.clearInterval(reconciliationInterval);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || resolution.source === "stored") {
      return undefined;
    }

    const synchronizeBrowserLanguage = () => {
      setResolution(resolveLocale({ browserLanguages: currentBrowserLanguages() }));
    };

    window.addEventListener("languagechange", synchronizeBrowserLanguage);
    return () => window.removeEventListener("languagechange", synchronizeBrowserLanguage);
  }, [resolution.source]);

  const value = useMemo<I18nContextValue>(() => {
    const messages = messagesByLocale[locale] ?? messagesByLocale[DEFAULT_LOCALE];
    return {
      locale,
      localeSource: resolution.source,
      setLocale,
      useBrowserLocale,
      t: (key, parameters) =>
        interpolateMessage(
          messages[key] ?? messagesByLocale[DEFAULT_LOCALE][key] ?? key,
          parameters,
        ),
      formatNumber: (number, options) => formatNumberValue(locale, number, options),
      formatCurrency: (number, currency, options) =>
        formatCurrencyValue(locale, number, currency, options),
      formatDate: (date, options) => formatDateValue(locale, date, options),
      formatDateTime: (date, options) => formatDateTimeValue(locale, date, options),
    };
  }, [locale, resolution.source, setLocale, useBrowserLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used inside I18nProvider");
  }
  return context;
}
