# Bite 31.5 — Demo Presentation and Presenter Scripts

## Purpose

Bite 31.5 turns the localized Brazilian story delivered by Bites 31.1–31.4 into a repeatable prospect presentation. It does not change ERS domain behavior. It provides a version-controlled demo deck, a presenter runbook, recovery guidance, and automated drift checks so the spoken story stays aligned with the deterministic fixture and the current UI.

The live demo remains grounded in the dedicated synthetic Tenant created by Bite 31.4:

- Tenant ID: `demo-br-serra-dourada`
- Tenant code: `DEMO_BR_SERRA_DOURADA`
- Tenant name: `Mineração Serra Dourada — DEMO`
- local database: `backend/data/brazilian-demo.db`
- default scenario anchor: `2026-09-18`

No Production/customer data is used.

## Deliverables

Bite 31.5 adds two presenter-facing assets:

1. [`docs/06-Usage/Brazilian Demo Deck.md`](06-Usage/Brazilian%20Demo%20Deck.md) — slide-by-slide presentation source for the prospect-facing story.
2. [`docs/06-Usage/Brazilian Demo Presenter Runbook.md`](06-Usage/Brazilian%20Demo%20Presenter%20Runbook.md) — setup, executive demo, deep-demo extension, recovery procedures, and closing script.

The Markdown deck is the canonical presentation source kept with the application. It can be copied into a preferred slide-authoring tool without making a binary presentation file the source of truth.

## Presentation principles

### 1. Establish the Tenant boundary before business detail

The presenter identifies `Mineração Serra Dourada — DEMO` immediately after sign-in and explains that all People, Journeys, Work Periods, Expenses, Current Accounts, and Receipts shown during the demo belong to that selected Tenant context.

This is a deliberate sales message, not a technical aside. The prospect should understand the data-isolation boundary before seeing operational data.

### 2. Tell one coherent operating story

The canonical story is:

```text
Tenant boundary
  ↓
People
  ↓
Collaborators / Journey history
  ↓
Planning / Work Period
  ↓
Gold Production / Accrual
  ↓
Expenses
  ↓
Current Account / Ledger
  ↓
Receipts
```

The presenter should move forward through this chain rather than jumping between unrelated screens.

### 3. Prefer read-only demonstration over live mutation

The Bite 31.4 dataset already contains the states needed for the story. The baseline presentation should therefore demonstrate existing records instead of creating or editing business data in front of the prospect.

This keeps every run predictable and protects the deterministic recovery path. If an interactive write is deliberately shown, reset the database before the next presentation.

### 4. Demonstrate business meaning, not internal identifiers

Stable `demo-br-*` IDs are useful for recovery and verification, but the live talk track should lead with names, dates, values, states, and business relationships. Internal IDs should be mentioned only when explaining audit/provenance or diagnosing a problem.

### 5. Keep localization presentation-only

Select `Português (Brasil)` for the customer-facing flow. Locale changes labels and formatting only; it does not change Tenant identity, authorization, stored domain codes, IDs, or financial values.

## Canonical presenter identity

The supplied Bite 31.5 source tree provisions this live presenter identity:

```text
Name:     Mariana Alves
Login:    demo.tenant-admin@example.test
Password: Demo-31.4-Brasil!
Role:     TENANT_ADMIN
Tenant:   Mineração Serra Dourada — DEMO
```

The presenter runbook is executable using this identity alone.

The current Bite 31.5 source tree does **not** seed Authentication Accounts for João Ferreira, Camila Souza, Rafael Lima, or Beatriz Nascimento. The presenter must not advertise or attempt collaborator sign-ins unless a later committed fixture explicitly provisions those credentials.

## Executive and deep-demo paths

The runbook defines two supported sequences:

- **Executive path — approximately 12 minutes:** Tenant boundary → People → Rafael Journey history → completed Work Period/80 g production → João Current Account → receipt controls → close.
- **Deep-demo extension — approximately 25–35 minutes total:** adds Beatriz Person-vs-Collaborator explanation, future planning, Camila commission calculation, expense provenance, and deeper receipt/ledger inspection.

Both paths begin from the same reset fixture and use the same presenter identity.

## Recovery contract

The presenter must recover by returning to known UI landmarks or, when fixture state was changed, by resetting the dedicated demo database:

```bash
make brazilian-demo-local-reset
make brazilian-demo-local-verify
```

The recovery contract never edits Production/customer data and never reuses the ordinary local application database.

## Automated verification

Run:

```bash
make brazilian-demo-presentation-check
```

The verifier checks that:

- the deck and presenter runbook exist;
- Tenant identity, presenter login/password, and default anchor match the Bite 31.4 seeder;
- any `.example.test` login advertised by the presenter assets is actually provisioned by the seeder;
- the core demo routes still exist;
- the Portuguese navigation labels used by the runbook match the translation resources;
- the runbook preserves executive, deep-demo, preflight, recovery, and closing sections;
- the seeded story values used in the talk track remain present (`80 g`, `5%`, `R$ 230,00`, `4 g`, `R$ 0,00`).

`make local-check` and `make local-docker-check` run this check so presentation drift is caught with normal validation.

## Out of scope

Bite 31.5 does not:

- alter Tenant boundaries, identity, authorization, or role grants;
- create new demo Persons, Journeys, Work Periods, Expenses, ledger entries, or receipts;
- add new Authentication Accounts;
- change the Bite 31.4 fixture values;
- generate a binary PowerPoint file as the canonical source;
- require Production data or Production access.

The deck and runbook are presentation assets over the already-delivered application and deterministic fixture.
