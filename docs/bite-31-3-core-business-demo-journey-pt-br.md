# Bite 31.3 — Core Business Demo Journey in pt-BR

## Purpose

Bite 31.3 extends the Bite 31.1 locale contract and Bite 31.2 translated shell
into the core Tenant business journey used for the Brazilian prospect demo.
The implementation remains presentation-only: locale selection never changes
Tenant boundaries, identity, authorization, persisted domain values, or
financial semantics.

## Translated demo journey

The `pt-BR` experience now covers the principal Tenant business flow:

- People list, creation, profile/form, and Person detail presentation;
- Collaborator list, Collaborator creation, Journey detail, work assignment,
  and Journey settlement;
- Work Period list/detail, Planning, Inform, and Accrual workflows;
- Gold Production entry and review surfaces used by accrual;
- Expenses list, creation, detail, calculation/earnings presentation;
- Collaborator Current Account / Ledger presentation;
- outstanding receipt workbench and printable receipt lifecycle.

These screens consume the same typed translation resources and centralized
number, currency, date, and date-time formatters established by Bite 31.1.

## Domain and data invariants

Localization changes presentation only. ERS does not translate or mutate:

- Tenant names, Tenant IDs, or canonical codes;
- Person/Collaborator names, nicknames, logins, or user-entered text;
- Actor, Membership, Journey, Ledger, Receipt, Expense, Work Period, or other
  record identifiers;
- authorization role/scope codes;
- persisted enum/code values or financial amounts.

`Tenant` remains the intentional ERS domain term in Brazilian Portuguese.
Known persisted/status codes are translated only at their display boundary.

## Formatting

Rendered business values use the active locale through the Bite 31.1 formatter
contract. In particular, BRL currency, decimal/gold quantities, dates, and
timestamps are formatted for the selected locale without changing stored
values or calculation precision.

Pure helpers that are also exercised independently retain deterministic English
defaults for backward-compatible unit tests; rendered components pass the
active translator/formatter explicitly.

## Browser translation boundary

ERS owns its localization. The document-level browser-translation opt-out added
in Bite 31.2 remains in force so browser machine translation does not rewrite
an already-localized ERS page.

## Automated coverage

Bite 31.3 adds/extends coverage for:

- typed `en-US` / `pt-BR` resource parity;
- existing feature unit tests running through `I18nProvider` where translated
  feature components require it;
- the core Tenant business workbenches remaining `pt-BR` across People,
  Collaborators, Work Periods, Expenses, and Outstanding Receipts;
- preservation of existing domain/authorization behavior through the existing
  feature, backend, and Playwright suites.

## Out of scope

Bite 31.3 does not localize canonical backend/domain data, change backend API
contracts, or introduce Brazilian demo records. Repeatable Brazilian demo data
belongs to Bite 31.4; prospect presentation scripts belong to Bite 31.5.
