- Runtime schema creation is owned by SQL migrations.
- Seed functions only insert/update seed data.
- GORM AutoMigrate is allowed only in tests/helper databases.
- DEV/TST/PRD must never run GORM AutoMigrate at API startup.

## Environment migration policy

- Development deployment replaces its disposable SQLite database from the complete current migration chain.
- Test deployment normally preserves its database and applies migrations in place.
- A Test release rehearsal explicitly restores a known pre-release baseline, then exercises the same in-place migration path used by Production.
- Production preserves its database and may deploy only a source tree that has a successful Test release-rehearsal marker.
- Local `go test ./...` and `make migration-check` exercise migration fixtures before any deployed rehearsal.

See `docs/05 - Deployment/Database Promotion Strategy.md`.

## Test promotion and release rehearsal

A push to the `test` branch is a release promotion, so deployment automatically runs the Test release rehearsal rather than treating the accumulated Test database as the release baseline. The rehearsal restores `/opt/EnterpriseRemoteSystems/test/rehearsal-baselines/pre-bite30h.db`, migrates it in place through the current release, and runs deployed Playwright.

If the baseline does not exist, `server-test-rehearsal-ensure-baseline` builds a deterministic pre-30H baseline from repository migrations through `000061_expand_final_settlement_database_checks.up.sql`. An existing captured baseline is never overwritten. Manual `workflow_dispatch` may still request an ordinary Test redeploy with release rehearsal disabled.
