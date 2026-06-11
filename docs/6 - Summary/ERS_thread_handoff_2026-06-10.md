# Enterprise Remote Systems (ERS) — Thread Handoff Summary

**Date:** 2026-06-10  
**Project:** Enterprise Remote Systems (ERS)  
**Current repo zip for next thread:** `EnterpriseRemoteSystems-development(11).zip`  
**Current working branch flow:** `issue → development → test → production`

This summary is intended to start a new ChatGPT thread together with the current repo zip. Treat the attached repo zip as the source of truth for exact file contents.

---

## 1. Project Snapshot

ERS is a multi-environment application for managing People, Collaborators, Work Periods, Accruals, Current Accounts, Ledger Entries, Expenses, Journey Settlement, and Receipt obligations.

### Backend

- Go / Fiber v3
- SQLite + GORM
- SQL migrations under `backend/migrations`
- Backend routes under `backend/internal/http/routes`
- Current account / ledger / receipt functionality mostly under `backend/internal/currentaccounts`
- Project uses Go `1.26.2`

### Frontend

- React + Vite + TypeScript
- React Router
- React Query-style hooks
- Playwright E2E tests under `frontend/tests/e2e`
- Unit/integration tests via Vitest

### Deployment

- Environments:
  - `development`
  - `test`
  - `production`
- Server deployment uses Docker Compose and GitHub Actions.
- Environment container naming convention:
  - DEV: `ers-dev-*`
  - TST: `ers-tst-*`
  - PRD: `ers-prd-*`

### Promotion flow

Use this branch flow:

```text
issue → development → test → production
```

Typical promotion commands:

```bash
git status
git add backend frontend
git commit -m "<commit message>"
git push origin issue

git checkout development
git pull origin development
git merge issue
git push origin development

git checkout test
git pull origin test
git merge development
git push origin test

git checkout production
git pull origin production
git merge test
git push origin production
```

---

## 2. Important Working Conventions

### Patch format

All generated patches must be:

- project-root-relative;
- applicable from `/Users/rodrigosilveira/projects/EnterpriseRemoteSystems`;
- checked with `git apply --check` before being handed off;
- small enough to review and understand.

Correct patch application form:

```bash
git apply --check ~/Downloads/<patch>.patch
git apply ~/Downloads/<patch>.patch
```

Avoid patches relative to `backend/`, `frontend/`, or nested folders.

### Testing expectations

Before promotion, run:

```bash
cd backend
gofmt -w <changed go files>
go clean -testcache
go test ./...

cd ../frontend
npm ci
npm run check
npm run test:run
npm run test:e2e
```

When generating patches in the sandbox, be honest if Go tests cannot be run because Go `1.26.2` cannot be downloaded.

### E2E notes

- Playwright strict mode often requires `exact: true` for ambiguous headings/buttons/links.
- E2E tests should avoid relying on persistent first-page ordering when DEV/TST data is long-lived.
- Use unique descriptions/names with timestamps for test data.

---

## 3. Domain Rules Captured So Far

### People / Collaborators

- `Person` is tenant-scoped.
- Duplicate checks for CPF, RG, cellular, email, and PIX are scoped by tenant.
- Person nickname remains required.
- Person must be complete before creating a Collaborator.

### Current Account / Ledger

- Collaborator current accounts are represented by immutable ledger entries.
- Ledger entries are append-only.
- Corrections use reversal/replacement entries, not mutation/deletion.
- PIX remittance is a current-account/ledger transaction, not a normal expense.
- Gold-to-BRL conversion is separate from PIX remittance.

### Earnings / Accruals

- Collaborators may earn BRL or gold grams.
- GOLD_COMMISSION may be based on mine/well production percentage.
- Work Period accrual posting creates ledger entries.

### Replacement rules

For `SICK_DAY_OFF`:

- Original GOLD_COMMISSION collaborator earns full commission.
- Original pays configured fixed gold grams to replacement.
- Replacement earns normal `DAILY_BRL` for the assignment plus fixed gold transfer.

For `TIME_OFF`:

- Original keeps retained split.
- Replacement receives gold split only.
- Replacement does **not** earn normal `DAILY_BRL` for this assignment.

---

## 4. Receipt Obligation Requirement

Every deduction/debit from a collaborator current account must generate a receipt obligation for the collaborator to sign and return.

