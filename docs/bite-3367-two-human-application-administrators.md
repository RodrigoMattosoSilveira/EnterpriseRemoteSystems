# Bite 33.6.7 — Documentation Index (Compatibility Reference)

**This file is a navigation-only pointer, not a manual acceptance procedure or Production operational runbook.**

The former combined document at this path mixed implementation, LOCAL/CI and Test verification, Production enrollment, and administrator acceptance. To avoid confusion, it has been separated into **three** authoritative, consistently titled documents:

| Purpose | Canonical document |
|---|---|
| Understand implementation, architecture, security boundaries, and glossary | [Bite 33.6.7 — Implementation and Architecture](bite-3367/implementation-and-architecture.md) |
| Execute **LOCAL/deployed Test** MT-00–MT-11 with environment variables, screenshots/evidence, and cleanup | [Bite 33.6.7 — Manual Acceptance Test Suite](bite-3367/manual-acceptance-tests.md) |
| Obtain change approval and execute **actual Production** enrollment, safeguards, recovery and sign-off | [Bite 33.6.7 — Production Operational Runbook](bite-3367/production-operational-runbook.md) |

**Do not use this index as an executable procedure.** No software or database changes are introduced by the documentation reorganization. The documentation-review input ZIP was committed at `072a5628eab19bf8d496bc653d7c4a38e25dfc3a` on branch `994-bite-3367-two-human-administrators`; after this documentation patch is committed, record the new commit SHA for actual release evidence.
