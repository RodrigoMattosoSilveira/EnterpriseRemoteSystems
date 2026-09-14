# Bite 30L.4B — Deployed Development/Test Verification Evidence

Bite 30L.4B turns deployed Playwright verification for Development and Test into source-bound release evidence rather than a transient workflow result.

## Required environments

Every Development and Test deployment must run deployed Playwright. Manual dispatch may no longer disable deployed Playwright for those environments. Production remains excluded from deployed Playwright and is handled by the separate 30L.4C production release gate.

## Immutable source identity

The deployment job resolves both the immutable Git commit SHA and Git tree SHA before deployment. The server checkout is verified against both values. The deployed Playwright job then checks out the same commit and independently requires both:

```text
checked-out revision == deployed revision
checked-out tree SHA == deployed tree SHA
```

A successful verification therefore binds the browser suite to the exact source tree deployed to the environment.

## Machine-readable evidence record

After `npx playwright test` succeeds, the workflow writes:

```text
deployment-evidence/deployed-playwright-verification.json
```

using `scripts/write-deployed-playwright-evidence.py`. The record contains:

- schema version and Bite identifier;
- `passed` verification status;
- Development or Test environment;
- exact HTTPS base URL;
- deployed revision and tree SHA;
- checked-out revision and tree SHA;
- GitHub repository, ref, workflow, run ID, attempt, and run URL;
- Test release-rehearsal flag;
- deployed Playwright runtime contract (`session` auth and skipped local web server);
- immutable evidence, HTML report, and test-results artifact names;
- UTC verification timestamp.

`scripts/verify-deployed-playwright-evidence.py` immediately verifies the record against the exact environment, revision, tree SHA, and evidence artifact name before upload.

## Evidence artifacts

The GitHub Actions artifact names include:

```text
environment
revision
tree SHA
workflow run ID
workflow run attempt
```

and `actions/upload-artifact` is configured with `overwrite: false`. The evidence JSON is uploaded with `if-no-files-found: error` and a 90-day retention period. Playwright HTML reports and test-results artifacts use the same immutable source/run identity in their names.

The evidence file's SHA-256 digest is emitted by the deployed Playwright job.

## Test release rehearsal binding

When a Test deployment is a release rehearsal, the successful rehearsal marker records both:

```text
deployed_playwright_evidence_sha256=<sha256>
deployed_playwright_evidence_artifact=<artifact-name>
```

alongside the existing revision/tree and migration evidence. 30L.4C consumes and verifies this exact Test evidence binding before Production deployment.

## Local verification

The generator/verifier contract has a deterministic local regression target:

```bash
make deployed-playwright-evidence-check
```

It verifies successful Test and Development evidence generation, exact revision/tree verification, and rejection of tree mismatches. `make local-check` runs this target.

## 30L.4 status after 30L.4C

30L.4C consumes this Test evidence in the Production release gate and emits immutable Production deployment/smoke evidence. The final coverage manifest therefore closes requirement 13 with all 13 architecture requirements covered.
