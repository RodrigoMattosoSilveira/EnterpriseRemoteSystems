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
  LOCALE_STORAGE_KEY,
  matchSupportedLocale,
  persistLocale,
  readStoredLocaleValue,
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
import type { TranslationKey } from "./resources";
import type { TranslationParameters } from "./translate";
import { translateForLocale } from "./translateResource";

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
  const storedValue = readStoredLocaleValue(storage);
  const storedLocale = matchSupportedLocale(storedValue);

  if (storedLocale) {
    // Keep the browser preference canonical even when a caller writes an
    // accepted alias such as `pt` or `EN_us` directly into Local Storage.
    if (storedValue !== storedLocale) {
      persistLocale(storage, storedLocale);
    }
    return { locale: storedLocale, source: "stored" };
  }

  const resolved = resolveLocale({ browserLanguages: currentBrowserLanguages() });
  if (storedValue !== null) {
    // An existing but unsupported value is invalid persisted state. Repair it
    // to the supported locale ERS actually resolved instead of leaving a raw
    // value that can never become an active application locale.
    persistLocale(storage, resolved.locale);
    return { locale: resolved.locale, source: "stored" };
  }

  return resolved;
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [resolution, setResolution] = useState<LocaleResolution>(resolveCurrentLocale);
  const { locale } = resolution;

  const setLocale = useCallback((nextLocale: AppLocale) => {
    const storage = currentStorage();
    persistLocale(storage, nextLocale);

    // Persist explicit user intent at the moment of selection. A second
    // immediate attempt covers a transient first write failure without ever
    // allowing a later page teardown to write stale in-memory state over a
    // newer preference.
    if (readStoredLocaleValue(storage) !== nextLocale) {
      persistLocale(storage, nextLocale);
    }

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

      synchronizeLocaleFromCurrentEnvironment();
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

    return () => {
      window.removeEventListener("storage", synchronizeLocaleAcrossTabs);
      window.removeEventListener("focus", synchronizeLocaleFromCurrentEnvironment);
      document.removeEventListener("visibilitychange", synchronizeVisibleTab);
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
    return {
      locale,
      localeSource: resolution.source,
      setLocale,
      useBrowserLocale,
      t: (key, parameters) => translateForLocale(locale, key, parameters),
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
