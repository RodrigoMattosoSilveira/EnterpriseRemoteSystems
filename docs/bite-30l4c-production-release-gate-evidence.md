# Bite 30L.4C — Production Release-Gate Evidence

Bite 30L.4C closes the final Bite 30L promotion requirement. Production may deploy only a source tree that has already completed the Test release-rehearsal path with immutable deployed-Playwright evidence, and a successful Production deployment emits its own immutable release-gate evidence artifact after public smoke passes.

## Exact Test evidence requirement

Production is gated by Git **tree SHA**, not merely by branch or commit ancestry. This allows normal promotion merges to create a different commit SHA while requiring the exact same source tree that passed Test.

The Test rehearsal marker for the Production tree must contain:

```text
tree_sha=<production tree SHA>
revision=<Test deployed revision>
deployed_playwright_evidence_sha256=<64-character SHA-256>
deployed_playwright_evidence_artifact=deployed-playwright-evidence-test-<Test revision>-<production tree SHA>-<run id>-<attempt>
```

The marker must also retain the verified rehearsal baseline SHA-256, migration boundaries, and UTC `passed_at` value. `scripts/verify-test-release-rehearsal-marker.py` validates all of these fields and rejects a marker whose Test artifact identity is not bound to the exact Test revision and Production source tree.

The gate is enforced twice: the GitHub deployment runner captures and verifies the marker before Production deployment begins, and the Production server checkout runs `make server-require-test-release-rehearsal` against the same source tree before the Production build/migration path proceeds.

## Production deployment evidence

Production does not run deployed Playwright. Instead, after all Production deployment checks and the public smoke gate succeed, the workflow writes:

```text
deployment-evidence/production-release-gate/production-release-gate-evidence.json
```

using `scripts/write-production-release-evidence.py`. The record binds:

- Production revision and tree SHA;
- the post-deployment server revision and tree SHA;
- the exact normalized Test release-rehearsal evidence;
- the exact Test deployed-Playwright artifact and SHA-256;
- Production database strategy;
- backend health verification;
- migrated-database verification;
- internal Caddy health verification;
- edge deployment;
- final Production public smoke success;
- GitHub workflow/run identity;
- immutable Production evidence artifact name;
- UTC verification time.

`scripts/verify-production-release-evidence.py` verifies the record before upload.

## Immutable Production artifact

A successful Production deployment uploads an artifact named:

```text
production-release-gate-evidence-<production revision>-<tree SHA>-<run id>-<attempt>
```

with `overwrite: false` and 365-day retention. The artifact contains both the Production evidence JSON and the normalized Test release-rehearsal evidence consumed by the gate. The Production evidence JSON SHA-256 is emitted in the workflow summary.

No Production evidence artifact is generated if the exact Test gate fails or if any Production deployment/public-smoke step fails.

## Local regression coverage

The deterministic local contract is:

```bash
make production-release-evidence-check
```

It verifies accepted exact-tree Test evidence, rejection of wrong-tree or malformed Test evidence, exact Production server source identity, final Production evidence generation/verification, workflow wiring, Makefile wiring, and coverage-manifest closure.

`make local-check` runs this target.

## Final Bite 30L.4 status

Requirement 13, `deployment verification in the promotion path`, is now covered. The coverage manifest contains no pending requirements, and:

```bash
make bite30l4-coverage-manifest-check
```

runs the manifest verifier with `--require-complete`. A valid 30L.4 tree therefore reports all `13/13` architecture requirements covered.
