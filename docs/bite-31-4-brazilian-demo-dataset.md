# Bite 31.4 — Brazilian Demo Dataset and Repeatable Scenario

## Purpose

Bite 31.4 provides a deterministic, resettable Brazilian prospect-demo dataset for the pt-BR journey delivered by Bites 31.1–31.3. The dataset is a story fixture, not a generic volume seed.

The scenario uses only synthetic data. It never reads, copies, imports, or derives records from Production/customer/person data.

## Safety boundary

The fixture is intentionally isolated in its own Tenant:

- Tenant ID: `demo-br-serra-dourada`
- Tenant code: `DEMO_BR_SERRA_DOURADA`
- Tenant name: `Mineração Serra Dourada — DEMO`
- local database: `backend/data/brazilian-demo.db`

The seeder refuses to run when `APP_ENV=production`/`prod`. The Make targets also refuse `ENV=production`.

Synthetic identity details use `.example.test` e-mail addresses, CPF-formatted values with deliberately invalid check digits, synthetic phone numbers, and explicitly fictional address/bank data. They are demo presentation data only and must never be treated as verified real identities.

## Repeatable reset

Stop any backend process that is using the demo database, then run from the repository root:

```bash
make brazilian-demo-local-reset
```

The default scenario anchor is `2026-09-18`. To regenerate the same story around another explicit business date:

```bash
make brazilian-demo-local-reset BRAZILIAN_DEMO_AS_OF=2026-10-15
```

The same `BRAZILIAN_DEMO_AS_OF` value produces the same relative business dates and stable record IDs. The reset target deletes only `backend/data/brazilian-demo.db` plus its WAL/SHM sidecars, migrates a fresh database, and seeds the scenario.

The seeder itself deliberately refuses to overlay an already-present demo Tenant. This prevents a sales/demo reset from silently mutating a database that has been used interactively. Use the reset target to restore the canonical scenario.

Verify an existing demo database without changing it:

```bash
make brazilian-demo-local-verify
```

## Starting the demo locally

Backend:

```bash
ERS_DATABASE_PATH=data/brazilian-demo.db make local-backend
```

Frontend:

```bash
make local-frontend
```

Sign in as the Tenant Administrator:

```text
Login:    demo.tenant-admin@example.test
Password: Demo-31.4-Brasil!
Tenant:   Mineração Serra Dourada — DEMO
Role:     Tenant Administrator
```

The fixture also includes three deterministic self-service credentials so the demo can switch from the administrator's operational view to what an individual Person/Collaborator sees inside the same Tenant:

| Person | Login | Password | Access model |
| --- | --- | --- | --- |
| João Ferreira (`João`) | `demo31.4.joao@example.test` | `Demo-31.4-Person!` | Intrinsic Person + active-Collaborator self-service |
| Camila Souza (`Cami`) | `demo31.4.camila@example.test` | `Demo-31.4-Person!` | Intrinsic Person + active-Collaborator self-service |
| Rafael Lima (`Rafa`) | `demo31.4.rafael@example.test` | `Demo-31.4-Person!` | Intrinsic Person + active-Collaborator self-service |

These synthetic demo Accounts have `must_change_password = false` so a reset returns to immediately usable credentials. Their Tenant Actors receive **no delegated Role Grants**: self-service authority is derived from the canonical `Account → AccountActor → Membership → Person` identity graph and Rafael/João/Camila's active Collaborator Journey. This intentionally demonstrates the same authorization boundary used by ERS rather than creating a special demo role.

Beatriz intentionally has no Authentication Account; she remains the example of a complete Person who has not become a Collaborator.

Select `Português (Brasil)` before beginning the customer-facing journey.

## Story fixture

The dataset is designed to support the Bite 31.3 customer story:

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

### People

Five synthetic Persons are provided:

