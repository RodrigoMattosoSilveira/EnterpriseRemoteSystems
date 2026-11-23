# Bite 35.7A — Training SSH diagnostic-only gate

**Purpose:** Diagnose why Training SSH authentication failed with `error in libcrypto` while the ordinary Test deployment successfully authenticated to the same approved Hetzner server. **This is not a deployment procedure.**

## Source and controls

- Feature baseline requested: `1120-bite-357a-trn-activation` at `6171505aa4b64ccbc7ff23c860ee4c76ac1b88db`.
- Existing Test deploy uses repository-scoped `DEPLOY_SSH_PRIVATE_KEY` and succeeded on 2026-11-23.
- GitHub `training` and `test` do not have environment-scoped values for `DEPLOY_SSH_PRIVATE_KEY`, per operator read-only inventory. Therefore the repository secret is the expected effective value in both environments.
- No credential rotation, new SSH key, 1Password vault edit, Production action, or full TRN deployment is authorized by this diagnostic.
- GitHub masks secret values. No private key or 1Password token should be pasted into a ticket or conversation.

## MT-DIAG-01 — Offline source verification (LOCAL-MAC, Developer)

1. Open **LOCAL-MAC Terminal** in the existing ERS repository directory that actually contains `Makefile` (do not use another worktree). Download the patch to `~/Downloads`.
2. Run this complete block from the ERS repository root:

   ```bash
   (
     set -euo pipefail
     test -f Makefile || { echo "BLOCKED: Not in ERS repository root"; exit 2; }
     git switch 1120-bite-357a-trn-activation
     BASE=6171505aa4b64ccbc7ff23c860ee4c76ac1b88db
     ACTUAL="$(git rev-parse HEAD)"
     test "$ACTUAL" = "$BASE" || { echo "BLOCKED: Incorrect SHA: $ACTUAL"; exit 2; }
     echo "PASS: Baseline SHA ($ACTUAL)"

     PATCH=~/Downloads/1120-6171505a-trn-read-only-ssh-diagnostic.patch
     test -f "$PATCH" || { echo "BLOCKED: Patch missing: $PATCH"; exit 2; }
     git apply --check "$PATCH"
     echo "PASS: git apply --check"
     git apply "$PATCH"
     echo "PASS: Patch applied"

     python3 -B scripts/test-trn-ssh-diagnostic.py
     git add -N \
       .github/workflows/diagnose-training-ssh.yml \
       scripts/ers-trn-ssh-diagnostic.sh \
       scripts/test-trn-ssh-diagnostic.py \
       docs/bite-35/byte-35-7a-training-ssh-diagnostic.md
     git diff --check
     make local-check
     echo "PASS: Focused tests, diff check and canonical local-check"
   )
   ```

3. Review the four new files, commit them normally after all checks pass, and preserve the resulting new full SHA and committed HEAD ZIP for the next promotion step.

**PASS:** 12 offline tests pass, `git diff --check` and canonical `make local-check` pass. **FAIL:** any test fails. **BLOCKED:** baseline mismatch or tests unavailable. Do not reset LOCAL database. No Docker containers are created by these new tests.

## MT-DIAG-02 — Promote the diagnostic (GitHub, release operator)

1. Commit the patch and pass ordinary feature CI.
2. Follow the established **Development → Test** promotion process. Do not run a Training deployment or bypass any release approval.
3. The diagnostic workflow must be present in the repository default branch (`development`) to appear for manual dispatch, and present on `test` to execute there.
4. Under **Actions**, select **Diagnose ERS Training SSH (read-only)**, then **Run workflow**.
5. Select branch `test` and enter the confirmation string `DIAGNOSE-TRAINING-SSH-ONLY`.
6. The protected `training` environment requires the separately authorized human reviewer; do not self-approve or bypass safeguards.

**PASS:** The independent workflow executes its one diagnostic job in `training`. **BLOCKED:** absent workflow, branch not approved, or unavailable reviewer. **FAIL:** any unexpected deployment or server-side change. Capture the GitHub run URL and final status in the private evidence record.

## MT-DIAG-03 — Evaluate the three read-only diagnostic stages

In the `training-ssh-diagnostic` job open **Diagnose SSH only (no deployment or remote writes)**.

| Output | Interpretation and next action |
| --- | --- |
| `BLOCKED: ... service-account token` | Wrong credential type supplied; inspect scope, not the secret value in logs |
| `BLOCKED: ... cannot be parsed` | Effective GitHub secret is not usable as a passphrase-free SSH private key; stop and reconcile scope against Test |
| `PASS: Effective Training private key parses...` | Runner successfully loaded the effective key |
| `BLOCKED: ... no pinned entry` | Correct the independently verified host pin, not the private key |
| `PASS: Training host has a known_hosts entry...` | Entry exists; provenance still must be checked through approved console evidence |
| `BLOCKED: Read-only SSH login failed...` | Key parses but authentication, pinned host trust, or network login failed; investigate without server changes |
| `PASS: Noninteractive, pinned, read-only SSH authentication succeeded...` | Training key and SSH login work; the deployment error needs reevaluation against the successful run and the exact failing workflow revision |

**PASS:** Diagnostic finishes successfully and both parse and remote authentication stages report PASS. **BLOCKED:** Any required check cannot be demonstrated. **FAIL:** any observed unsafe action. The remote command is exactly `true` and prints no server data. This does not establish backup, health, migration, or TRN deployment acceptance.

## MT-DIAG-04 — Next decision

- If the private-key validation fails, retain the shared repository secret unchanged. Verify the actual effective secret scope with GitHub settings and investigate why the two workflows differ. Do not use a speculative private-key rotation.
- If the key parses but login fails, review authorized host-key evidence, deployment account public-key authorization, and network settings through existing access. Do not alter `authorized_keys` merely to make the test pass.
- If the read-only login succeeds, we have evidence to revisit the deployment workflow with a targeted change. A successful diagnostic **does not authorize a full TRN deploy**. A new approved Test revision, preserved data, rehearsal evidence, and a separate human deployment approval remain necessary.

## Glossary impact

**None.** The diagnostic changes no ERS identity, domain, financial, or customer-facing terminology.
