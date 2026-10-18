# Bite 33.6.6A — Emergency Production Application Administrator recovery

## Security model

This is an **offline, two-owner, break-glass procedure**, not an authentication bypass or a Production bootstrap. It issues an ordinary ERS `ers_pr_` password-reset token (10-minute expiry), using exactly the token format/hash accepted by `POST /api/v1/auth/password/reset`. That endpoint performs the actual password change, consumes the token and revokes sessions. The tool does **not** directly change a password hash, issue a session, create an account, change a Role Grant, or clear a security suspension.

Issuance requires all of:

* Verified fresh Production backup and matching manifest (independently SHA-256 checked); verify off-host receipt separately.
* Root operator on the protected Production host; `APP_ENV=production`; known `ers-prd-backend` container exists and is stopped. No reset/demo/E2E commands.
* A canonical active, non-suspended global `APPLICATION_ADMIN` AccountActor and active grant, with no Person or Tenant Actor association.
* A request expiring within 15 minutes, approved by **both** independent owners using Ed25519 signatures.
* Two distinct, pre-enrolled owner public keys in a root-owned, non-group-writable, non-world-writable trust directory. No owner private key on the host.
* A new token output file in a private (0700) root-owned directory; mode 0600; no terminal, CI log, or chat token disclosure.
* Atomic SQLite transaction inserting the hashed reset token plus a correlation-bound, append-only `authz_audit_logs` event. The immutable audit correlation prevents reuse of the request even if the reset token has already been consumed.

The host administrator must independently authorize any use. Root privileges are inherently trusted and require OS/SSH/Hetzner controls and audit trails. Signatures prevent a lone deploy user from issuing recovery tokens, not a compromised root or two colluding owner keys. This is an emergency credential recovery procedure, not a mechanism for permanently provisioning a named human administrator; use the application's authorized administrative UI afterward to complete the human-account transition.

## Mandatory 33.6.6A pre-promotion acceptance

The complete operator procedure and separate execution evidence are specified in
[`bite-3366a-isolated-end-to-end-acceptance.md`](bite-3366a-isolated-end-to-end-acceptance.md).
Run **Gates A–E and cleanup** before accepting this Bite. A synthetic automated
fixture is **not** a substitute for the real approved, verified, fresh Production
backup restored into protected scratch storage, live Hetzner S3 VersionId checks,
independently witnessed custody, and real password reset/login/session revocation.
The separate read-only Production writer gate applies to an authorized Production
maintenance window, not the isolated rehearsal. The real `issue` Production guards
are not bypassed or relaxed by the rehearsal runner.

## Before Production operation

1. **Verify the exact committed HEAD SHA and validation results.** Do this in the reviewed source checkout used for LOCAL validation, **not by running LOCAL checks on the Production host**. The "approved HEAD SHA" means the exact Git commit proposed for promotion or for the recovery rehearsal. It is not a separate type of SHA. A new commit after a fix requires revalidation and new CI evidence against the new HEAD SHA.

   First, replace `PASTE_APPROVED_HEAD_SHA_HERE` with the full 40-character SHA identified in the release evidence. Run:

   ```sh
   APPROVED_HEAD_SHA='PASTE_APPROVED_HEAD_SHA_HERE'
   ACTUAL_HEAD_SHA="$(git rev-parse HEAD)"
   printf 'ACTUAL_HEAD_SHA=%s\n' "$ACTUAL_HEAD_SHA"
   if [ "$APPROVED_HEAD_SHA" = "$ACTUAL_HEAD_SHA" ]; then
       printf 'ERS_VALIDATION HEAD_SHA_MATCH PASS\n'
   else
       printf 'ERS_VALIDATION HEAD_SHA_MATCH FAIL (expected %s)\n' "$APPROVED_HEAD_SHA"
   fi
   ```

   **Expected:** The printed SHA matches the approved commit exactly and `ERS_VALIDATION HEAD_SHA_MATCH PASS` appears. **Stop if FAIL appears.** In addition, run `git status --porcelain` and require **no output** to demonstrate the tested checkout has no uncommitted changes; if output appears, record `WORKTREE_CLEAN=FAIL` and resolve before treating the checks as promotion evidence.

   Run these three commands **one at a time**, checking each command's **last successful output** before starting the next:

   ```sh
   make emergency-admin-recovery-check
   ```

   **Expected final success indicator:** `ERS_VALIDATION emergency-admin-recovery-check PASS`.

   ```sh
   make promotion-readiness-check
   ```

   **Expected final success indicator:** `ERS_VALIDATION promotion-readiness-check PASS`.

   ```sh
   make local-check
   ```

   **Expected final success indicator:** `ERS_VALIDATION local-check PASS`.

   Each marker is printed **only after** its complete Make target exits successfully. If a command fails, the marker for that invocation is absent; stop, record the command and error output, and treat the gate as FAIL. Do not infer success from earlier subtest PASS messages (the promotion and local checks invoke many nested checks). For each invocation, also confirm its shell exit status is `0` (for example, `echo $?` immediately afterward, before any other command).

   **CI is a separate fourth gate, not a `make` command.** In the GitHub repository, open **Actions → CI** and open the run for the approved branch commit. Confirm the run finished **Success**, every required job is successful, and the run's **source HEAD SHA matches `APPROVED_HEAD_SHA`**. A Pull Request merge SHA may differ from the source-branch HEAD SHA; inspect the run's source commit rather than assuming they are identical. Record the run URL, source commit, conclusion, and date. Record `ERS_VALIDATION CI PASS` in the operator's acceptance evidence **only after** that comparison; the Makefile does not print a CI marker.

   **Acceptance for item 1:** HEAD match PASS, all three Make success markers observed with exit code `0`, and CI PASS on the same source commit. If any is missing, this item is **BLOCKED/FAIL**, not completed.

