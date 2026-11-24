#!/usr/bin/env bash
# Training-only implementation of the established ERS deploy sequence.
# Called from the pinned Test checkout using SSH command execution, never
# from a heredoc/streamed shell that Docker could consume from stdin.
# Uses the SAME Make targets as DEV/TST/PRD; does not touch other environments.
set -euo pipefail

stop() { echo "STOP: TRN deployment: $*" >&2; exit 2; }
sha_regex='^[0-9a-f]{40}$'
[[ $# -eq 2 ]] || stop 'expected the approved revision and tree SHA'
revision="$1"
tree="$2"
[[ "$revision" =~ $sha_regex && "$tree" =~ $sha_regex ]] || stop 'invalid revision or tree SHA'
[[ -f .env.training && -f docker-compose.training.yml ]] || stop 'not a provisioned Training checkout'
[[ "$(git rev-parse HEAD)" == "$revision" ]] || stop 'checkout does not match approved Test revision'
[[ "$(git rev-parse 'HEAD^{tree}')" == "$tree" ]] || stop 'checkout tree differs from approved Test tree'

make server-environment-contract-check ENV=training

state=recovery/migration-gates/current.state
read_gate() {
  grep -E "^$1=" "$state" | tail -n 1 | cut -d= -f2- || true
}
gate_armed=false
resume_committed=false
previous_gate_revision=""
previous_gate_tree=""
if [[ -f "$state" ]]; then
  status="$(read_gate status)"
  [[ "$(read_gate environment)" == training ]] || stop 'recovery gate belongs to another environment'
  case "$status" in
    armed)
      stop 'an earlier Training migration gate is ARMED; investigate before redeploying'
      ;;
    committed)
      previous_gate_revision="$(read_gate target_revision)"
      previous_gate_tree="$(read_gate target_tree_sha)"
      [[ "$previous_gate_revision" =~ $sha_regex && "$previous_gate_tree" =~ $sha_regex ]] || \
        stop 'committed migration gate lacks valid source revision/tree evidence'
      if [[ "$previous_gate_revision" == "$revision" && "$previous_gate_tree" != "$tree" ]]; then
        stop 'committed gate has conflicting tree for approved Test revision'
      fi
      if [[ "$previous_gate_revision" == "$revision" && "$previous_gate_tree" == "$tree" ]]; then
        # A committed gate proves migration/integrity was checked. It must NOT
        # be armed again for an exact-SHA recovery of a failed post-commit backup.
        docker volume inspect ers-trn_backend-data >/dev/null || stop 'committed gate but Training data volume missing'
        resume_committed=true
        echo 'RESUME: exact approved Training revision already has a committed migration gate; preserving database and skipping migrations.'
      fi
      ;;
    *)
      stop "recovery gate has unexpected status '$status'; investigate before redeploying"
      ;;
  esac
fi

# Build the approved Test source only after the recovery gate has been
# classified; an ARMED or corrupt gate must fail without changing images.
make server-build ENV=training

if [[ "$resume_committed" == false ]]; then
  previous_revision="$(cat .last-training-deployment-revision 2>/dev/null || true)"
  if [[ ! "$previous_revision" =~ $sha_regex ]]; then previous_revision="$previous_gate_revision"; fi
  previous_tree=""
  if [[ "$previous_revision" == "$previous_gate_revision" ]]; then previous_tree="$previous_gate_tree"; fi
  # Same migration/recovery Make target used for other deployed environments.
  make server-migration-recovery-gate ENV=training \
    MIGRATION_PREVIOUS_REVISION="$previous_revision" MIGRATION_PREVIOUS_TREE_SHA="$previous_tree" \
    MIGRATION_TARGET_REVISION="$revision" MIGRATION_TARGET_TREE_SHA="$tree"
  gate_armed=true
fi

rollback_gate() {
  if [[ "$gate_armed" == true ]]; then
    echo 'FAIL: Training checks failed with migration gate armed; invoking Training-only rollback.' >&2
    if ! make server-migration-recovery-rollback ENV=training; then
      echo 'FAIL: Training rollback did not complete; stopping only Training services and preserving the data volume.' >&2
      make server-down ENV=training || true
    fi
  else
    # On committed exact-SHA recovery there is no pending migration to roll
    # back. Preserve the existing SQLite volume; stop only Training services.
    echo 'FAIL: exact-SHA Training recovery failed; stopping only Training services.' >&2
    make server-down ENV=training || true
  fi
}

if ! make server-up ENV=training || \
   ! make server-backend-health ENV=training || \
   ! make server-migrated-db-verify ENV=training || \
   ! make server-env-caddy-health ENV=training; then
  rollback_gate
  stop 'Training startup or internal verification failed'
fi
if [[ "$gate_armed" == true ]]; then
  if ! make server-migration-recovery-commit ENV=training; then
    rollback_gate
    stop 'Training migration gate commit failed'
  fi
fi

# Backup is mandatory. The Training environment contract requires the
# separate S3 destination; server-backup performs SQLite/manifest checks and
# verifies the remote replica before returning success. Never claim release
# success with an unprotected Training database.
if ! make server-backup ENV=training; then
  echo 'FAIL: Training backup or off-host verification failed; stopping only Training services.' >&2
  make server-down ENV=training || true
  stop 'post-deployment Training backup/replication failed'
fi

# Record completion only after all checks. On a later exact-SHA redeploy,
# status=committed permits safe recovery without repeating migrations.
printf '%s\n' "$revision" > .last-training-deployment-revision
printf 'PASS: TRN DEPLOYMENT VERIFIED revision=%s tree=%s\n' "$revision" "$tree"
