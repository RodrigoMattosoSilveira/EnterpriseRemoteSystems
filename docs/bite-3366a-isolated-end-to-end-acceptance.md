# Bite 33.6.6A — Isolated emergency administrator recovery acceptance

**Status: NOT ACCEPTED UNTIL EXECUTED WITH A REAL, APPROVED, VERIFIED PRODUCTION-BACKUP COPY AND SIGNED EVIDENCE.**

This document is an executable operator procedure, not a claim of having rehearsed live Production. Neither CI nor a synthetic fixture is evidence of human approval, actual S3 recovery access, or successful restoration of a real Production backup.

## Safety and responsibility

- Execute this on an **authorized, encrypted, access-restricted rehearsal machine**, **not** on the live Production host or live Production SQLite database. The rehearsal uses `APP_ENV` **unset or non-Production**. It does not run `issue` from the Production CLI; the separate runner temporarily substitutes *only* the Production-host offline/root-metadata gates while processing a **scratch** SQLite database. The real Production `issue` implementation remains Production-root-only.
- Have the latest **approved Production backup** and its manifest and matching Hetzner S3 receipt available as **read-only files**. Obtain explicit approval for copying personal/financial Production data to this protected isolated machine. Neither the source file nor an original restored backup is ever the write target.
- Keep the S3 credential source outside the rehearsal workspace. Never upload backup files, owner private keys, reset tokens, `.env.production`, or signing credentials into chat, source control, CI, or test logs.
- The runner verifies that the backup is no more than **24 hours old by default**, checks its SHA-256/SQLite integrity, calls the actual Bite 33.4 restore tool, and **independently runs Bite 33.3 S3 `verify-replica`** against the exact remote VersionIds. The S3 API must be reachable and credentials must be available for that read-only operation.
- This does not transfer or prove legal control of private keys. The two real owner attestations must be independently witnessed, checked against enrolled public-key fingerprints, and retained outside the source repository. *Two distinct keys alone do not prove two distinct human operators.*
- The runner produces a temporary private workspace containing a Production-derived database and a short-lived reset token. `finish` destroys the workspace in both PASS and FAIL cases; preserve only the restricted redacted JSON report and approved human custody evidence. If `prepare` succeeds but `finish` cannot begin, destroy that workspace manually after recording the failure.
- No persistent Docker containers are created by the new runner. Existing `run-backup-go-tool.sh` uses `docker compose run --rm` in deployed mode. Record `docker ps` before and after; clean up only ERS test-created containers, never unrelated containers.

## Gate A — Confirm source and local validation

**Actor:** ERS engineer, LOCAL development checkout. **Context:** branch `990-bite-3366a-production-application-administrator-emergency-access-recovery`.

1. Run the following commands separately:

   ```bash
   git branch --show-current
   git rev-parse HEAD
   git status --short
   make emergency-admin-recovery-check
   make promotion-readiness-check
   make local-check
   ```

2. Compare the SHA from `git rev-parse HEAD` to the **new commit created after applying the OpenSSL configuration patch**. Do not reuse baseline `b851db9df90b4a15dd54eddaf8911625aafac5ff` after committing changes. Confirm CI is green for **the same commit**, not just the branch name.

   **Expected:** all commands exit `0`, the worktree is clean, `ERS_VALIDATION emergency-admin-recovery-check PASS`, `ERS_VALIDATION promotion-readiness-check PASS`, and `ERS_VALIDATION local-check PASS` are observed, and required CI jobs succeed against the same SHA.

   **PASS:** Exact-SHA match and all four gates evidenced. **BLOCKED:** missing result, nonzero exit, dirty tree, or mismatched CI SHA.

## Gate B — Standardized containerized verifier and protected launcher

**Actor:** authorized ERS recovery operator on a Docker-enabled LOCAL Mac or
Linux recovery workstation. **No Production credentials, private signing keys,
or Production database are needed for this gate.** Gate B.1–B.3 are described
in `docs/bite-3366a-gate-b-container-recovery.md`.

