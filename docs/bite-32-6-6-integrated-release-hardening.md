# Bite 32.6.6 — Integrated E2E, Migration, I18N, Authorization, and Release Hardening

Bite 32.6.6 is the release-hardening delivery for the five prospect-demo enhancements in Bite 32.6.1–32.6.5. It adds no new business capability and no migration after `000077_journey_bonus_award_approval.up.sql`. Its purpose is to make the combined behavior a promotion requirement.

## Integrated browser coverage

`frontend/tests/e2e/bite32-6-release-hardening.spec.ts` verifies, in one Tenant Administrator browser path, Person photo management, governed Journey extension, Journey bonus awards, `TENANT_VIEWER`/`TENANT_ADMIN` role availability, and the Brazilian Portuguese presentation contract including the absence of legacy `Locatário` wording.

## Migration hardening

`backend/verify-migrated-db.sh` now verifies the complete Bite 32.6 schema through migration `000077`: the `TENANT_VIEWER` catalog entry, global Person photo storage, Journey extension table/indexes/immutability and closure guards, bonus award table/indexes/immutability/second-admin and closure guards, and the repaired legacy bonus ledger uniqueness rule.

## I18N and authorization hardening

`scripts/verify-bite326-release-coverage.py` requires exact en-US/pt-BR key parity and the 32.6 feature key families used by Entity Executive, Person photo, Journey extension, and Journey bonus surfaces. The release manifest also binds the mutating routes to their Tenant Administrator or self-service authorization contracts.

## Release gate

`make bite326-release-hardening-check` validates the manifest, i18n contract, migration verifier, and release wiring. The target runs in `make local-check`, feature CI, deployment quality gates, and the exact-revision deployed Playwright job. Production release-evidence regression checks fail if the Bite 32.6 contract is removed or incomplete.
