# Bite 30G.2 — Bidirectional Final Settlement + Direction-Aware Receipts

## Purpose

Bite 30G.2 supplies the explicit payment workflows required to satisfy the
Bite 30G.1 zero-balance closure invariant. `CloseJourney` remains a lifecycle
operation only; it does not settle money or gold.

A final settlement is Journey-scoped. BRL and GOLD_GRAM are settled
independently and are never netted or silently converted.

## Settlement directions

### Tenant owes Collaborator

For every positive Journey balance, the Tenant Administrator may post a
`FINAL_TENANT_PAYMENT` settlement. The server derives the entire currently
positive balance; the caller cannot choose an arbitrary final amount.

The resulting Ledger Entry is:

```text
Entry Type: FINAL_SETTLEMENT
Source Type: JOURNEY_SETTLEMENT
Direction: DEBIT
Receipt Purpose: FINAL_SETTLEMENT_TENANT_PAYMENT
Payment Direction: TENANT_TO_COLLABORATOR
Accepting Party: COLLABORATOR
```

The payment brings only positive value-unit balances toward zero. The
Collaborator must accept each generated receipt in-app before the Journey may
close.

### Collaborator owes Tenant

For every negative Journey balance, the Tenant Administrator may record a
`FINAL_COLLABORATOR_PAYMENT` settlement after receiving the Collaborator's
payment. The server derives the entire currently negative balance and posts its
magnitude as a CREDIT.

The resulting Ledger Entry is:

```text
Entry Type: FINAL_SETTLEMENT
Source Type: JOURNEY_SETTLEMENT
Direction: CREDIT
Receipt Purpose: FINAL_SETTLEMENT_COLLABORATOR_PAYMENT
Payment Direction: COLLABORATOR_TO_TENANT
Accepting Party: TENANT
```

The Tenant Administrator must accept each generated Tenant-side receipt in-app
before the Journey may close.

A Journey with positive and negative balances in different value units may
require both settlement directions. Neither operation settles a balance whose
sign belongs to the opposite direction.

## Direction-aware receipt acceptance

Final-settlement receipts are completed through explicit in-app acceptance;
they do not use the legacy print/sign/return workflow.

For Tenant-to-Collaborator receipts:

```text
authenticated current Collaborator
  -> own Journey receipt only
  -> ledger.receipts.self.accept
```

For Collaborator-to-Tenant receipts:

```text
Tenant Administrator in the same Tenant
  -> ledger.receipts.tenant.accept
```

No new authorization Role is introduced.

Acceptance records:

```text
accepted_at
accepted_by
acceptance_method = IN_APP
```

The existing `RETURNED` receipt status and signed/returned compatibility fields
remain populated as the terminal compatibility representation during staged
migration. Canonical 30G.2 semantics are carried by `receipt_purpose`,
`payment_direction`, `accepting_party`, and the acceptance fields.

Once accepted, the acceptance identity/time/method and receipt direction are
immutable.

## Atomic payment + receipt invariant

Every Ledger Entry with:

```text
entry_type = FINAL_SETTLEMENT
source_type = JOURNEY_SETTLEMENT
```

must have exactly one receipt in the same transaction. Failure to create that
receipt rolls back the settlement posting.

Ordinary DEBIT receipt behavior remains unchanged. Ordinary CREDIT Ledger
Entries do not gain receipts merely because 30G.2 introduces Tenant-side final
settlement receipts.

## Journey closure

Posting a final settlement can make the Journey balance zero, but the Journey
is not immediately closable. Settlement Preview continues to block closure
while the resulting receipts remain outstanding:

```text
balance = zero
+ outstanding final-settlement receipt
-> OUTSTANDING_RECEIPTS
-> cannot close
```

After every required receipt is accepted and the other 30G.1 blockers are
clear, `CloseJourney` may transition the Journey to FINISHED.

## Database migration

Migration `000059_bidirectional_final_settlement_receipts` adds canonical
receipt direction and acceptance metadata, authorization permissions, and
SQLite guards that enforce:

- valid purpose/direction/accepting-party combinations;
- complete acceptance metadata;
- immutable receipt direction;
- immutable acceptance after acceptance.

The migration does not introduce a new Role.
