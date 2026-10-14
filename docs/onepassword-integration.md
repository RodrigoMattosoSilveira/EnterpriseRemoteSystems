# 1Password integration — staged Bite 33.6 delivery

## Scope and rollout gate

The three GitHub Environments (`development`, `test`, `production`) now have
separate `OP_SERVICE_ACCOUNT_TOKEN` secrets. Each machine credential must read
only its environment vault and `ers-deployment`. `ers-recovery` and
`ers-automation-bootstrap` are human-only. Keep existing GitHub deployment
credentials in place until a separate reviewed deployment cutover passes.

This phase adds read-only account smoke tests and materialization building
blocks. **The existing `deploy.yml` remains unchanged. No runtime files are
automatically replaced.** GitHub feature CI and server backup/restore scripts
remain independent of 1Password.

Run **Actions → 1Password vault access smoke test → Run workflow** separately
for Development and Test. Review success before choosing Production. This
workflow reads vault metadata but never prints or exports secret values.
Its check of the two prohibited vaults is not a substitute for auditing all
six vault permissions in the 1Password UI.

## Secret-reference fragments

The checked-in `ops/1password/*.tpl` files contain non-secret `op://` item
field references, not credentials. Field names must match the actual 1Password
items. The scripts use `op read` to resolve references only during explicit
materialization. Items use the following naming contract:

- `ers-development/runtime-secrets`, `ers-test/runtime-secrets`;
- `ers-production/runtime-secrets`;
- `ers-production/hetzner-object-storage`.

The environment templates are **fragments** with only secret-valued variables.
They must not be substituted for complete runtime `.env` files, which also
contain Git-managed, deployment-specific and safety-critical configuration.
The deployment cutover must merge validated, approved non-secret settings
with these secret values atomically and never overwrite a functioning file
without an explicit backup and rollback procedure.

A qualified human can run the following safe **scratch-only** example after
independently authenticating with `op`:

```bash
umask 077
mkdir -p /tmp/ers-onepassword-validation
python3 scripts/ers-op-materialize.py \
  --template ops/1password/development.env.tpl \
  --output /tmp/ers-onepassword-validation/development.secrets \
  --expected-root /tmp/ers-onepassword-validation
stat /tmp/ers-onepassword-validation/development.secrets
# Inspect key names only; never print values, copy into logs, or commit.
cut -d= -f1 /tmp/ers-onepassword-validation/development.secrets
rm -f /tmp/ers-onepassword-validation/development.secrets
```

The script creates or atomically replaces the target with mode 0600 and never
prints resolved secret values. It requires the destination directory to
already exist. Do not use scratch test output as a Production configuration.
CI must never upload materialized files as artifacts.

**Production recovery is not cut over in this phase.** The existing checked-in
owner-unavailable manifest and runbook still use LastPass locators. Because
those locators do not yet match the new 1Password vault contents, final Phase
B acceptance must remain blocked until a separate coordinated change updates
and tests the manifest, preflight, recovery tests and runbook, and an
independent technician proves recovery from 1Password with no owner support.
Do not treat a GitHub Service Account token as the recovery mechanism.

Production may only be declared fully recoverable when a new off-host
Production backup includes `repository.revision` and `repository.tree_sha`
and Phase B proves RPO ≤ 24 hours and RTO ≤ 4 hours after deployment.
