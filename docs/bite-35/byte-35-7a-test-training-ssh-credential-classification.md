# ERS — Bite 35.7A: Test/Training SSH credential classification and scope comparison

**Purpose:** Resolve the contradiction observed on 2026-11-23: the normal GitHub Test deployment authenticated successfully, while the Training SSH diagnostic failed to parse the apparently shared repository-level `DEPLOY_SSH_PRIVATE_KEY`. This is **not** a Training deployment and is not a credential-rotation procedure.

**Patch baseline:** `1120-bite-357a-trn-activation` / `5a2ba37ce148169a6be415f61d225f1a66027a6a` (committed HEAD ZIP).

**Authoritative prior evidence:** Test workflow run `45277556255` passed remote preflight/deployment on 2026-11-23; Training diagnostic run `45279892623` reported that both key materializations failed OpenSSH parsing. Those two results do **not** establish that the Test job authenticated using the same key file, or that the key is encrypted.

## Safety and evidence rules

- Work in the existing LOCAL-MAC ERS checkout; no additional worktrees and no database reset.
- The new workflow is manual (`workflow_dispatch`), gated to `test`, runs separate `test` and `training` environment jobs, and uses only `contents: read` permission.
- The workflow reads the effective GitHub `DEPLOY_SSH_PRIVATE_KEY` value **in each environment**. There is no SSH connection, `ssh-keyscan`, server command, deployment, Docker invocation, database access, secret replacement, or 1Password token lookup.
- One per-run random comparison key is used to create two HMAC tags. Those tags are transmitted through GitHub job outputs to a comparison job, **not printed**, and are not reusable across runs. They are not raw secret values or public-key fingerprints. GitHub Actions outputs are available to its workflow infrastructure; this is a deliberately limited, ephemeral comparison mechanism, not a private vault.
- Encrypted keys are classified by their **declared OpenSSH/PEM envelope metadata**; no passphrase is requested and no assertion is made that encrypted ciphertext is valid.
- Nonencrypted keys must also pass real `ssh-keygen -y -P ''` when run in GitHub. Failures are explicitly distinguished from declared encryption.
- Save the normal run URL, classification codes, MATCH result and reviewer evidence. Do **not** save, paste, or reveal private keys, SSH public-key fingerprints, HMAC tags, comparison nonce, environment dumps, or runner scratch files. Do not enable step debug or `set -x`.

## MT-SCOPE-01 — LOCAL application and focused verification

**Identity/location:** Developer / Release Operator, LOCAL-MAC Terminal, existing ERS repository root containing `Makefile`.

1. Download the exact patch into `~/Downloads`.
2. Check that the working tree is clean and HEAD is the exact supplied baseline before applying any changes:

   ```bash
   git switch 1120-bite-357a-trn-activation
   git status --short
   BASE=5a2ba37ce148169a6be415f61d225f1a66027a6a
   test "$(git rev-parse HEAD)" = "$BASE" || { echo 'BLOCKED: Wrong committed HEAD'; exit 2; }
   test -f Makefile || { echo 'BLOCKED: Not in ERS root'; exit 2; }
   ```

   **PASS:** Correct branch and baseline, with no unrelated local changes. **BLOCKED:** Any mismatch; do not reset/clean to force a match.

3. Apply the patch:

   ```bash
   PATCH=~/Downloads/1120-5a2ba37c-test-training-ssh-credential-classification.patch
   test -f "$PATCH" || { echo 'BLOCKED: Patch unavailable'; exit 2; }
   git apply --check "$PATCH"
   git apply "$PATCH"
   echo 'PASS: Patch applied'
   ```

4. Verify the new test suite, existing TRN tests, and source whitespace:

   ```bash
   python3 -B scripts/test-ers-ssh-credential-classify.py
   python3 -B scripts/test-trn-environment.py
   git diff --check
   make local-check
   ```

   **PASS:** All new tests pass (a real OpenSSH generation test may explicitly SKIP if the executable is unavailable), existing TRN tests pass, `git diff --check` passes, and canonical `make local-check` passes. **FAIL:** Any genuine test failure. **BLOCKED:** Required tooling unavailable. Tests do not create containers or touch the working LOCAL database; only the ordinary `make local-check` suite uses its established cleanup conventions.

5. Review `git diff --stat` and `git status --short`; commit **only the intended files** after all tests pass. Keep the exact new commit SHA and the matching new HEAD ZIP.

## MT-SCOPE-02 — Normal promotion (not Training)

