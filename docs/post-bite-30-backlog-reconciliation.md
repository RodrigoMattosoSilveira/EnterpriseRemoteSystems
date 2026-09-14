# Post-Bite-30 Backlog Reconciliation Against Production Baseline

Issue: **#853**

## Purpose

This document reconciles the GitHub backlog that was still open when issue #853 was created against the actual Bite 30 Production source tree. It does **not** reopen Bite 30 and it does **not** define Bite 31. Its purpose is to establish which older issues are already delivered, partially delivered, still open, obsolete, or superseded by Bite 30 before the next roadmap decision.

No GitHub issue state is changed by this patch. The `recommendedDisposition` field in the machine-readable manifest is advisory so issue closure can be reviewed deliberately. Because the scope is an immutable snapshot of issues that were open when #853 was created, issues closed afterward remain listed; #63 and #130 are now recorded as `OBSOLETE` based on the owner decisions that closed them.

## Production baseline

- Production commit: `e994c976d116cdd27cac0d9b2de95ef913d10983`
- Production Git tree: `7e5c70f986960e719174ce05aede8570a555ef65`
- Production promotion timestamp: `2026-09-14T18:49:31Z`
- Final Bite 30 migration: `000070_revoke_noncanonical_application_admin_grants.up.sql`
- Issue #853 source commit: `f53c5fbcb73501db837d031d03c0648ac7a97b25`
- Issue #853 source Git tree: `7e5c70f986960e719174ce05aede8570a555ef65`

The issue-853 source tree and the Production tree are identical. The reconciliation therefore evaluates the exact Production source contents even though the merge commit SHA differs. The later reconciliation-document commit (`3c6a5d0b5b69c97b1b0b7322a2d1427a795b1746`) intentionally differs from Production because it adds this backlog artifact; it does not change the Production baseline being evaluated.

Bite 30D (`#708 — Self-Service and Delegated Authorization Refactor`) is treated as completed baseline architecture: intrinsic self-service derives from identity, while Roles and Role Grants represent delegated authority.

## Classification result

| Status | Count | Meaning |
|---|---:|---|
| DONE | 11 | Production source implements the issue intent. |
| PARTIALLY DONE | 6 | Production implements a meaningful part, but the requested outcome is incomplete. |
| OPEN | 10 | The requested outcome is not implemented or still requires operational verification. |
| OBSOLETE | 4 | The product/architecture made the original question or proposed direction no longer applicable. |
| SUPERSEDED BY BITE 30 | 2 | Bite 30 replaced the issue's earlier model with the canonical Identity/Access architecture. |

## Issue-by-issue reconciliation

