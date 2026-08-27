# Bite 30G — Person + Tenant Financial Ownership Refactor

## Purpose

Bite 30G makes **Global Person + Tenant** the enduring owner of Expense,
Earnings/Accrual, Ledger Entry, and Ledger Receipt financial history.

Collaborator Journey references remain as provenance: they identify the
operational collaboration lifecycle that produced a financial event, but a
Journey is no longer the enduring owner of that event.

## Canonical financial relationship

```text
Global Person + Tenant
  -> Expense history
  -> Accrual/Earning history
  -> Ledger Entry history
  -> Ledger Receipt history

Collaborator Journey
  -> retained provenance on each financial record
```

A Person may have multiple historical Collaborator Journeys in the same Tenant.
All of those Journeys contribute to the same Person Current Account for that
Tenant. Closing a Journey does not hide or transfer the Person's financial
history.

## Database ownership

Migration `000057_person_tenant_financial_ownership` adds canonical
`person_id` ownership to:

- `expenses`;
- `accrual_items`;
- `ledger_entries`;
- `ledger_receipts`.

Existing rows are backfilled through the Bite 30F relationship:

```text
financial row
  -> collaborator_journeys.collaborator_id
  -> collaborator_journeys.membership_id
  -> person_tenant_memberships.person_id
  -> global_people.id
```

Ledger Receipt ownership is backfilled from its Ledger Entry so the receipt and
entry cannot diverge.

Migration `000060_expense_cancellation_recreation` adds explicit Expense
correction audit fields (`cancelled_at`, `cancelled_by`,
`cancellation_reason`) plus `recreated_from_expense_id`. Database guards require
a recreation source to be a cancelled Expense in the same Tenant and permit at
most one direct replacement for each cancelled source.

The migration refuses to complete if any existing financial row cannot be
mapped exactly to a same-Tenant Person/Membership/Journey relationship.

## Write-time invariants

New Expense, Accrual Item, Ledger Entry, and Ledger Receipt rows must carry a
non-empty Person ID that agrees with their Tenant and retained Collaborator
Journey provenance.

Accrual Item, Ledger Entry, and Ledger Receipt financial identity is immutable
once written. Incorrect Expenses are corrected through an explicit
**cancel-and-recreate** workflow rather than by changing the business meaning of
the original record in the UI. A Tenant Administrator cancels the incorrect
Expense with a required reason; ERS preserves that Expense as historical,
reverses its current financial posting, cancels any still-open receipt
obligation, and opens a replacement Expense prefilled from the cancelled data.
The replacement is a new Expense with its own canonical Person + Tenant
ownership, Collaborator Journey provenance, Ledger Entry, and receipt
obligation. `recreated_from_expense_id` links the replacement to its cancelled
source for auditability. Expense Operators may create Expenses but do not have
the Tenant-Administrator correction authority (`expenses.update`).

Journey provenance remains required during the staged cutover. Bite 30J owns
removal of obsolete Collaborator-as-owner compatibility constraints after all
runtime paths have migrated.

## Earnings and Expenses

Expense creation resolves the selected active Collaborator Journey to its
Person–Tenant Membership and persists the Membership's canonical global Person
ID as `expenses.person_id`.

Accrual calculation resolves every Work Period Assignment's Collaborator
Journey to its Membership and persists the canonical Person ID on each
`accrual_items` row. Posting the Accrual Item carries the same Person ID to the
resulting Ledger Entry. Accrual Run, Work Period, Assignment, production, value
unit, and posting repository operations are all scoped by the request's selected
Tenant; the accrual subsystem does not fall back to the legacy default Tenant
for authenticated Tenant operations.

Expense-generated Ledger Entries, cancellation reversals, replacement Expense
Ledger Entries, settlement Ledger Entries, and correction Ledger Entries all
preserve explicit Person + Tenant ownership while retaining Collaborator
Journey/source identifiers as provenance. Cancelling an Expense never deletes
or rewrites the original debit. If its receipt has not reached terminal
`RETURNED` status, the receipt is marked `CANCELLED` with the same correction
audit reason; a returned receipt remains immutable historical evidence.

## Current Account

The operational Current Account route remains reachable from a Collaborator
Journey for compatibility, but the Journey now supplies **context**, not
financial ownership.

The service resolves:

```text
selected Collaborator Journey
  -> Person–Tenant Membership
  -> Global Person ID
```

and then lists/balances Ledger Entries by:

```text
tenant_id + person_id
```

Consequently, the Current Account in one Tenant includes financial history from
all of that Person's historical Journeys in that Tenant. Each Ledger Entry
still exposes its `collaboratorId` so the originating Journey remains traceable.
The Person + Tenant Current Account preserves the full financial history across
Journeys. The Current + Future Earnings projection, however, uses the selected
Journey's own balance as its starting balance. A later Journey never inherits a
prior Journey's unsettled balance.

Settlement Preview, payout, zero-gold, and Journey closure intentionally remain
Journey-scoped lifecycle operations. They must not consume another Journey's
balance merely because both Journeys belong to the same Person. Bite 30G.1 adds
the stronger invariant that every Journey must independently reach zero in each
value unit before it can close.

## Account-level Person self-service

Authentication self-service now reads Current Account history directly through:

```text
Authentication Account
  -> Global Person
  -> Ledger Entry person_id + tenant_id
```

It no longer needs an active or historical Collaborator Journey, an ACTIVE
Membership, or an ACTIVE Tenant Actor to discover the Person's own financial
history. Tenant provenance is retained on every balance and entry.

## Tenant isolation

Person ownership does not weaken Tenant boundaries. Tenant-operational Current
Account queries always require both:

```text
person_id = canonical Global Person ID
tenant_id = selected Tenant ID
```

A Tenant operator therefore cannot use a shared Global Person identity to read
financial history belonging to another Tenant.

## Deferred

Bite 30G does not remove the retained `collaborator_id` provenance columns or
legacy Journey compatibility foreign keys. Final compatibility-schema removal
and final foreign-key hardening remain Bite 30J responsibilities.
