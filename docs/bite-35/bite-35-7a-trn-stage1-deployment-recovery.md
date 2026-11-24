# Bite 35.7A — Training activation, Stage 1 deployment correction

**Scope:** Restore the existing Training (TRN) deployment by reusing the proven ERS server Make targets and standard SSH command execution. Do **not** consolidate all environment workflows in this bite; Stage 2 has its own issue.

**Patch baseline:** `1120-bite-357a-trn-activation` at `0ffd4ac47c3452eb88999ec9c5696358a67420f6`.

**Operational fact at diagnosis (2026-11-24):** On Hetzner, TRN was at Test SHA `35af881760a6795bcdeb12bf2af3fd451a06a8ed`, migration-gate state `committed`, data volume `ers-trn_backend-data` present, but **no TRN service containers and no local `app-*.db` backup found**. The shared edge still lacked the TRN Caddy hostname and `ers-trn_default` network attachment. Never infer that a successful GitHub run proves those gates.

## 1. Why Stage 1 is required

1. Training's old GitHub workflow streamed a remote Bash deployment script through SSH stdin. `docker compose run` inside the migration gate could consume that stream, letting the shell exit after `Migration/deployment recovery gate ARMED`. GitHub consequently reported success before the service started.
2. `scripts/server-sqlite-backup.sh` rejected `BACKUP_ENVIRONMENT=training` even though the shared Go SQLite backup, manifest and off-host backup implementations accept Training. Consequently, post-deployment backup could fail and stop only TRN containers.
3. The migration gate can already be **committed** even if the post-commit backup failed. A recovery of the *exact same approved SHA and tree* must not unnecessarily run another migration gate against that volume.

## 2. Architecture contract

- **Common machinery:** `make server-build`, `server-migration-recovery-gate`, `server-up`, `server-backend-health`, `server-migrated-db-verify`, `server-env-caddy-health`, `server-migration-recovery-commit`, and `server-backup` with `ENV=training`.
- **Separate Training boundaries:** `ers-trn` Compose project, `ers-trn_backend-data` SQLite volume, `.env.training`, `docker-compose.training.yml` resource limits, 1Password `ers-training`, the Training-only S3 credentials and `ers-backups/training` namespace, and the independent GitHub `training` environment approval.
- **Release provenance:** Workflow can run only from `test`, on the exact **latest approved Test SHA** with its matching Test rehearsal marker and source tree.
- **GitHub job success:** Only when the remote command exits successfully **and** emits the exact final `PASS: TRN DEPLOYMENT VERIFIED revision=... tree=...` marker *after* application checks, migration commit and off-host backup.
- **Previous committed gate:** A matching committed gate and existing TRN data volume permit the same-revision application/backup recovery without another migration. `armed`, failed, mismatched environment, or missing volume are fail-closed.
- **Existing environments:** Do not change the working Development/Test/Production workflows, database lifecycles, credentials, or shared Caddy edge as part of Stage 1.

## 3. Automated LOCAL acceptance (no deployed Docker operations)

**Identity:** ERS Developer / Release Operator. **Context:** Mac Terminal in the patched branch checkout. **Preconditions:** Git checkout exactly matches the patch baseline before applying the patch. Local test prerequisites remain as established by the ERS SOP.

```bash
cd /path/to/your/EnterpriseRemoteSystems

git branch --show-current
git rev-parse HEAD
make trn-deployment-check
```

**Expected:** branch `1120-bite-357a-trn-activation` and original baseline `0ffd4ac47c3452eb88999ec9c5696358a67420f6` before applying the patch. The regression suite completes with `OK` (one optional OpenSSH test may be `skipped`). Offline simulation verifies full startup, exact-SHA committed recovery, backup failure, rollback, fail-closed armed gates, and actual runner shell quoting with a fake SSH client. It never accesses Hetzner, Docker daemon, 1Password or a deployed database.

**PASS:** all regressions return exit code 0. **FAIL:** any assertion fails. **BLOCKED:** required local runtime missing. **Cleanup:** only temporary files from automated tests; they self-delete; no Docker teardown is necessary because these tests create no containers.

