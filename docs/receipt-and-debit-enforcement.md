# Receipt and Debit Enforcement

Bite 27C closes the runtime enforcement loop for collaborator Current Account debits.

## Rule

Every debit ledger entry in a collaborator Current Account must have exactly one ledger receipt obligation.

A receipt obligation starts as `PENDING_ISSUE` and remains outstanding until the signed receipt is returned. The outstanding receipt workbench includes receipts in these statuses:

- `PENDING_ISSUE`
- `ISSUED`
- `PRINTED`
- `SIGNED`

Returned receipts are no longer outstanding. Cancelled receipts are excluded from the outstanding workbench but should be treated as an exception that requires follow-up before production go-live.

## Runtime enforcement

The `LedgerEntry` GORM hook creates a receipt obligation for every new debit ledger entry inside the same database transaction as the debit.

Current Account repositories now also verify receipt coverage before committing debit-producing Current Account operations:

- ledger correction reversals or replacements that create a debit;
- zero-gold settlements;
- partial payouts;
- journey close settlements.

If a debit is created without exactly one receipt obligation, the transaction fails with:

```text
ErrDebitReceiptObligationMissing
```

This is a defense-in-depth check. It prevents a future debit workflow from silently bypassing receipt creation even if it uses the repository transaction paths.

## Historical repair

Historical or manually inserted debit entries may still lack receipts, especially if they were inserted with SQL or with GORM hooks disabled. Use the existing backfill operation to identify and repair those rows:

```http
POST /api/v1/receipts/backfill-debit-ledger-entries?dryRun=true
POST /api/v1/receipts/backfill-debit-ledger-entries
```

The backfill operation requires authorization, recent reauthentication, a correction reason, and second-person approval when that policy is enabled.

## Settlement closure

Journey close settlement preview blocks closing a collaborator journey while outstanding receipts remain. This preserves the existing rule that a collaborator should not complete the journey close workflow while prior debit receipt obligations still require action.

## Expense receipt acceptance mode

Expense debit receipts (`LEDGER_DEBIT` with source `EXPENSE` or `EXPENSE_REPLACEMENT`) can be closed in two ways: electronically by the collaborator (`POST /ledger-entries/:entryId/receipt/accept`), or on paper by the operator (`POST /ledger-entries/:entryId/receipt/return` with a signed-document reference). The tenant chooses which paths are allowed.

The setting is a `reference_data` row per tenant:

- `type = RECEIPT_ACCEPTANCE_MODE`
- `code = EXPENSE_DEBIT`
- `metadata_json = {"mode": "BOTH" | "PAPER_ONLY" | "ELECTRONIC_ONLY"}`

A tenant with no row behaves as `BOTH`. Migration `000081` seeds `BOTH` for existing tenants.

- `BOTH`: both paths are open.
- `PAPER_ONLY`: electronic acceptance is refused with `receipt_acceptance_conflict`.
- `ELECTRONIC_ONLY`: paper return is refused with `receipt_return_mode_blocked`.

Acceptance requires the receipt to be `ISSUED`, `PRINTED`, or `SIGNED`. Each acceptance records the client IP and user agent on the receipt (`accepted_ip`, `accepted_user_agent`), and writes an authorization audit row (`ledger_receipts.accept`). The IP and user agent come from the transport layer, never from the request body.

Changing the mode applies immediately to open receipts too. No receipt is stranded: whichever path the tenant currently allows can still close it. Final-settlement receipts are unaffected and remain electronic-only.
