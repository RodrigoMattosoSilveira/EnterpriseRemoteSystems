# Bite 35 — Mineração Carará Production Go-Live: accepted scope

**Status:** Bite 35.1 baseline and scope freeze. **Origin:** `development` at `9ecd5b075d08ec19c1f368690e95bc621b984fb1`. The operator observed `origin/development` and `origin/test` had identical tracked contents (`git diff --quiet` exit 0); their HEAD commits were distinct. This observation is historical and must not be represented as a current CI or deployment result.

The machine-checked scope ledger is [`launch-baseline.json`](launch-baseline.json). This document explains business decisions; it does **not** represent completed feature acceptance, a Production deployment approval, or an override of existing security gates. The last accepted `development` starting point deliberately excludes the unaccepted 33.6.8D/E experimental work.

## One goal and seven bounded sub-bites

| Bite | Deliverable | Acceptance boundary |
|---|---|---|
| 35.1 | Record stable baseline and freeze launch scope | Documentation + offline invariant check; no infrastructure change |
| 35.2 (former 34.1) | Brazilian Portuguese translation completion | All customer-facing flows translated; `en-US`/`pt-BR` parity |
| 35.3 (former 34.3) | Actual work Sector/Location override | Preserve informed assignment and calculate compensation from it; a new same-code plan carries forward prior performed work (actual overrides with informed fallback) for WORKED outcomes |
| 35.4 (former 34.2) | Functional and Operational readiness and training | Brazilian Portuguese UI-first customer manual; separately explicit technical operations |
| 35.5 | Guarded Production database initialization | Test rehearsal then protected Production initialization; People/Journeys and signed historical BRL/Gold `OPENING_BALANCE` CSV import, checksum-bound approval, dry run, duplicate protection, ledger reconciliation |
| 35.6 | Human administrator and runbooks | Named Application Administrator through controlled enrollment, 1Password-only custody, application and usable database recovery procedures |
| 35.7 | Six launch gates and controlled Production activation | Actual measured evidence, authorization, first tenant pilot; do not infer PASS from local or CI results |

**Opening-balance rule:** Historical amounts owed **to** and **by** Collaborators are not bonuses. New Journeys start at zero; approved separately classified ledger entries establish positive or negative BRL and GOLD_GRAM opening positions. No self-approval bypass or direct database balance alteration.

**Training split:** Functional readiness never demands SQL, APIs, Docker or Git from customers; Operational readiness includes those tools where appropriate with executable commands, precise actor, environment, expected outputs, STOP and cleanup criteria.

## Freeze and exceptions

Allowed before launch: fixes that directly satisfy a listed Bite 35 deliverable or one of the six minimum safety gates. Everything else becomes a post-launch proposal. Record any launch-scope exception in a reviewed change record with rationale and effect on customer activation; do not silently append a new sub-bite, weaken an existing safeguard or claim a non-executed check passed.

### Deferred, not accepted or erased

- **34.5:** Work Period Assignment Summary.
- **34.4:** Assignment Notification and Collaborator Acceptance.
- **33.6.6+:** Additional emergency recovery hardening.
- **33.6.8E/F:** Advanced shared-bucket access isolation and expanded acceptance. The experimental branch is not in the accepted starting commit; no S3 policy is authorized by Bite 35.1.

Current Hetzner observations: project `ERS Backups`, bucket `ers`, existing `ers-backups/production/` backup objects, versioning enabled, Object Lock enabled, Governance default 30 days, no lifecycle configuration and no bucket policy in the observed checks. The actual deployed Test/Development `.env` files inspected previously had no S3 backup configuration. Those observations are not evidence of a live Production restore or enforced environment isolation.

## Six Minimum Safe Launch Gates

1. **Release integrity:** accepted SHA, LOCAL and CI checks, deployed smoke.
2. **Security:** HTTPS, authentication, role boundaries, tenant isolation, named administrator.
3. **Data preservation:** safeguarded reset/initialization; migrations/deployment cannot silently replace real data.
4. **Backup and restore:** a real verified off-host backup and isolated recovery, never on the live DB.
5. **Operational continuity:** scheduled backups, visible failures, documented retention/recovery owner.
6. **Administrator recovery:** named human account and actually tested emergency access.