**Additional canonical gate:** run `make local-check` and CI per existing SOP before promotion; record actual results, not presumed results.

## 4. Deployment prerequisites and independent approval

**Identity A — Release Operator** (GitHub UI and approved local repository). **Identity B — independent Training deployment reviewer** (GitHub Environment approval). **Context:** This is a deployment authorization, *not* a Tenant Actor or application authorization grant.

1. Merge/promote this corrected code by the **existing** Development → Test route and wait for the existing Test CI, Test deployed Playwright, and Test release rehearsal evidence to pass. **Do not** start the Training workflow from the feature branch and **do not** reuse the old Test SHA merely because it was previously approved. Record the **new latest** Test HEAD SHA and tree.
2. In GitHub → **Actions**, locate **Deploy ERS Training (TRN) — approved Test candidate**; select the `test` branch. Enter the new exact Test SHA, a change-approval identifier, and `DEPLOY-APPROVED-TEST-TO-TRN`.
3. The independent reviewer checks the `training` environment approval request in GitHub. Confirm the intended deployment source, authorized change window, credentials boundary and that the Training volume and off-host backup destination are not shared with Production. Approve only when authorized.
4. The preflight must validate the real Test rehearsal marker, Training environment contract, and Hetzner capacity before the deployment command can run.

**PASS:** approved release and independent approval recorded, with matching Test evidence. **BLOCKED:** missing reviewer, stale Test marker or wrong SHA. **FAIL:** release bypass or unauthorized credential access. **Cleanup:** no runtime changes prior to approval.

## 5. Read-only Hetzner check immediately before activation

**Identity:** Authorized Hetzner Infrastructure Operator. **Execution context:** SSH session on the Hetzner **Linux** host, not Mac (`uname -s` must print `Linux`). **No writes.**

```bash
uname -s
cd /opt/EnterpriseRemoteSystems/training || exit 2

echo '===== Current Training source ====='
git rev-parse HEAD

echo '===== Recovery gate state ====='
STATE=recovery/migration-gates/current.state
if test -f "$STATE"; then
  grep -E '^(status|environment|target_revision|target_tree_sha|first_deployment|committed_at)=' "$STATE"
else
  echo 'NO CURRENT GATE FILE'
fi

echo '===== Training data volume ====='
docker volume inspect ers-trn_backend-data --format '{{.Name}}'

echo '===== Training services ====='
docker ps -a --filter label=com.docker.compose.project=ers-trn \
  --format 'table {{.Names}}\t{{.Status}}'

echo '===== Existing Training backup evidence ====='
find backups -maxdepth 1 -type f -name 'app-*.db' -print | sort
```

**Expected for the incident described above:** exact former Test SHA, `status=committed`, `environment=training`, existing data volume and no TRN containers. If the state changed, reassess before deployment rather than blindly assuming an exact-SHA recovery. If the new Test SHA differs, the workflow uses the existing migration gate to rehearse and protect the existing volume before migration; it does **not** delete/reinitialize the SQLite volume.

**PASS:** expected boundary and data present. **BLOCKED:** missing volume, `status=armed` or unexpected gate/environment/ownership. **FAIL:** any evidence that Training points to another environment's database. **Cleanup:** none.

## 6. Confirm the approved GitHub workflow actually completed

**Identity:** Release Operator and independent reviewer. **Context:** GitHub Actions run, `training` environment. In the run's **Deploy pinned TST-approved revision using standard SSH command execution** step:

1. Verify SHA and tree match the approved Test candidate and the remote checkout.
2. Verify `server-build`, migration gate or `RESUME:` for a matching already-committed gate, three internal health checks, and backup/off-host replication verification. A **new SHA** normally requires a new migration gate; exact-SHA recovery with a matching committed gate skips it.
3. Verify the exact final `PASS: TRN DEPLOYMENT VERIFIED revision=<approved SHA> tree=<approved tree>` line. Confirm GitHub job status is **Success** only after that line.
4. If backup fails, expect a nonzero workflow result and Training-only shutdown (`server-down ENV=training`). **Do not** re-run an `armed` gate and **never** run `down -v`.