This applies to:

- expenses;
- BRL payouts;
- gold payouts / Zero Gold;
- replacement transfer debits;
- corrections that deduct value;
- journey-closing settlements.

A missing signed receipt must not mutate or delete ledger entries. It remains an operational/compliance outstanding item.

Receipt lifecycle statuses:

```text
PENDING_ISSUE
ISSUED
PRINTED
SIGNED
RETURNED
CANCELLED
```

---

## 5. Completed Receipt Bites

### Bite 17A — Receipt data model and migration

Added `LedgerReceipt` model and migration:

```text
backend/migrations/000019_create_ledger_receipts.up.sql
backend/migrations/000019_create_ledger_receipts.down.sql
```

Core properties:

- one receipt per ledger entry;
- tenant-scoped unique receipt number;
- foreign keys to tenant, collaborator journey, and ledger entry;
- receipt lifecycle fields: issued, printed, signed, returned, cancelled;
- document reference and notes fields.

### Bite 17B — Generate receipts for debit ledger entries

Added centralized GORM hook that creates a `PENDING_ISSUE` `LEDGER_DEBIT` receipt whenever a new `DEBIT` ledger entry is inserted.

Important behavior:

- credits do not create receipts;
- receipt creation happens in same DB transaction as ledger entry insert;
- duplicate protection via unique `ledger_entry_id`.

### Bite 17C — Printable receipt endpoint/UI

Added backend endpoints:

```text
GET  /api/v1/ledger-entries/:entryId/receipt
POST /api/v1/ledger-entries/:entryId/receipt/print
```

Added frontend route:

```text
/ledger-entries/:entryId/receipt
```

The printable page shows collaborator identity, CPF, ledger entry details, amount, receipt number/status, and signature lines.

### Bite 17D — Record signed and returned receipt

Added backend endpoint:

```text
POST /api/v1/ledger-entries/:entryId/receipt/return
```

Records:

- `status = RETURNED`
- `signed_at`
- `returned_at`
- `received_by`
- `signed_document_ref`
- `notes`

Frontend printable receipt page now includes a signed-return section.

### Bite 17E — Outstanding receipt tracking

Added backend endpoint:

```text
GET /api/v1/receipts/outstanding
```

Optional query params:

```text
status=PENDING_ISSUE | ISSUED | PRINTED | SIGNED
page=1
pageSize=50
```

Frontend route:

```text
/receipts/outstanding
```

Shows summary cards, filters, pagination, and links to printable receipts.

### Bite 17F — Backfill receipt obligations for existing debit ledger entries

Added backend endpoint:

```text
POST /api/v1/receipts/backfill-debit-ledger-entries
POST /api/v1/receipts/backfill-debit-ledger-entries?dryRun=true
```

Requires:

```text
X-Authorized-By
```

Behavior:

- scans historical `DEBIT` ledger entries;
- creates missing `PENDING_ISSUE` receipts;
- does not change ledger entries;
- does not create financial movements;
- idempotent.

Example DEV result after promotion:

```json
{
  "eligibleDebitEntries": 261,
  "existingReceipts": 261,
  "missingReceipts": 0,
  "createdReceipts": 0,
  "dryRun": false,
  "requestedBy": "dev-backfill"
}
```

This means all DEV debit ledger entries already had receipts.

### Bite 17F E2E addition

Added missing E2E coverage for outstanding receipt workflow.

Expected tested flow:

```text
create debit expense
confirm receipt appears outstanding
open printable receipt page
record signed return
confirm status becomes RETURNED
confirm receipt disappears from outstanding list
```

A locator fix was needed:

```ts
await expect(page.getByRole("heading", { name: "Receipt", exact: true })).toBeVisible();
```

---

## 6. Useful Operational Validation Commands

### Container health

```bash
docker inspect ers-dev-backend \
  --format 'Created={{.Created}} Status={{.State.Status}} Health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}'

docker exec ers-dev-backend \
  curl -i http://localhost:8080/api/v1/healthz
```

Use `ers-tst-backend` or `ers-prd-backend` for other environments.

### Confirm receipt migration/table

```bash
docker exec ers-prd-backend \
  sqlite3 -header -column /app/data/app.db '
SELECT filename
FROM schema_migrations
WHERE filename = "000019_create_ledger_receipts.up.sql";
'
```

