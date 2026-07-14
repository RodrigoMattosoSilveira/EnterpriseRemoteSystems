# Internationalization rollout plan

This document breaks the i18n work into small, deliverable sub-issues so the enhancement can be shipped incrementally.

## Recommended approach

Use a lightweight React-based setup centered on `i18next` and `react-i18next`:

- Add a single app-level i18n provider at the root of the frontend.
- Start with two locales: English and Brazilian Portuguese.
- Keep translation keys organized by feature namespace (for example `common`, `people`, `planning`, `expenses`).
- Use locale-aware formatting for dates, numbers, and currency via `Intl`.
- Migrate UI text in small batches so the app remains usable at each step.

## Suggested implementation order

### Issue 1 — Set up the i18n foundation
**Goal:** Add the infrastructure needed to render localized text.

**Scope**
- Install `i18next`, `react-i18next`, and `i18next-browser-languagedetector`.
- Create the i18n bootstrap file and locale resource files.
- Wire the provider into the app root.
- Add a language switcher in the main shell.

**Acceptance criteria**
- The app loads with a default locale.
- Switching locale changes visible UI text.
- Missing keys fall back safely.

### Issue 2 — Migrate shared layout and navigation text
**Goal:** Localize the app shell before feature-specific work.

**Scope**
- Localize the main layout, navigation, breadcrumbs, loading states, and empty states.
- Cover common actions such as save, cancel, edit, delete, search, and filter.

**Acceptance criteria**
- The shell and shared UI are fully localized.
- No critical hard-coded user-facing strings remain in the shared layout.

### Issue 3 — Migrate people and profile flows
**Goal:** Convert the people-related pages to use translation keys.

**Scope**
- Cover people list, person form, detail views, status labels, and validation messages.
- Add translations for field labels and buttons.

**Acceptance criteria**
- The people feature works in both locales with no visible English-only text.
- Forms and validation messages are localized.

### Issue 4 — Migrate planning and operations features
**Goal:** Localize the planning experience and operational pages.

**Scope**
- Translate planning views, filters, table headers, status labels, and messages.
- Include any work-period and assignment-related UI.

**Acceptance criteria**
- Planning pages render correctly in both locales.
- User actions and feedback messages are translated.

### Issue 5 — Migrate expense, receipt, and finance flows
**Goal:** Cover the remaining business features that expose user-facing text.

**Scope**
- Translate expense pages, receipts, current-account views, and related dialogs.
- Ensure finance-specific labels and messages are covered.

**Acceptance criteria**
- Finance-related screens are localized.
- Currency and number formatting follow the selected locale.

### Issue 6 — Add test coverage for localization
**Goal:** Make the localization effort sustainable.

**Scope**
- Add unit tests for the i18n setup and provider behavior.
- Add component tests to verify that localized labels render correctly.
- Add at least one smoke test for language switching.

**Acceptance criteria**
- The i18n foundation has regression tests.
- Locale switching does not break rendering.

### Issue 7 — Document translation conventions and ownership
**Goal:** Prevent the translation layer from becoming inconsistent over time.

**Scope**
- Document namespace conventions, key naming rules, and fallback behavior.
- Add guidance for contributors on how to translate new UI text.
- Define a simple review flow for new translations.

**Acceptance criteria**
- New contributors can add translations without guessing.
- The project has a repeatable localization workflow.

## Suggested implementation sequence

1. Start with Issue 1.
2. Follow with Issue 2 so the app shell is localized early.
3. Migrate features in batches: people, planning, finance.
4. Finish with testing and documentation.

## Notes for this repository

The frontend already has a clear feature-based structure under `frontend/src/features`, which makes it a good fit for namespace-based translation files. A practical first milestone would be to localize the shared app shell and the people feature, then expand to the rest of the product.
