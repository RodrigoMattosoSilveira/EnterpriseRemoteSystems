# Bite 32.3 — Work and Credit Evidence

## Purpose

Bite 32.3 lets an authenticated Person inspect durable Work and Credit Evidence for each of their current or closed Collaborator Journeys in the currently selected Tenant.

The feature is a read projection over canonical ERS operational and financial records. It does not copy, recalculate, or persist a second accounting history.

The Person can use the evidence to understand:

- the work ERS recognized for the Journey;
- the compensation rule attached to the Journey;
- the inputs and accrual calculations used to determine earnings;
- the Current Account credits and debits posted for the Journey;
- receipt/settlement provenance when present; and
- reversals, replacements, and other corrections preserved in the ledger history.

An open Journey therefore exposes a living statement. A closed Journey remains readable as durable historical evidence.

## Authorization and Tenant boundary

Bite 32.3 introduces the intrinsic self-service permission:

```text
work_credit_evidence.self.read
```

The permission is granted when the authenticated Tenant Actor's Membership has any Collaborator Journey history, including when every Journey is closed.

Person self-service uses:

```text
GET /api/v1/collaborators/self/{journeyId}/work-credit-evidence
```

The client supplies the Journey ID only. The backend derives the Membership from the authenticated Tenant Actor and then resolves the Journey through the canonical Tenant + Membership Journey repository predicate.

The effective boundary is:

```text
authenticated Account
  -> exact current-Tenant Actor
  -> Actor Membership
  -> requested Journey belongs to current Tenant + Membership
  -> canonical work/accrual/ledger evidence for that Journey
```

A Person cannot use the endpoint to select another Membership and cannot read a Journey belonging to another Person or another Tenant.

Tenant Administrator access to Work and Credit Evidence is not introduced by this Bite.

## Evidence projection

### Work recognized

The projection reads canonical Work Period assignments belonging to the Journey and presents:

- Work Period/date/status;
- planned status;
- actual outcome;
- Sector, Location, and Task;
- Work Period Assignment provenance ID; and
- matching Gold Production input for the Work Period/Location when present.

### Compensation rule

The projection reuses the Journey's canonical compensation method and configured payment value. It does not derive or store another compensation rule.

### Earnings calculated

The projection reads canonical Accrual Items and their Accrual Runs for the Journey and presents:

- calculation type;
- direction;
- BRL and/or gold amount;
- accrual date and run status;
- pending reason when applicable; and
- Work Period/Assignment provenance identifiers.

### Current Account postings and corrections

The projection reads Journey-specific ledger entries, including inactive historical entries, so provenance remains visible after corrections.

It presents:

- entry type;
- credit/debit direction and signed amount;
- effective date;
- source type and source ID;
- correction type and related entry;
- correction reason text when present;
- receipt state when a receipt exists; and
- whether a historical posting has been made inactive.

The projection does not compute a new balance and does not alter the Current Account.

## Closed Journey behavior

The existing Current Account self-service permissions are intentionally tied to the active current Journey. Bite 32.3 therefore does not reuse those routes for historical Journeys.

`work_credit_evidence.self.read` instead follows the same history-preserving rule as `collaborators.self.read`, allowing a Person with only closed Journeys to continue reading the evidence attached to those Journeys.

The deterministic Brazilian demo fixture includes canonical closed-Journey evidence for Rafael Lima: recognized historical work, a posted daily-wage accrual, the corresponding earning credit, and a Journey payout that leaves the closed Journey at zero balance. This is fixture data, not evidence synthesized by the read projection.

## I18N

The feature ships simultaneously in:

```text
en-US
pt-BR
```

The Portuguese product label is:

```text
Demonstrativo de Trabalho e Crédito
```

Domain codes remain language-neutral in persistence and APIs. The UI translates known codes and uses locale-aware date, number, and BRL formatting.

## Non-goals

This Bite does not:

- create or edit Work Periods, assignments, production, accruals, ledger entries, receipts, or settlements;
- recalculate historical earnings;
- persist a duplicate evidence table;
- expose another Person's or another Tenant's evidence;
- add Tenant Administrator evidence access; or
- implement cross-Tenant delegated-role isolation — Bite 32.4.