```bash
docker exec ers-prd-backend \
  sqlite3 /app/data/app.db '.schema ledger_receipts'
```

### Receipt status breakdown

```bash
docker exec ers-dev-backend \
  sqlite3 -header -column /app/data/app.db '
SELECT status, COUNT(*) AS count
FROM ledger_receipts
GROUP BY status
ORDER BY status;
'
```

### Debit entries without receipts

```bash
docker exec ers-dev-backend \
  sqlite3 -header -column /app/data/app.db '
SELECT COUNT(*) AS debit_entries_without_receipts
FROM ledger_entries l
LEFT JOIN ledger_receipts r
  ON r.ledger_entry_id = l.id
WHERE l.direction = "DEBIT"
  AND r.id IS NULL;
'
```

Expected after Bite 17F backfill:

```text
0
```

### Backfill dry run

```bash
curl -i \
  -X POST \
  -H 'X-Authorized-By: dev-backfill-dry-run' \
  'https://dev.enterpriseremotesystems.com/api/v1/receipts/backfill-debit-ledger-entries?dryRun=true'
```

### Actual backfill

```bash
curl -i \
  -X POST \
  -H 'X-Authorized-By: dev-backfill' \
  'https://dev.enterpriseremotesystems.com/api/v1/receipts/backfill-debit-ledger-entries'
```

---

## 7. Go-Live Blocker: Robust Authorization

ERS must **not go live** before robust authorization is implemented.

Temporary shared-key/header safeguards are not enough for sensitive financial/accounting operations.

Sensitive operations include:

- receipt print;
- receipt return;
- receipt backfill;
- ledger corrections;
- settlement preview;
- Zero Gold;
- partial payout;
- close journey;
- any operation that writes financial ledger/accounting data.

Required direction:

- authenticated actor identity;
- tenant-scoped roles/permissions;
- auditable authorization decisions;
- no reliance on shared keys as the primary auth mechanism.

---

## 8. Recommended Next Work: Bite 18A

Next planned bite:

```text
Bite 18A: Authorization foundation for receipt operations
```

Recommended scope:

1. Add a new backend package:

```text
backend/internal/authz
```

2. Introduce:

```text
Actor
Permission
RequirePermission(...)
```

3. Initial permission constants:

```text
ledger.receipts.print
ledger.receipts.return
ledger.receipts.backfill
ledger.corrections.create
journey.settlements.preview
journey.settlements.zero_gold
journey.settlements.partial_payout
journey.settlements.close
```

4. For Bite 18A, apply the authorization foundation only to receipt operations:

```text
POST /api/v1/ledger-entries/:entryId/receipt/print
POST /api/v1/ledger-entries/:entryId/receipt/return
POST /api/v1/receipts/backfill-debit-ledger-entries
```

5. Keep current `X-Authorized-By` compatibility temporarily, but route it through centralized actor extraction instead of scattered ad hoc checks.

6. Add backend tests proving:

- missing actor is rejected;
- actor without permission is rejected;
- permitted actor succeeds;
- existing `X-Authorized-By` behavior remains compatible during transition.

Future bites can protect settlement operations, ledger corrections, and replace temporary header-based authorization with authenticated tenant-scoped users/roles.

---

## 9. Important Caution for Next Thread

The user has experienced patch omissions before. Before handing off any patch:

- inspect that all new files are included;
- run `git apply --check` against the exact attached repo zip baseline;
- run `git diff --check`;
- verify interface additions have concrete implementations;
- verify route additions are wired;
- verify DTO fields referenced by handlers/services exist;
- verify frontend routes/components/hooks/types all compile together;
- include E2E tests for operator-visible workflows.

---

## 10. Start-New-Thread Prompt

Suggested first message for the new thread:

```text
We are continuing work on Enterprise Remote Systems (ERS). Use the attached repo zip as the source of truth for exact file contents and use the attached markdown handoff summary for context.

We have completed and promoted receipt bites 17A–17F. The next work is Bite 18A: Authorization foundation for receipt operations.

Please generate a small project-root-relative backend-first patch that introduces a centralized authorization foundation and applies it only to receipt print, receipt return, and receipt backfill endpoints. Preserve temporary X-Authorized-By compatibility through centralized actor extraction, and add backend tests for missing/unauthorized/permitted actors.
```
