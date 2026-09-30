# Bite 32.7 — Tenant People CSV Export and Test-to-Production Portability

## Purpose

Provide a controlled way to move a prospect Tenant's People from Test to Production without copying environment-specific database identity or unrelated operational records.

## Export contract

A Tenant Administrator can use **People → Export CSV**. `GET /api/v1/people/export.csv` exports only People having a Membership in the acting Tenant and returns the exact canonical column order consumed by `import-people`.

The CSV contains Person identity/contact, address, bank/PIX, emergency-contact data, Membership `statusId`, and Membership notes. It deliberately excludes Person IDs, Membership IDs, Tenant IDs, Actor/Account identity, roles, photos, Journeys, Current Account/ledger data, expenses, and other operational evidence.

Because the file contains sensitive personal and banking data, export is restricted to `TENANT_ADMIN`, uses `Cache-Control: no-store`, and should be handled as sensitive data. Do not commit exported CSV files to Git.

## Test → Production procedure

1. In Test, sign in as the prospect Tenant's Tenant Administrator and export People CSV.
2. Review the file and keep it in controlled temporary storage.
3. Back up Production before import.
4. Copy the CSV to the Production backend host/container using the established People import runbook.
5. Run `import-people` with the Production Tenant ID and `-dry-run` first.
6. Proceed only with zero errors and the expected validated-row count.
7. Run the real import and verify the People in the Production UI.
8. Delete temporary CSV copies after verification.

The importer and exporter share one code-level canonical header contract. Automated round-trip coverage verifies an ERS export is accepted by the importer dry-run.
