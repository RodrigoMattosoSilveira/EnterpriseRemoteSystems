import { ApiError } from "../api/client";
import type { AppLocale } from "./locale";
import { messagesByLocale, type TranslationKey } from "./resources";
import type { Translate } from "./translateResource";

/**
 * The locale in which the backend writes its human-readable error text.
 *
 * In this locale the server's own message is shown unchanged, because it is the
 * most specific text available. In every other locale the stable error `code`
 * and per-field rule codes (`fieldCodes`) are translated from the catalog.
 * Server text is never used as a translation lookup key.
 */
export const SERVER_MESSAGE_LOCALE: AppLocale = "en-US";

export interface DescribedFieldError {
  field: string;
  label: string;
  message: string;
}

export interface DescribedApiError {
  message: string;
  fields: DescribedFieldError[];
}

function isTranslationKey(key: string): key is TranslationKey {
  return Object.prototype.hasOwnProperty.call(messagesByLocale[SERVER_MESSAGE_LOCALE], key);
}

function translateIfKnown(t: Translate, key: string): string | null {
  return isTranslationKey(key) ? t(key) : null;
}

/** Presentation of any error shown by ApiErrorPanel, in the active locale. */
export function describeApiError(
  error: unknown,
  locale: AppLocale,
  t: Translate,
): DescribedApiError {
  if (!(error instanceof ApiError)) {
    return {
      message: error instanceof Error ? error.message : t("common.unexpectedError"),
      fields: [],
    };
  }

  const fieldEntries = Object.entries(error.fields ?? {});

  if (locale === SERVER_MESSAGE_LOCALE) {
    return {
      message: error.message,
      fields: fieldEntries.map(([field, message]) => ({ field, label: field, message })),
    };
  }

  return {
    message: translatedErrorMessage(error, t),
    fields: fieldEntries.map(([field, serverMessage]) => {
      const rule = error.fieldCodes?.[field];
      return {
        field,
        label: fieldLabel(field, t),
        message: (rule ? translateIfKnown(t, `apiError.rule.${rule}`) : null) ?? serverMessage,
      };
    }),
  };
}

// Batch payloads report indexed fields such as `items.1.priceListItemId`.
const INDEXED_ITEM_FIELD = /^items\.(\d+)\.(.+)$/;

function fieldLabel(field: string, t: Translate): string {
  const indexed = INDEXED_ITEM_FIELD.exec(field);
  if (indexed) {
    const [, index, innerField] = indexed;
    return t("apiField.batchItem", {
      position: Number(index) + 1,
      field: translateIfKnown(t, `apiField.${innerField}`) ?? innerField,
    });
  }
  return translateIfKnown(t, `apiField.${field}`) ?? field;
}

function translatedErrorMessage(error: ApiError, t: Translate): string {
  if (error.code) {
    return translateIfKnown(t, `apiError.code.${error.code}`) ?? error.message;
  }
  // Client-generated failures without a server envelope.
  return error.status === undefined
    ? t("apiError.network")
    : t("apiError.httpStatus", { status: error.status });
}
