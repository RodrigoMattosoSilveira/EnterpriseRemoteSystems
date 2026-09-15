export const SUPPORTED_LOCALES = ["en-US", "pt-BR"] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = "en-US";
export const LOCALE_STORAGE_KEY = "ers.i18n.locale";

export interface LocaleResolutionInput {
  storedLocale?: string | null;
  browserLanguages?: readonly string[] | null;
}

export interface LocaleResolution {
  locale: AppLocale;
  source: "stored" | "browser" | "fallback";
}

export function isSupportedLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && SUPPORTED_LOCALES.includes(value as AppLocale);
}

/**
 * Normalize a browser/user language tag into one of the locales ERS explicitly supports.
 *
 * `en` and `pt` are accepted as generic language preferences. Region-specific variants
 * are only accepted when they match a supported ERS locale; for example `pt-PT` does
 * not silently become Brazilian Portuguese.
 */
export function matchSupportedLocale(value: string | null | undefined): AppLocale | null {
  const normalized = value?.trim().replaceAll("_", "-");
  if (!normalized) {
    return null;
  }

  const lower = normalized.toLowerCase();
  if (lower === "en" || lower === "en-us") {
    return "en-US";
  }
  if (lower === "pt" || lower === "pt-br") {
    return "pt-BR";
  }
  return null;
}

export function resolveLocale({
  storedLocale,
  browserLanguages,
}: LocaleResolutionInput): LocaleResolution {
  const stored = matchSupportedLocale(storedLocale);
  if (stored) {
    return { locale: stored, source: "stored" };
  }

  for (const language of browserLanguages ?? []) {
    const browserLocale = matchSupportedLocale(language);
    if (browserLocale) {
      return { locale: browserLocale, source: "browser" };
    }
  }

  return { locale: DEFAULT_LOCALE, source: "fallback" };
}

export function readStoredLocale(storage: Pick<Storage, "getItem"> | null | undefined): AppLocale | null {
  if (!storage) {
    return null;
  }

  try {
    return matchSupportedLocale(storage.getItem(LOCALE_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function persistLocale(
  storage: Pick<Storage, "setItem"> | null | undefined,
  locale: AppLocale,
): void {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Locale persistence is a convenience. A disabled/full storage area must not
    // prevent ERS from continuing with the in-memory locale selection.
  }
}

export function clearStoredLocale(
  storage: Pick<Storage, "removeItem"> | null | undefined,
): void {
  if (!storage) {
    return;
  }

  try {
    storage.removeItem(LOCALE_STORAGE_KEY);
  } catch {
    // See persistLocale: failure to persist a preference is non-fatal.
  }
}

export function browserLanguages(navigatorLike: Pick<Navigator, "language" | "languages"> | null | undefined): string[] {
  if (!navigatorLike) {
    return [];
  }

  const languages = Array.from(navigatorLike.languages ?? []).filter(Boolean);
  if (languages.length > 0) {
    return languages;
  }

  return navigatorLike.language ? [navigatorLike.language] : [];
}