The macOS Homebrew OpenSSL compatibility check is no longer required to
satisfy the **privileged** verifier requirement: Gate B.4 runs the **same**
`host-check --require-privileged-safe-path` inside the root-controlled Linux
container and validates real Ed25519 signatures. Gate B.5 checks that a locked
image is launched without network, mounts, capabilities, or host Docker socket,
and that its temporary container is removed. Refer to the **Gate B.4 and B.5**
sections of that runbook for the sole commands, evidence markers, and
promotion-blocking conditions.

**Gate B overall PASS:** reviewed immutable base digest; B.2 real Docker
smoke and cleanup; B.3 local/CI for the *updated* source SHA; B.4 locked-image
build and in-container cryptography; B.5 launcher policy and offline regression.
Record the lock's image ID, platform, source SHA, verifier markers, and operator
UTC timestamp; never require a temporary B.2 image-ID file. Do not treat any
of these as authorization to access Production data.

**Production-use boundary:** A separate protected Linux root-host check can
verify the approved launcher/lock before an authorized real-world operation.
The container's read-only verifier is **not** a credential issuer; Production
writer integration, verified backup and owner approvals remain separate
acceptance requirements. The isolated `finish` rehearsal may still use a
configured non-privileged OpenSSL for local signatures; it must never skip
cryptographic verification.

## Gate C — Independent human custody attestation

**Gate C Docker owner-enrollment procedure:** `docs/bite-3366a-gate-c-owner-enrollment.md` (the canonical, tested local path for the two owner keys and public-key enrollment). The commands below define the original evidence contract and are not a substitute for that procedure; do not attempt to use macOS host-privileged OpenSSL for LOCAL key enrollment.

**Actors:** Owner A, Owner B (two distinct real authorized people), and designated independent witness(es). **No shared private signing key**.

1. Locate the pre-enrolled public keys corresponding to the logical slots `owner-a` and `owner-b`. Do **not** send private keys. Independently compute each fingerprint on the recovery operator's trusted computer:

   ```bash
   set -o pipefail
   "$ERS_RECOVERY_OPENSSL_BIN" pkey -pubin -in /PATH/TO/TRUST/owner-a.pem -outform DER | shasum -a 256
   "$ERS_RECOVERY_OPENSSL_BIN" pkey -pubin -in /PATH/TO/TRUST/owner-b.pem -outform DER | shasum -a 256
   ```

   **Expected:** both commands exit `0`, output a 64-character lowercase hexadecimal SHA-256 and the digests **differ**. Record each digest, never any private key.

2. An authorized witness must meet each owner separately and document identity, control of their own signing device, where the private key is retained, that the key is inaccessible to the other owner, and that neither key has been placed on the Production host. Create a **restricted, mode-0600** JSON record outside the repository with this exact structure (replace all illustrative strings and fingerprints):

   ```json
   {
     "slots": {
       "owner-a": {
         "person_id": "IDENTITY-OF-HUMAN-A",
         "witness_id": "INDEPENDENT-WITNESS",
         "custody_method": "PERSONALLY-VERIFIED-DEVICE-AND-ACCESS",
         "attested_at": "2026-10-17T16:00:00Z",
         "public_key_sha256": "PASTE-64-LOWERCASE-HEX-CHARACTERS",
         "owner_controls_private_key": true,
         "private_key_excluded_from_production_host": true
       },
       "owner-b": {
         "person_id": "IDENTITY-OF-DIFFERENT-HUMAN-B",
         "witness_id": "INDEPENDENT-WITNESS",
         "custody_method": "PERSONALLY-VERIFIED-DEVICE-AND-ACCESS",
         "attested_at": "2026-10-17T16:00:00Z",
         "public_key_sha256": "PASTE-DIFFERENT-64-LOWERCASE-HEX-CHARACTERS",
         "owner_controls_private_key": true,
         "private_key_excluded_from_production_host": true
       }
     }
   }
   ```

   Use a **current UTC `attested_at`** (the values above are examples, not valid evidence for another date). The witness must not be either of the two recovery owners. Store approved real-world identity evidence in the restricted incident record, not the test output. The runner only validates the structure, distinct identifiers, timestamps, and fingerprint matches; a human approver must independently accept the truthfulness of each attestation.

   **PASS:** both distinct human custodians independently attested; their keys match the distinct trusted public-key fingerprints; no owner can retrieve the other's private key. **BLOCKED:** missing attestations, owner overlap, disputed key custody, or reliance on the unavailable administrator to obtain either key.

