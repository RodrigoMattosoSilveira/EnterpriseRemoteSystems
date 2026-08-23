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

The migration refuses to complete if any existing financial row cannot be
mapped exactly to a same-Tenant Person/Membership/Journey relationship.

## Write-time invariants

New Expense, Accrual Item, Ledger Entry, and Ledger Receipt rows must carry a
non-empty Person ID that agrees with their Tenant and retained Collaborator
Journey provenance.

Accrual Item, Ledger Entry, and Ledger Receipt financial identity is immutable
once written. Expense retains the existing supported update/reassignment
workflow; if an Expense is deliberately reassigned to another active
Collaborator Journey, its Person ownership changes atomically with its Journey
provenance and the ledger correction chain preserves the old and replacement
financial owners.

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

Expense-generated Ledger Entries, reversals, replacements, settlement Ledger
Entries, and correction Ledger Entries all preserve explicit Person + Tenant
ownership while retaining Collaborator Journey/source identifiers as
provenance.

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
The Current + Future Earnings projection uses this same Person + Tenant balance
as its starting balance, while unposted-ready and estimated-future earnings
remain scoped to the selected Journey because they describe that Journey's
operational provenance.

Settlement Preview, payout, zero-gold, and Journey closure intentionally remain
Journey-scoped lifecycle operations. They must not consume another Journey's
balance merely because both Journeys belong to the same Person.

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