| Person | Demo purpose |
| --- | --- |
| Mariana Alves (`Mari Admin`) | Tenant Administrator; demonstrates that a Person and an administrator role are distinct concepts. |
| João Ferreira (`João`) | Active daily-wage Collaborator with BRL earnings, a canteen Expense, positive BRL balance, and a pending receipt. |
| Camila Souza (`Cami`) | Active commission Collaborator with posted gold earnings. |
| Rafael Lima (`Rafa`) | Demonstrates Journey history: one finished Journey plus a newer active Journey. Current BRL earnings and a completed Expense offset to zero. |
| Beatriz Nascimento (`Bia`) | Complete Person with no Collaborator Journey; demonstrates the People-versus-Collaborator distinction. |

### Collaborator/Journey history

The fixture contains four Journeys:

- João — current active Journey, daily wage `R$ 300,00` per worked day;
- Camila — current active Journey, `5%` gold-production commission;
- Rafael — historical finished Journey;
- Rafael — current active Journey, daily wage `R$ 350,00` per worked day.

The historical Rafael Journey has no outstanding financial balance. It exists specifically so the presenter can explain that the Person persists while operational Journeys have their own lifecycle/history.

### Planning and Work Periods

Two Work Periods are seeded relative to the scenario anchor:

- `as-of - 2 days`: `DAY`, `06:00-18:00`, `FULLY_POSTED`, with João, Camila, and Rafael marked `WORKED`;
- `as-of + 1 day`: `DAY`, `06:00-18:00`, `PLANNING`, with the same three active Collaborators included but not yet informed.

This creates an intentional completed-versus-pending planning contrast.

### Gold Production and Accrual

The completed Work Period has:

- `80 g` synthetic Gold Production;
- one posted Accrual run;
- João: `R$ 300,00` posted earning;
- Camila: `4 g` posted gold commission (`5%` of `80 g`);
- Rafael: `R$ 350,00` posted earning.

A synthetic gold price of `R$ 742,35/g` is also present for expense/gold-price demonstrations.

### Expenses, balances, and receipts

The scenario intentionally provides different financial/control states:

| Person | Example | Ledger/receipt story | Resulting active balance |
| --- | --- | --- | --- |
| João | 2 canteen meals at `R$ 35,00` = `R$ 70,00` | Expense debit with `PENDING_ISSUE` receipt | `R$ 230,00` |
| Camila | posted gold commission | earning credit | `4 g` |
| Rafael | synthetic flight `R$ 350,00` | Expense debit with `RETURNED` signed receipt | `R$ 0,00` |

This lets the presenter contrast financial value, ledger provenance, and receipt-control state without creating records during the live demo.

## Deterministic identifiers

All fixture-created identifiers start with `demo-br-`. They are stable across resets using the same schema/scenario version. This makes screenshots, automated verification, and presenter recovery instructions predictable.

Canonical domain values are not translated or modified. Tenant IDs, Person/Journey/Expense/Ledger/Receipt IDs, role codes, reference-data codes, and persisted financial values remain canonical ERS data.

## Automated verification

`make local-check` now runs:

```bash
make brazilian-demo-fixture-check
```

The verifier creates a temporary fully migrated SQLite database using the repository migrations, seeds Bite 31.4, and confirms:

- exact demo Tenant isolation;
- five Persons and Memberships;
- four Journeys including one historical closed Journey;
- two Work Periods and six assignments;
- Gold Production plus posted Accrual items;
- two Expenses;
- one pending and one returned receipt;
- the demo Tenant Administrator binding and role grant;
- João/Camila/Rafael self-service Account → AccountActor → Membership bindings with no delegated Role Grants;
- Beatriz remaining without an Authentication Account;
- expected João/Camila/Rafael balances;
- no `demo-br-*` business records attached to the default Tenant;
- a second direct seed attempt is rejected, preserving reset semantics.

## Out of scope

Bite 31.4 does not provide the presenter narration/deck, executive/deep-demo sequencing, or off-script recovery instructions. Those belong to Bite 31.5.
