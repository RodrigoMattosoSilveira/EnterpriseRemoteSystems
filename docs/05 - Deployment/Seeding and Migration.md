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