| Issue | Classification | Recommended disposition | Production finding |
|---:|---|---|---|
| #5 — next steps | **DONE** | Close as completed | The original architecture-to-code checklist is fully represented in the Production tree: GORM-backed database access, SQL migrations, Fiber HTTP routes, and a React router/page application all exist. |
| #9 — React page/route skeleton | **DONE** | Close as completed | The frontend has a production route graph covering People, Collaborators, Expenses, Work Periods, receipts, and administration pages. |
| #11 — Service Layer Validation Roles To be enforced | **PARTIALLY DONE** | Keep open | Several bundled rules are enforced (for example one open Collaborator Journey per Membership and pending commission accrual when production is missing), but other original rules such as the 30-day return wait and max-sick-day enforcement are still only configuration/documented intent rather than complete executable policy. |
| #15 — implement the environment files logic | **DONE** | Close as completed | Repository-owned environment initialization/rendering and per-environment server configuration are implemented and used by deployment tooling. |
| #16 — Add E2E tests for Person | **DONE** | Close as completed | People E2E coverage exists for create, filter/pagination, view switching, required-field validation, duplicate CPF, and cellular validation. |
| #17 — Add a filter to Person list | **DONE** | Close as completed | The People landing page has live search plus status/profile/collaborator-eligibility filters and card/list views. |
| #19 — Implement person tests for front end | **DONE** | Close as completed | Frontend unit coverage exists for People list/detail/form behavior in addition to E2E coverage. |
| #20 — Add Authentication and Authorization | **SUPERSEDED BY BITE 30** | Close as not planned / obsolete | The original JWT/header-era proposal is no longer the architecture. Production uses login-backed sessions plus canonical Authentication Account -> AccountActor -> exact Actor/Tenant authorization; Bite 30D explicitly separates intrinsic self-service authority from delegated Role Grants, and later Bite 30 slices harden session, Tenant-selection, and isolation boundaries. |
| #22 — Refactor to a cloud first architecture | **OBSOLETE** | Close as not planned / obsolete | The issue specifies a Google Cloud/Terraform target, while the actual Production baseline is Docker Compose on a Hetzner-hosted server behind Caddy and SQLite. Relevant contract/database follow-ups survive as separate backlog issues; the original umbrella direction is no longer the deployed architecture. |
| #26 — Wiring this spec into your Go/React projects | **PARTIALLY DONE** | Keep open | OpenAPI contracts and generated Go/TypeScript artifacts exist, but the original api/spec/full.yaml-as-single-contract/runtime-generated-client wiring is not the current implementation and generated types are not the sole runtime boundary. |
| #28 — Abstract the DB driver config | **OPEN** | Keep open | Production database opening is SQLite-specific; there is no runtime DB_DRIVER switch or PostgreSQL GORM driver abstraction. |
| #59 — Implement and validate the People update flow | **DONE** | Close as completed | People update is implemented with backend validation/uniqueness handling and frontend detail/edit tests. |
| #60 — Design and implement a safe bulk-import | **DONE** | Close as completed | A People CSV importer, CLI command, dry-run Make target, validation tests, and all-or-nothing import behavior are present. |
| #63 — Marinaldo Brito missing RG | **OBSOLETE** | Close as not planned / obsolete | The named Person record is not present as an actionable Production record, so there is no RG correction to perform. The issue was closed after the owner confirmed that the record had been removed/not added; it no longer represents an outstanding Production-data defect. |
| #69 — A few person use cases | **DONE** | Close as completed | The People UI supports search/filtering, Active/Inactive-style status filters, card/list presentation, and navigation from a displayed Person to the full Person record. |
| #128 — There is no reference data for Periodo | **OPEN** | Keep open | The canonical reference-data seed has no Diurno/Noturno (day/night period) reference type; Work Period naming remains shift-like rather than backed by the requested reference data. |
| #130 — I, as an application user, when adding avperson's recoerd, if the nicknameis blank, I want the app to use the person's first name | **OBSOLETE** | Close as not planned / obsolete | Production intentionally continues to require an explicit Person nickname on create and update. After reviewing the implemented behavior, the product decision is to preserve that model and learn from operational use before reconsidering Person naming semantics; automatic `nickname = firstName` defaulting is therefore not planned. |
| #151 — Should we allow Editing expenese | **OBSOLETE** | Close as not planned / obsolete | The product has made the safer decision: incorrect Expenses are not edited in place in the UI; they are cancelled with an auditable reversal and recreated as a replacement. The original open-ended design question is therefore obsolete. |
| #181 — Use nickname in the Work Plan Inform Form | **PARTIALLY DONE** | Keep open | The Inform workflow now exposes collaborator nickname, including absence warnings and printed roster rows, but printed roster rows still render full name first and nickname second rather than using nickname as the primary displayed identity. |
| #291 — Write an e2e test to validate pending receipts | **DONE** | Close as completed | The requested exact lifecycle is covered: create debit receipt, confirm outstanding, open printable receipt, return with signed reference, and confirm it disappears from outstanding receipts. |
| #304 — Implement I18N infrastructure | **OPEN** | Keep open | The frontend has no i18next/react-i18next dependency or localization bootstrap. The parent i18n initiative remains open. |
| #409 — Integrate real authentication | **DONE** | Close as completed | Production has first-party login-backed authentication accounts, hashed session tokens, HTTP-only session cookies, password change/reset, session revocation, account deactivation/reactivation, and E2E login coverage. |
| #621 — Bite-621 i18n Implementation - common | **OPEN** | Keep open | No common localization framework is present in the Production frontend. |
| #622 — Bite: i18n Implementation - people | **OPEN** | Keep open | People UI strings remain hard-coded English and there is no localization runtime to supply translated People resources. |
| #623 — Bite: i18n Implementation - planning | **OPEN** | Keep open | Planning UI strings remain hard-coded English and there is no localization runtime. |
| #624 — Bite: i18n Implementation - expenses | **OPEN** | Keep open | Expense UI strings remain hard-coded English and there is no localization runtime. |
| #625 — Bite: i18n Implementation - receipts | **OPEN** | Keep open | Receipt UI strings remain hard-coded English and there is no localization runtime. |
| #838 — [Use Case]: Backend database should be changed to postgresql from sqllite, for better peformance. | **OPEN** | Keep open | The Production database implementation is still SQLite and no PostgreSQL driver is present. |
| #840 — [Use Case]: Production database backup should be backed up periodically - daily/weekly | **PARTIALLY DONE** | Keep open | Production deployments take and verify a pre-migration SQLite backup, and backup targets/scripts exist, but the repository does not install or enforce a periodic daily/weekly Production backup schedule. |
| #841 — [Use Case]: IP Address of logged in user has to be stored in db table. multi device tracking. | **PARTIALLY DONE** | Keep open | Authentication sessions already persist IP address and User-Agent, but there is no durable device identity, device authorization workflow, or access restriction to authorized devices. |
| #842 — [Use Case]: Need to define our application users, and to quantify for our SAAS license purpose. | **PARTIALLY DONE** | Keep open | Bite 30 establishes a canonical Authentication Account/AccountActor identity and sessions can represent multiple devices, providing a sound user-counting foundation. There is still no SaaS license metric, concurrent-device policy, shared-credential prevention control, or usage-report implementation. |
| #843 — [Use Case]: Our product supports multi-tenancy- we need to introduce SAAS license management module | **OPEN** | Keep open | There is no SaaS license, renewal, subscription, or tenant usage-report module in the Production application. |
| #844 — [Use Case]: ERS - Multi tenancy | **SUPERSEDED BY BITE 30** | Close as completed | Bite 30 replaced the issue's early tenant_id/policy concept with the canonical AccountActor/Membership model and comprehensive cross-Tenant authorization, identity, operational-domain, and financial-isolation coverage. |

