# Bite 30G.1 — Zero-Balance Closure Invariant

## Purpose

Bite 30G.1 makes a zero Journey balance a hard prerequisite for closing a
Collaborator Journey.

Person + Tenant remains the enduring owner of financial history. A Collaborator
Journey remains the provenance and lifecycle context for the transactions that
occurred during that collaboration period. Those two concepts do not mean that
an unsettled balance may move from one Journey into a later Journey.

## Hard invariant

For every value unit represented by active Ledger Entries for a Journey:

```text
SUM(CREDIT) - SUM(DEBIT) = 0
```

must already be true before that Journey may transition to `FINISHED` or receive
`closed_at`.

BRL and GOLD_GRAM are evaluated independently. They are never netted against
one another.

Consequently:

```text
Journey A1
  -> financial activity
  -> settlement/payment activity
  -> BRL balance = 0
  -> Gold balance = 0
  -> all other close blockers clear
  -> close

Journey A2
  -> starts with its own zero Journey balance
```

Historical Ledger Entries from A1 remain visible in the Person + Tenant Current
Account and retain A1 as provenance.

## Close Journey responsibility

`CloseJourney` is now a lifecycle operation only.

It does not:

- create a payout Ledger Entry;
- create a repayment Ledger Entry;
- zero BRL automatically;
- zero gold automatically;
- transfer a prior Journey balance into a later Journey.

The close operation records its existing `CLOSE_JOURNEY` audit settlement row
with zero BRL/gold amounts and marks the Journey `FINISHED` only after Settlement
Preview reports no blockers.

## Settlement Preview

Any non-zero Journey balance, positive or negative, adds:

```text
NON_ZERO_BALANCE
```

as a close blocker.

The existing blockers remain in force:

```text
JOURNEY_ALREADY_CLOSED
PENDING_ACCRUALS
OUTSTANDING_RECEIPTS
```

Positive/negative settlement workflows are handled separately; 30G.1 only
establishes the invariant that they must complete before closure.

## Database enforcement

Migration `000058_zero_balance_journey_closure_invariant`:

1. refuses to apply if an already-closed Journey has a non-zero active Ledger
   balance in any value unit; and
2. installs `trg_collaborator_journey_zero_balance_close`, which rejects direct
   updates that attempt to close or finish a non-zero Journey.

The migration deliberately does not invent historical settlement transactions.
Existing inconsistent data must be repaired explicitly before promotion.

## Projection semantics

Current + Future Earnings uses the selected Journey's own current balance.
Person + Tenant remains the owner of the complete financial history, but prior
Journey balances are not carried into a later Journey's projection.
