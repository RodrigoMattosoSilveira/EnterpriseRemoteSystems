# Bite 31.1 — I18N Foundation and Locale Contract

## Purpose

Bite 31.1 establishes one localization contract for ERS before application screens are translated. It deliberately does **not** translate the existing shell, Administration, or business-domain UI; those migrations belong to later Bite 31 deliveries.

## Supported locales

ERS currently supports exactly:

- `en-US` — English (United States), and the fallback locale.
- `pt-BR` — Brazilian Portuguese.

Adding another locale is a deliberate product change. Region-specific languages are not silently mapped to a different supported regional dialect. The generic language tags `en` and `pt` are accepted as `en-US` and `pt-BR`, respectively; `pt-PT`, for example, is not treated as Brazilian Portuguese.

## Locale resolution

At application startup, locale resolution is deterministic:

1. A valid explicit browser-local ERS preference stored under `ers.i18n.locale` wins.
2. Otherwise, ERS walks `navigator.languages` in order and uses the first supported locale.
3. Otherwise, ERS falls back to `en-US`.

A future visible language selector uses the same service. Selecting a locale persists the explicit preference. Choosing browser language removes that preference and re-runs browser-language resolution.

Locale preference is presentation state only. It must not create, mutate, select, or infer an Authentication Account, AccountActor, Actor, Person, Membership, Collaborator, Tenant, Administration context, Support Access Lease, or authorization permission.

## Translation resources

Translation resources live under `frontend/src/i18n/resources/`.

`en-US.ts` defines the canonical translation-key type. Every supported locale must implement the complete key set. TypeScript therefore fails compilation when a locale omits a required key or introduces a misspelled/unknown key.

The runtime retains `en-US` as the defensive fallback resource. Feature deliveries should consume `useI18n().t(...)` rather than branching on locale in React components.

## Formatting contract

`frontend/src/i18n/formatters.ts` centralizes locale-sensitive presentation primitives:

- numbers;
- currencies;
- dates;
- date-times.

The selected locale controls presentation conventions. Currency remains an explicit domain value supplied by the caller; selecting Brazilian Portuguese must not silently convert USD to BRL or otherwise change financial data.

Timezone is likewise not inferred from language. Date/time formatting uses the browser/runtime timezone unless the caller explicitly supplies an `Intl.DateTimeFormatOptions.timeZone`. This preserves the existing ERS rule that user-facing timestamps may be displayed in the browser's local timezone while canonical stored timestamps remain UTC.

## React contract

`I18nProvider` is mounted above the existing Query/Router providers and exposes:

- `locale`;
- `localeSource` (`stored`, `browser`, or `fallback`);
- `setLocale(locale)`;
- `useBrowserLocale()`;
- `t(key, parameters?)`, including named placeholder interpolation;
- locale-bound number, currency, date, and date-time formatters.

The provider synchronizes the document `<html lang>` attribute, listens for the locale preference changing in another browser tab, and follows the browser `languagechange` event whenever the user has not stored an explicit ERS locale. Because browser `storage` delivery is not the only lifecycle boundary at which an existing tab can become stale, the provider also re-reads the canonical locale preference whenever the tab regains focus or becomes visible. This makes cross-tab locale state self-healing without polling.

## Out of scope for Bite 31.1

- translating existing ERS screens;
- adding the visible language selector to the application shell;
- translating People, Collaborators, Planning, Expenses, Ledger, Receipts, settlement, or Administration workflows;
- changing API/domain enum values to localized strings;
- changing persisted business data based on locale;
- adding locales other than `en-US` and `pt-BR`.

Those changes build on this foundation in Bite 31.2 and Bite 31.3.