## Gate D — Verified backup, live S3 receipt, and scratch restore

**Actor:** authorized backup/recovery operator on the isolated rehearsal machine.

1. Verify that your three already approved backup artifacts refer to the **same backup**: the `.db`, its `.db.manifest.json`, and its `.db.offhost.json`. Confirm the Production backup is no older than 24 hours (or the stricter approved objective). Ensure the Hetzner S3 environment configuration identifies **Production** and supplies credentials from the approved restricted source. Do not copy those credentials into the rehearsal workspace.

2. Set the following paths to real, existing **non-Production-host rehearsal locations**. `WORK_ROOT` must be outside the directory containing the original backup; keep all working paths inside encrypted restricted storage:

   ```bash
   BACKUP='/SECURE/APPROVED-COPY/app-YYYYMMDDTHHMMSSZ.db'
   MANIFEST="${BACKUP}.manifest.json"
   RECEIPT="${BACKUP}.offhost.json"
   OFFHOST_ENV='/SECURE/CONFIG/.env.production'
   CUSTODY='/SECURE/INCIDENT/owner-custody.json'
   WORK_ROOT='/SECURE/ISOLATED-WORK'
   ADMIN_LOGIN='EXISTING-PRODUCTION-APPLICATION-ADMIN-LOGIN'
   mkdir -p "$WORK_ROOT"
   chmod 700 "$WORK_ROOT"
   ```

3. Record the hash of the read-only source:

   ```bash
   shasum -a 256 "$BACKUP"
   ```

   **Expected:** a 64-character digest. Save it as **SOURCE_SHA_BEFORE**.

4. On the isolated host, explicitly clear any ambient Production flag and run `prepare`:

   ```bash
   unset APP_ENV
   python3 scripts/ers-emergency-admin-isolated-rehearsal.py prepare \
     --backup "$BACKUP" \
     --manifest "$MANIFEST" \
     --receipt "$RECEIPT" \
     --offhost-env-file "$OFFHOST_ENV" \
     --custody "$CUSTODY" \
     --login "$ADMIN_LOGIN" \
     --work-root "$WORK_ROOT" \
     --max-age-hours 24 \
     --confirm ISOLATED-COPY-ONLY
   echo $?
   ```

   **Expected:**

   ```text
   Recovery request created; obtain two independent signed approvals. No database changes.
   ERS_REHEARSAL PREPARE PASS
   ISOLATED_WORKSPACE=/.../ers-admin-rehearsal-...
   SIGN_THIS_REQUEST=/.../ers-admin-rehearsal-.../request.json
   NEXT: two independently controlled owners sign the identical request; run finish before 15-minute expiry.
   0
   ```

   The runner invokes actual `ers-offhost-backup verify-replica` against Hetzner S3, verifies backup+manifest integrity and freshness, runs the **Bite 33.4 `ers-restore apply`** tool into a new private `scratch.db`, and prepares a read-only request. It **does not** change the source backup or live database.

5. Copy the value after `ISOLATED_WORKSPACE=` from **your actual output**, then assign it (do not use the example text):

   ```bash
   WORKSPACE='/ACTUAL/PATH/FROM/ISOLATED_WORKSPACE-OUTPUT'
   test -f "$WORKSPACE/request.json" && echo REQUEST_EXISTS_PASS
   test -f "$WORKSPACE/scratch.db" && echo SCRATCH_EXISTS_PASS
   ```

   **Expected:** both PASS markers. Inspect `"$WORKSPACE/restore.json"` without exposing confidential database content.

   **PASS:** `prepare` ends with exit `0`, backup freshness and exact S3 versions were remotely verified, restore completed with matching SHA, and only the private scratch copy will be modified. **BLOCKED:** any failed subprocess, unavailable S3 access, old backup, missing VersionIds, or restored schema without the canonical administrator.

## Gate E — Two real independent approvals and end-to-end redemption

**Actors:** Owner A signs on Owner A's own device, Owner B signs on Owner B's own device, recovery operator performs `finish` on the isolated machine. Prepare this step **before** starting the 15-minute request clock.

