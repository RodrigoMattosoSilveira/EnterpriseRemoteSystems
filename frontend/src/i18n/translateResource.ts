import type { AppLocale } from "./locale";
import { DEFAULT_LOCALE } from "./locale";
import { messagesByLocale, type TranslationKey } from "./resources";
import { interpolateMessage, type TranslationParameters } from "./translate";

export type Translate = (
  key: TranslationKey,
  parameters?: TranslationParameters,
) => string;

export function translateForLocale(
  locale: AppLocale,
  key: TranslationKey,
  parameters?: TranslationParameters,
): string {
  const messages = messagesByLocale[locale] ?? messagesByLocale[DEFAULT_LOCALE];
  return interpolateMessage(
    messages[key] ?? messagesByLocale[DEFAULT_LOCALE][key] ?? key,
    parameters,
  );
}

export const translateEnglish: Translate = (key, parameters) =>
  translateForLocale(DEFAULT_LOCALE, key, parameters);