**PASS:** complete output and final marker. **FAIL:** green workflow without startup, backup, or final marker (release-blocking). **BLOCKED:** any missing or ambiguous evidence. **Cleanup:** none; preserve logs without secrets.

## 7. Verify actual services and backup protection on Hetzner

**Identity:** Hetzner Infrastructure Operator. **Context:** authorized Linux SSH session, after approved GitHub deployment. All commands below are read-only apart from backend/off-host verification programs, which use isolated temporary verification files and do not replace the live TRN DB.

```bash
cd /opt/EnterpriseRemoteSystems/training || exit 2

make server-trn-ps
make server-trn-backend-health
make server-trn-env-caddy-health

grep -E '^(status|environment|target_revision|target_tree_sha)=' \
  recovery/migration-gates/current.state

docker volume inspect ers-trn_backend-data --format '{{.Name}}'

find backups -maxdepth 1 -type f -name 'app-*.db' -print | sort
```

Identify the actual **new** Training backup file from this output; verify matching `.manifest.json` and `.offhost.json`. Then explicitly set it, replacing the placeholder with the observed actual filename:

```bash
BACKUP_FILE=/opt/EnterpriseRemoteSystems/training/backups/app-REPLACE-WITH-OBSERVED.db

test -f "$BACKUP_FILE" && \
test -f "$BACKUP_FILE.manifest.json" && \
test -f "$BACKUP_FILE.offhost.json" || {
  echo 'BLOCKED: Training backup, manifest or off-host receipt missing'; exit 2;
}

make server-backup-verify ENV=training BACKUP_FILE="$BACKUP_FILE"
make server-offhost-backup-verify ENV=training BACKUP_FILE="$BACKUP_FILE"
```

**PASS:** three running healthy `ers-trn` containers, committed gate, unchanged `ers-trn_backend-data` volume, verified Training SQLite manifest, and verified **Training-only** off-host S3 receipt. **FAIL:** missing data, invalid backup, unhealthy service or cross-environment storage reference. **BLOCKED:** insufficient access or receipt absent. **Cleanup:** verification-generated temporary files only; preserve backups and live containers. Do not stop or remove unrelated containers.

The separately approved isolated restore/rehearsal remains mandatory before human Training acceptance; neither a successful backup nor this stage proves recoverability by itself.

## 8. Public HTTPS and full Training acceptance remain separate

**Identity:** Authorized Infrastructure Operator and independent reviewer. **Context:** Shared Caddy edge; impacts DEV/TST/PRD as well as TRN. **Precondition:** Step 7 PASS, explicit shared-edge approval and tested rollback plan.

The shared edge was observed to lack the Training hostname in its installed Caddyfile and lacked `ers-trn_default` network membership. This patch **does not run** `edge-sync`, `edge-up`, `edge-reload`, `edge-down`, or edit the shared edge; activate the exact inspected Training additions under a separate approved change. Following activation, from Mac Terminal verify HTTPS for all four domains with trusted TLS (no `-k`):

```bash
for HOST in trn dev tst app; do
  echo "===== ${HOST} ====="
  curl --fail --silent --show-error --connect-timeout 5 --max-time 20 \
    --output /dev/null --write-out 'HTTP=%{http_code} TLS=%{ssl_verify_result}\n' \
    "https://${HOST}.enterpriseremotesystems.com/api/v1/healthz" || echo 'FAIL'
done
```

**PASS:** all four environments `HTTP=200 TLS=0`. **FAIL:** any TLS failure or regression in an existing environment; follow the authorized shared-edge rollback. **BLOCKED:** no edge approval. No manual Training account enrollment or trainee access until off-host isolated restore, two-human administrator enrollment, and UI acceptance independently pass under the existing 35.6S.1A runbook.

## 9. Glossary impact

**None.** Training is a separate ERS *environment*, not a Tenant, Person, AccountActor or Role. No business-domain glossary additions or terminology changes.