1. Securely transfer **only** the identical `"$WORKSPACE/request.json"` bytes to each signing owner. Each owner signs the file separately with their pre-enrolled, personally controlled private key. On Owner A's device:

   ```bash
   openssl pkeyutl -sign -rawin \
     -inkey /PRIVATE/OWNER-A/owner-a-private.pem \
     -in /PRIVATE/COPY/request.json \
     -out /PRIVATE/OWNER-A/owner-a.sig
   echo $?
   ```

   On Owner B's distinct device:

   ```bash
   openssl pkeyutl -sign -rawin \
     -inkey /PRIVATE/OWNER-B/owner-b-private.pem \
     -in /PRIVATE/COPY/request.json \
     -out /PRIVATE/OWNER-B/owner-b.sig
   echo $?
   ```

   **Expected:** `0` for both. **No private key is sent to the recovery machine.** If any signing command fails, stop; do not try alternative keys without reapproval.

2. Securely deliver **only** `owner-a.sig` and `owner-b.sig` to two separate files beneath a protected approvals directory on the isolated recovery machine. Do not replace an existing trusted public key. Confirm the files exist:

   ```bash
   APPROVALS='/SECURE/INCIDENT/APPROVALS'
   TRUST='/SECURE/RECOVERY/TRUST-PUBLIC-KEYS'
   test -f "$APPROVALS/owner-a.sig" && echo OWNER_A_SIGNATURE_PRESENT
   test -f "$APPROVALS/owner-b.sig" && echo OWNER_B_SIGNATURE_PRESENT
   ```

   **Expected:** both markers. This **does not** yet prove validity: `finish` cryptographically verifies both signatures, and checks both keys' fingerprints against independent attestation.

3. Set an approved private directory for the nonsecret report (outside `$WORKSPACE`):

   ```bash
   REPORT_DIR='/SECURE/INCIDENT/REPORTS'
   mkdir -p "$REPORT_DIR"
   chmod 700 "$REPORT_DIR"
   REPORT="$REPORT_DIR/33-6-6A-isolated-rehearsal.json"
   test ! -e "$REPORT" && echo NEW_REPORT_PATH_PASS
   ```

4. **Before request expiry**, run `finish`. Keep `ERS_RECOVERY_OPENSSL_BIN` set to the exact Gate B-approved executable; `finish` fails if it is unset or invalid:

   ```bash
   unset APP_ENV
   python3 scripts/ers-emergency-admin-isolated-rehearsal.py finish \
     --workspace "$WORKSPACE" \
     --approvals "$APPROVALS" \
     --trust-dir "$TRUST" \
     --custody "$CUSTODY" \
     --report-output "$REPORT"
   echo $?
   ```

   **Expected on success:**

   ```text
   Emergency reset token issued to private file; value suppressed. Restart backend, then redeem via POST /api/v1/auth/password/reset within 10 minutes.
   ERS_REHEARSAL ISOLATED_END_TO_END PASS
   0
   ```

   This executes production issuance identity/transaction/audit logic **against the scratch DB**, using actual OpenSSL verification (not fake signatures), then runs an isolated Go test that calls the **real authentication HTTP handlers** to redeem the issued token, verify it cannot be reused, seed and revoke a synthetic earlier session, sign in using the new password, resolve the new session, and check the correlated immutable audit record and SQLite integrity. No token or password appears in the report.

   **Expected on failure:** `ERS_REHEARSAL ISOLATED_END_TO_END FAIL` and a nonzero exit status. The runner writes a restricted FAIL report and deletes the entire temporary workspace even on failure. This is **FAIL/BLOCKED**, not a partial PASS.

5. Verify the saved report without exposing the real administrator's credentials:

   ```bash
   python3 - "$REPORT" <<'PY'
   import json,sys
   doc=json.load(open(sys.argv[1]))
   print('STATUS=', doc['status'])
   for item in doc.get('checks',[]): print('CHECK=',item)
   PY
   ```

   **Expected:** `STATUS= passed_isolated_rehearsal` and each recorded check (`api_reset_redemption`, `api_admin_login`, `prior_session_revocation`, `reset_replay_refusal`, `audit_correlation`, `source_unchanged` among them).

