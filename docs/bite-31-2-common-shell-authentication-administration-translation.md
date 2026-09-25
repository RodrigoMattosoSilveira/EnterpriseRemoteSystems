# Bite 31.2 — Common Shell, Authentication, and Administration Translation

## Purpose

Bite 31.2 makes the ERS entry point and administrative control plane usable in
Brazilian Portuguese by building on the locale contract delivered in Bite
31.1. The supported locales remain exactly `en-US` and `pt-BR`, with `en-US`
as the fallback locale.

This delivery is deliberately presentation-only. Selecting a language must not
create, mutate, select, or infer an Authentication Account, AccountActor,
Actor, Person, Membership, Collaborator, Tenant, Administration context,
Support Access Lease, role, or authorization permission.

## Visible language selection

The authentication card and signed-in top bar expose the same locale selector.
It offers:

- **Browser language** — removes the explicit `ers.i18n.locale` preference and
  resolves the locale from the browser/fallback contract established in Bite
  31.1;
- **English (United States)** — persists canonical `en-US`;
- **Português (Brasil)** — persists canonical `pt-BR`.

Changing the selection uses `I18nProvider`; no component branches directly on
"Portuguese" or on a browser language string. The existing `<html lang>`,
Local Storage, cross-tab, focus, and visibility reconciliation behavior from
Bite 31.1 therefore remains the single locale-state mechanism.

## Translated 31.2 surfaces

The `pt-BR` resource now covers the prospect-visible shared and administrative
surfaces in this delivery:

- sign-in, password change, and password reset;
- authentication/reactivation messages and states;
- application shell and primary navigation;
- current Administration/Tenant context selector and Support Access Lease
  presentation;
- common route errors, API-error chrome, empty/loading states, and shared
  actions used by the translated surfaces;
- Tenant Administration catalog, creation, lifecycle, and Tenant Administrator
  assignment/removal presentation;
- Authentication Administration account, Person, Actor, Membership, reset
  token, activation/deactivation, and identity-boundary presentation.

Proper names, user-entered values, Tenant names, logins, IDs, API/domain codes,
and persisted enum values are not translated.

## Brazilian Portuguese terminology

The administrative translation intentionally keeps ERS domain distinctions
visible:

| ERS term | `pt-BR` presentation |
| --- | --- |
| Tenant | Tenant |
| Authentication Account | Conta de Autenticação |
| Application Administrator | Administrador da Aplicação |
| Tenant Administrator | Administrador do Tenant |
| Person | Pessoa |
| Actor | Ator |
| Membership | Vínculo |
| Support Access Lease | Concessão de Acesso de Suporte |

These are presentation labels only. Canonical API values, authorization role
codes, scope codes, and database values remain unchanged.

## Locale-independent behavior

UI behavior must never depend on the localized text of a control. In
particular, Authentication Administration marks its account-creation action
with a stable data attribute so the lookup-dismiss boundary can recognize the
action under either locale. The legacy English-text recognition remains only
as backward-compatible defensive behavior; translated text is not used as a
business/authorization discriminator.

## Error and status handling

Known shared UI states are translated from stable frontend state or error
codes. The API continues to own raw server detail and field-validation text
where no stable translation key exists; 31.2 does not reinterpret arbitrary
server strings or modify backend contracts.

Locale-sensitive timestamps shown by the translated shell/administration
surfaces use the centralized Bite 31.1 date/date-time formatters. Locale never
changes the underlying timestamp or financial/domain value.

## Automated coverage

Bite 31.2 adds regression coverage for:

- choosing `pt-BR` from the visible selector and persisting the canonical
  locale;
- returning to browser-derived locale selection;
- Portuguese sign-in labels and `<html lang>` synchronization;
- Portuguese common shell/navigation and Administration/Tenant context labels;
- Portuguese Tenant Administration and Authentication Administration headings
  and actions;
- locale persistence across reloads;
- locale-independent Authentication Administration account-creation behavior.

Existing Bite 31.1 resource-completeness tests continue to require every
`en-US` key to exist in `pt-BR`.

## Out of scope for Bite 31.2

The business-demo journey remains Bite 31.3 work. This delivery does **not**
claim complete translation of:

- People;
- Collaborators or Collaborator Journey;
- Planning or Work Plans;
- Expenses;
- Balances/Ledger;
- Receipts or settlement;
- less frequently demonstrated support/operations pages outside the common
  shell and the administration surfaces covered above.

Those screens consume the same translation and formatting contracts in Bite
31.3 — Core Business Demo Journey in pt-BR. Repeatable Brazilian demo data and
prospect presentation scripts remain Bite 31.4 and Bite 31.5 work.