**Identity/location:** Release Operator in GitHub web, independent reviewers where already required by environment protection.

1. Push the new feature commit and confirm GitHub feature CI passes on that SHA.
2. Merge along the established non-deploying branch hierarchy: `1120` → `1119` → `1031`.
3. Proceed with ordinary authorized `1031` → `development` and then `development` → `test` promotion. **These two branch merges trigger real DEV/TST deployments**; follow their existing release safeguards, acceptance evidence, and authorization requirements. Do not use a feature SHA as the deployable Test SHA.
4. Verify the new workflow file `.github/workflows/compare-ssh-credential-scopes.yml` exists on the latest approved `test` branch.
5. Confirm the normal Test deployment and release rehearsal have succeeded before dispatching the new diagnostic. Do not run any full Training deployment.

**PASS:** Workflow on approved Test source; DEV/TST required gates passed. **BLOCKED:** Any deployment/approval/source mismatch. **FAIL:** An unsafe or unauthorized change occurs.

## MT-SCOPE-03 — Execute one read-only environment-scope comparison

**Identity/location:** Release Operator in GitHub web; the **independent human reviewer** required for protected `training` approval. The `test` environment may have its own protection requirements; honor them as configured.

1. Open **GitHub → EnterpriseRemoteSystems → Actions**.
2. Select **Diagnose ERS SSH credential scope (Test vs Training; read-only)**.
3. Select **Run workflow** with branch `test` and enter the exact confirmation text:

   ```text
   COMPARE-ERS-SSH-SCOPES-ONLY
   ```

4. Where GitHub prompts for environment approval, obtain approval through the established human-authorized process. **No bypass or self-approval.**
5. Open the single run and record the result of these jobs: `prepare`, `inspect-test`, `inspect-training`, `compare`.
6. Copy **only** the classification code lines, `MATCH=YES` or `MATCH=NO`, and the `PASS`/`BLOCKED` message from the `compare` job, together with the run URL. Do not copy other expanded logs or secret material.

**PASS:** Both key envelopes are identified as passphrase-free and loadable with real OpenSSH, and `MATCH=YES`. **BLOCKED:** Either credential is encrypted, malformed, wrong type, or differs between environments; missing approvals and output propagation failures also block. **FAIL:** An unsafe server/credential mutation or disclosure occurs.

## MT-SCOPE-04 — Exact result interpretation

| Result | Established fact | Next decision (no automatic change) |
|---|---|---|
| `MATCH=NO` | Test and Training receive different secret bytes for this run | Investigate GitHub secret inheritance/scope and named inputs; do **not** overwrite working repository secrets |
| `MATCH=YES` plus `OPENSSH_ENCRYPTED_DECLARED` or `PEM_ENCRYPTED_DECLARED` | Same credential declares encryption | Investigate Test's successful authentication identity/agent mechanism. Do not remove passphrase or rotate keys blindly |
| `MATCH=YES` plus `ESCAPED_LINE_BREAKS` | Same credential contains literal backslash-n formatting rather than real multiline structure | Reconcile against securely retained authorized source; preserve original secret pending evidence |
| `MATCH=YES` plus `UNRECOGNIZED_OR_MALFORMED` | The supplied bytes are not a complete recognized key container | Investigate source custody and any formatting/transcription; no replacement without approval |
| `MATCH=YES` plus `OPENSSH_UNENCRYPTED_VALID` or `PEM_UNENCRYPTED_VALID` | Same bytes load in both environments using real `ssh-keygen` | Inspect differences in full deployment authentication, target/user/known-hosts without assuming successful application deployment |
| `KEYGEN_UNAVAILABLE` | Runner cannot execute the required local verifier | Repair the diagnostic runtime/tool availability, not the key |
| `MISSING` / `WRONG_TYPE_*` | Missing or wrong credential type | Correct custody/scope under separate authorized secret-management procedure |
| `UNENCRYPTED_UNREADABLE` | Key envelope declares no encryption but OpenSSH still cannot load it | Investigate malformed inner key or unsupported format; not a proven passphrase problem |

**Critical distinction:** The old GitHub job used `ssh -i` without `IdentitiesOnly=yes` or `IdentityAgent=none`; therefore Test success alone did not prove the chosen private key was parseable. This comparison deliberately performs **no SSH login** to avoid adding another uncertain variable.

## Glossary impact

**None.** No ERS Person, Entidade/Tenant, authorization, or financial-domain terminology changes.
