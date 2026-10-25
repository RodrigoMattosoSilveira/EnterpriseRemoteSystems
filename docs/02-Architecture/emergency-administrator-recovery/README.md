# ERS — Emergency Administrator Recovery

**Tracking issue:** #995 — Enterprise Remote Systems — Emergency Administrator Recovery\
**Workstream:** Post-Production requirements, architecture, and design (documentation only)\
**Status:** Phase 1 problem definition; implementation **not authorized**

## Purpose and boundary

This workspace develops the future controlled administrator recovery capability **without changing or delaying** the accepted Bite 33.6.7 two-human-administrator Production launch model. The existing Production backup, restore, and operational safety requirements remain in effect.

The agreed sequence is:

1. **Phase 1 — Accidental loss of both administrators' ERS credentials:** define, select, and validate controlled recovery of legitimate access.
2. **Phase 2 — Malicious or removed administrator:** address attempts to regain access after removal and stronger protections against abuse.
3. **Phase 3 — Infrastructure compromise:** address attackers controlling infrastructure, deployment, secrets, or recovery systems.

Prior branches `990` and `991` remain deferred historical implementations, not mandatory architectural starting points.

## Document map

| File | Purpose | Current status |
|---|---|---|
| [requirements.md](requirements.md) | Living requirements and initial problem definition; contains working specification v0.1 | **Exploratory draft** — review section statuses individually |
| [threat-model.md](threat-model.md) | Assets, trust assumptions, threat boundaries, failure scenarios | Not yet drafted |
| [architecture.md](architecture.md) | Alternatives, tradeoffs, boundaries, selected architecture | Not yet drafted |
| [detailed-design.md](detailed-design.md) | Components, protocol, operations, audit, fail-closed behavior | Not yet drafted |
| [acceptance-criteria.md](acceptance-criteria.md) | Test scenarios and objective acceptance evidence | Not yet drafted |
| [ADR-001-recovery-scope.md](ADR-001-recovery-scope.md) | Record the agreed incremental problem scope and rationale | Placeholder; not yet populated |
| [ADR-002-recovery-authority.md](ADR-002-recovery-authority.md) | Record recovery-authority alternatives and eventual decision | **OPEN** — no recovery authority selected |

The empty files were created in advance and are intentionally **not** evidence of approved requirements, designs, or decisions. The `requirements.md` working specification is the current source of truth for decision statuses.

## Working agreements

- Mark each material statement **AGREED**, **PROPOSED**, or **OPEN**, and document decision rationale.
- Do not convert an exploratory hypothesis into an approved security control without explicit review.
- Keep Issue #995 and its documentation branch independent of Bite 33.6.7 and its Production gates.
- Authorize implementation only after requirements, threat assumptions, an architecture decision, and acceptance criteria have been reviewed.

## Next discussion

Confirm the Phase 1 credential-loss boundary: do both administrators lose only their **ERS sign-in credentials**, while retaining authorized access to their individual **1Password** accounts and Production hosting/deployment infrastructure? This remains an **OPEN** working assumption (A-001) in [requirements.md](requirements.md).