6. Verify original backup unchanged and disposable workspace removed:

   ```bash
   shasum -a 256 "$BACKUP"
   test ! -e "$WORKSPACE" && echo SCRATCH_REMOVED_PASS
   ```

   **Expected:** SHA equals **SOURCE_SHA_BEFORE** and `SCRATCH_REMOVED_PASS` prints. Report JSON must exist and be mode 0600, with parent mode 0700. There must be no retained token or scratch database.

   **PASS:** all conditions in steps 1–6, including a real restored Production-backup copy and independent signed owner approvals. **FAIL/BLOCKED:** missing report, missing required check, timing expiration, reuse accepted, admin login failed, stale sessions valid, source SHA changed, or scratch remains.

## Gate F — Production-host writer isolation (separate read-only safeguard)

**Actor:** explicitly authorized root operator on the Production recovery host during an approved maintenance window. This is **not** part of the isolated rehearsal, and must not be run to make the rehearsal pass. It does not stop or alter anything.

1. With written maintenance authorization, identify the actual on-host SQLite path from `docker inspect` / mounted Docker volume records, not from the illustrative documentation.
2. Once all application writers have been stopped by the approved operations procedure, execute:

   ```bash
   sudo env APP_ENV=production python3 scripts/ers-emergency-admin-isolated-rehearsal.py host-writers \
     --db /ACTUAL/PRODUCTION/SQLITE/PATH/app.db \
     --confirm READ-ONLY-PRODUCTION-WRITER-CHECK
   echo $?
   ```

   **Expected:** `ERS_REHEARSAL PRODUCTION_WRITERS_STOPPED PASS (read-only check)` and `0`. The check requires the named `ers-prd-backend` to exist and be stopped, inspects **all running container mounts** for the database's storage directory and conservatively checks open SQLite files through `lsof` if available.

   **PASS:** the result plus incident/operator record independently identifies all possible database writers and documents that they were stopped. **BLOCKED:** any live backend, shared Docker volume writer, missing Docker inspection, uncertain database path, or unknown writer. The tool does not claim an OS-level absolute guarantee against an unenumerated writer.

## Docker teardown and final acceptance

1. Before and after the test, execute:

   ```bash
   docker ps --format 'table {{.ID}}\t{{.Names}}\t{{.Ports}}'
   ```

2. If this rehearsal created a disposable container that remains, stop/remove **only that identified test-created container**:

   ```bash
   docker rm -f REPLACE_WITH_CONFIRMED_ERS_TEST_CONTAINER_ID
   ```

3. Confirm no rehearsal-created containers remain. Confirm any locally used port was released with:

   ```bash
   lsof -nP -iTCP:8080 -sTCP:LISTEN
   ```

   The port check may legitimately show the operator's separately running LOCAL ERS backend; do not stop unrelated services. Only mark cleanup PASS after comparing with the pre-test container inventory.

### Promotion evidence worksheet

| Gate | Evidence to record | PASS / FAIL / BLOCKED |
|---|---|---|
| A Source, local and CI | committed SHA; 3 Make exit codes+markers; GitHub CI run URL/commit | |
| B Real recovery host OpenSSL | host/OS/OpenSSL version; `RECOVERY_HOST_OPENSSL PASS` | |
| C Two distinct people / custody | two signed witnessed attestations; different public-key SHA-256 fingerprints | |
| D Verified source and S3 | manifest SHA, verified S3 receipt VersionIds, restore report, freshness | |
| E Scratch complete recovery | `ISOLATED_END_TO_END PASS`; secure JSON report; immutable audit correlation; backup SHA unchanged | |
| F Production writer preflight | read-only Production host proof during authorized window, if required for production operation | |
| Cleanup | no remaining test containers; scratch/token removed | |

**No GO decision may be recorded** until Gates A–E and cleanup are fully evidenced, and Gate F has been satisfied when authorizing an actual Production recovery. The absence of a currently approved real restored Production-backup copy, independent human custodians, a compatible recovery host, or valid remote S3 credentials is **BLOCKED**, not PASS. An isolated rehearsal does not authorize Production issuance.

**Glossary impact:** none; `owner-a` and `owner-b` remain **approval slot identifiers**, not human identities. This document does not revise domain terminology.