2. Rehearse issuance and reset **on an isolated restored verified Production backup** with `APP_ENV=test` and a local-only harness; never point the test harness at live Production. The CLI's actual `issue` operation is deliberately Production-root-only.
3. Independently enroll two owner signing keys. Each owner creates and retains an Ed25519 private key separately and securely. Transfer **only** their corresponding public `.pem` files to a root-owned trust directory (for example `/opt/EnterpriseRemoteSystems/recovery/admin-approval-trust/`) and ensure permissions are restrictive. Never commit keys or trust contents to Git or place them in `ers-deployment`.
4. Take a fresh verified local and off-host database backup, record both version IDs and manifest checksum. Confirm owner-unavailable access to host, 1Password and backup. Plan a short maintenance window: the backend must be stopped and restart within the reset token's 10-minute lifetime.

## Example operator sequence (only after all approvals and rehearsal)

Use the reviewed Bite 33.6.6A checkout on the Production server. The following paths are examples; verify exact paths and ownership before running. Replace `administrator@example.com` with the previously verified existing Production Application Administrator login. Run the read-only prepare step first; it cannot modify a database:

```sh
python3 scripts/ers-emergency-admin-recovery.py prepare \
  --db /opt/EnterpriseRemoteSystems/production/data/app.db \
  --login administrator@example.com \
  --request-output /secure/operator/recovery-request.json
```

Each independent owner signs the **same canonical JSON request bytes** using their privately held key on their own trusted machine:

```sh
openssl pkeyutl -sign -rawin -inkey owner-a-private.pem \
  -in recovery-request.json -out owner-a.sig
# Other owner separately uses their own private key, writing owner-b.sig.
```

Transfer both `.sig` files into `/secure/operator/approvals/`. After independently validating approvals, backup, service outage, and the exact login, issue with no secrets in command-line arguments (the `--token-output` path must be root-owned and private):

```sh
sudo env APP_ENV=production python3 scripts/ers-emergency-admin-recovery.py issue \
  --db /opt/EnterpriseRemoteSystems/production/data/app.db \
  --request /secure/operator/recovery-request.json \
  --approvals /secure/operator/approvals \
  --trust-dir /opt/EnterpriseRemoteSystems/recovery/admin-approval-trust \
  --verified-backup /opt/EnterpriseRemoteSystems/production/backups/app-YYYYMMDDTHHMMSSZ.db \
  --manifest /opt/EnterpriseRemoteSystems/production/backups/app-YYYYMMDDTHHMMSSZ.db.manifest.json \
  --token-output /secure/root-only/recovery-token
```

**Do not use the illustrative host database path without verifying the actual host-mounted Production SQLite database path** with Docker/Compose. It may be in a Docker volume, not in `production/data/`. Do not directly mount or write to the database while any backend instance is running. Confirm all application writer containers are stopped (the tool verifies the named backend only, so the operator must check other possible writers). Do not use the tool on backup originals.

Restart the backend under the standard Compose configuration (without changing `AUTHZ_BOOTSTRAP_ENABLED=false`). Open `https://app.enterpriseremotesystems.com/password/reset` **without a token query parameter** in a controlled private browser. Transfer the token over an approved private channel, paste it into the **Reset token** field, enter a newly chosen unique password and its confirmation, and submit. The existing `ResetPasswordPage` calls the `/auth/password/reset` API and navigates to login on success. Never put a token in a URL, shell history, GitHub Actions, chat, or deployment log. Revoke/expire unused recovery tokens under the documented auth lifecycle controls; avoid ad hoc SQL.

Finally verify authenticated login, effective global administration, required account-name transition, token single use, prior-session invalidation, database/audit integrity, and successful fresh off-host backup. Store signed request, correlation ID and audit result in a restricted incident record, not the reset token. Notify both owners. **Do not close Bite 33.6.6A until a human operator has successfully rehearsed end-to-end recovery and a legitimate named human administrator is established.**
