# Bite 28A-1 — Tenant Data Integrity and Seed Refactor

Bite 28A-1 closes the tenant provisioning gap left by the initial tenant-management workflow. A tenant is now created together with the baseline data required to begin configuration, and database guards prevent records or relationships from being moved across tenant boundaries.

## Tenant provisioning

`db.SeedTenantData` is the single tenant-scoped seed catalog. It provisions:

- person and collaborator statuses;
- payment methods;
- sector, location, and task planning values;
- expense categories and value units;
- starter canteen and administrative price-list items.

Tenant creation and seed provisioning run in one database transaction. If provisioning fails, the tenant row is rolled back.

Startup retains the historic `SeedReferenceData` entry point and now enumerates every existing tenant. Non-default tenants receive the complete catalog, including inactive tenants that may later be reactivated. The default tenant preserves its established reference-data IDs; its planning and starter price-list rows remain migration-owned by `000035` and `000031`.

## Non-destructive seed rules

Seed matching uses tenant-scoped natural keys:

- reference data: `tenant_id + type + code`;
- price-list data: `tenant_id + item_type + code`.

Existing records are not renamed, reactivated, repriced, or otherwise overwritten. Seed execution is idempotent and only supplies missing baseline records. New seed IDs include the tenant ID so records from different tenants cannot collide.

## Migration 000041 integrity rules

`000041_tenant_data_integrity_and_seed_refactor` adds database enforcement for:

- case-insensitive tenant-code uniqueness;
- uppercase normalized tenant codes;
- immutable tenant IDs;
- valid tenant IDs on tenant-owned records;
- immutable `tenant_id` ownership after record creation;
- application authorization grants scoped only to `*`;
- tenant/self authorization grants scoped only to a real tenant;
- same-tenant relationships for People, Collaborator Journeys, Expenses, Ledger Entries, Receipts, Work Period Assignments, production, accruals, and settlements.

Tenant hard-deletion remains prohibited by migration `000040`.

## Scope boundary

This bite protects and provisions tenant data. It does not replace the temporary request actor headers or complete login-backed tenant selection. Authentication and session-derived tenant context remain Bite 28B and Bite 28C work.