## Suggested backlog cleanup

After reviewing this reconciliation, issues classified `DONE`, `OBSOLETE`, or `SUPERSEDED BY BITE 30` can be closed with a short comment pointing to this Production-baseline reconciliation. Issues classified `PARTIALLY DONE` or `OPEN` should remain available for roadmap prioritization.

Issues recommended for closure: #5, #9, #15, #16, #17, #19, #20, #22, #59, #60, #63, #69, #130, #151, #291, #409, #844.

Issues recommended to remain open: #11, #26, #28, #128, #181, #304, #621, #622, #623, #624, #625, #838, #840, #841, #842, #843.

## Important findings for future roadmap planning

- **Required nickname behavior is intentionally preserved (#130).** Production still requires an explicit nickname; the automatic `nickname = firstName` proposal is now obsolete unless future Production experience justifies reopening the design decision.
- **The Marinaldo Brito RG item is no longer actionable (#63).** The named Person record is not present, so there is no Production record to correct.
- **PostgreSQL remains genuinely open (#28/#838).** The Production database driver is SQLite-only.
- **Periodic Production backups are only partial (#840).** Pre-deployment verified backups are strong, but periodic daily/weekly scheduling is not repository-enforced.
- **Device/IP security is only partial (#841).** Sessions capture IP/User-Agent, but device authorization does not exist.
- **i18n remains open (#304/#621–#625).** No localization runtime is installed.
- **The old cloud-first/GCP umbrella (#22) is obsolete.** The actual Production deployment is the server/Docker/Caddy architecture; future infrastructure work should be scoped from that baseline rather than the old GCP plan.
- **The early multi-tenancy issue (#844) is superseded by Bite 30.** Future Tenant work must build on AccountActor/Membership/Tenant isolation rather than the original generic tenant-id proposal.

## Machine-readable contract

The authoritative snapshot is `docs/post-bite-30-backlog-reconciliation.json`. It records the Production/tree identity, the exact captured issue set, classification vocabulary, rationale, recommended disposition, and repository evidence for every classification.

Run:

```bash
make post-bite30-backlog-reconciliation-check
```

The check is also part of `make local-check` and validates that the snapshot is structurally complete and that every referenced Production evidence marker still exists in the source tree.

## Bite 31 boundary

This reconciliation deliberately does **not** select or name Bite 31. Bite 31 should be chosen only after the remaining `OPEN` and `PARTIALLY DONE` items are reviewed for business value, Production risk, dependency order, and implementation size.
