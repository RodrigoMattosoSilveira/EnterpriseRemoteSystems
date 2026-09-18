import type { AppLocale } from "./locale";

export type DateInput = Date | number | string;

function asDate(value: DateInput): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`Invalid date value: ${String(value)}`);
  }
  return date;
}

export function formatNumber(
  locale: AppLocale,
  value: number,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(locale, options).format(value);
}

export function formatCurrency(
  locale: AppLocale,
  value: number,
  currency: string,
  options?: Omit<Intl.NumberFormatOptions, "currency" | "style">,
): string {
  return new Intl.NumberFormat(locale, {
    ...options,
    style: "currency",
    currency,
  }).format(value);
}

export function formatDate(
  locale: AppLocale,
  value: DateInput,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium" },
): string {
  return new Intl.DateTimeFormat(locale, options).format(asDate(value));
}

export function formatDateTime(
  locale: AppLocale,
  value: DateInput,
  options: Intl.DateTimeFormatOptions = {
    dateStyle: "medium",
    timeStyle: "short",
  },
): string {
  return new Intl.DateTimeFormat(locale, options).format(asDate(value));
}