A gate is **BLOCKED**, not passed, until actual evidence exists. No changes to deployed infrastructure or Production database are part of 35.1. Keep production guards and existing automated tests intact. Do not assert the older two-human criterion passed when only one human is available; 35.7 must explicitly resolve or authorize residual risk before activation, without faking signoff.

## Promotion

Create successive leaf branches from the latest accepted Bite 35 parent, supply committed HEAD ZIP and exact SHA, validate, and merge each into parent. Parent promotion follows the established deployment process; never use an unfinished feature branch for direct Production deployment. Verify the current revision, migrations, data preservation, real backup and restore, and human authorization at the final cutover.

For **35.1-only manual acceptance**, follow [`manual-acceptance-tests.md`](manual-acceptance-tests.md). For existing deployed recovery procedures, the authoritative historical reference remains `docs/bite-3368/manual-acceptance-tests.md` until explicitly revised in Bite 35.6/35.7.

## Byte 35.2 translation implementation notes

The frontend keeps `en-US` and `pt-BR` as the only supported locales. Financial administration, authorization, support-access, reference-data, and login-shell static copy is moved into the typed locale resources. The local CI check `make byte352-i18n-check` enforces matching keys and interpolation placeholders and rejects new static JSX/attribute text outside an explicit list of stable identifiers and units. These automated checks **do not** establish translation completeness for dynamic API/error messages or all conditional UI branches; B35.2-02 through -05 in the canonical manual are required before declaring this bite complete. No ledger, authorization, or deployment behavior should change as part of translation.

## Byte 35.4 training and operational readiness deliverables

- **Customer (Brazilian Portuguese, UI-only):** [Manual completo de treinamento e operação da Entidade](byte-35-4-manual-da-entidade-pt-br.md). This covers identity/context, People/Journeys, planning, informed versus actual work, accrual, expenses, receipts and financial evidence; it never requires customer SQL, Git or infrastructure operations.
- **Authorized technical operators:** [Technical Tenant Operational Readiness](byte-35-4-operational-readiness.md), with environment ownership, daily checks, backup and isolated recovery evidence, incident STOP/escalation, and teardown.
- **Independent acceptance:** [Byte 35.4 manual acceptance](byte-35-4-manual-acceptance.md), [redacted evidence template](byte-35-4-readiness-evidence.template.json), and [offline coverage contract](byte-35-4-readiness-contract.json). `make byte354-readiness-check` validates document sections, navigation references and fail-closed placeholders, **not** operational pass or launch authorization.
- **35.4C fictitious training records in existing non-Production databases (not Production initialization):** [additive, idempotent provisioning guide](byte-35-4c-training-database.md) and [UI-first acceptance T01–T10](byte-35-4c-manual-acceptance.md). Provisioning explicitly targets the existing LOCAL, Development or Test `app.db`; no reset, replacement or migration is performed. `make byte354c-training-check` exercises migrated disposable test databases, never operational data. This does not change the 35.5 opening-balance gate or certify 35.7 launch readiness.

- **35.5 Production initialization software (acceptance not yet complete):** [guarded migration, signed historical OPENING_BALANCE import, and technical runbook](byte-35-5-production-database-initialization.md), plus [manual Test-first T01–T10 acceptance](byte-35-5-manual-acceptance.md). The implementation reuses existing deployment migrations and administrative UI. No live Production initialization, real-data import, or 35.7 launch gate is implied by delivering code and offline regressions.

**35.6 administrator and recovery custody:** [Technical operator runbook](byte-35-6-administrator-and-recovery-runbook.md) and [manual acceptance T01–T09](byte-35-6-manual-acceptance.md). The canonical recovery manifest, preflight and recovery runbook now use 1Password locators, replacing the historical LastPass contract. Automated tests validate the *locator policy*, not the existence of vault items, access by two independent actual humans, or an isolated off-host recovery. Those Production gates remain **BLOCKED** pending direct observation and signed authorization; no code change may manufacture human evidence.
