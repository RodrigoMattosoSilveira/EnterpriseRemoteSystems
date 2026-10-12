# Owner-Unavailable ERS Recovery Access Package

## Purpose

ERS Production recovery must not depend on the system owner being awake, reachable, or able to approve an MFA prompt.

The operational standard is:

> A qualified designated technician, using only the ERS runbook, pre-authorized designated-technician GitHub access, the shared LastPass recovery collection, pre-authorized Hetzner project access, and DNS administrative access, can recover the Production database and prove the recovered service without information held only in the owner's memory, computer, phone, or personal password vault.

No personal vault, owner-only MFA device, owner-only SSH key, or undocumented credential source satisfies this requirement.

## Canonical non-secret locator manifest

The repository contains:

```text
ops/recovery-access.production.env
```

It contains **no secret values**. It defines the exact authoritative locator for every recovery prerequisite. The canonical shared collection name is:

```text
ERS-Recovery
```

The required LastPass shared items are:

```text
lastpass-shared://ERS-Recovery/Production/.env.production
lastpass-shared://ERS-Recovery/Production/Hetzner-S3-ers-backup
lastpass-shared://ERS-Recovery/Production/Host-SSH
lastpass-shared://ERS-Recovery/Infrastructure/Hetzner-Console
lastpass-shared://ERS-Recovery/Infrastructure/DNS
technician-controlled://independent-mfa-and-recovery-codes
```

The shared items may contain the corresponding secret/file/account material, but the Git repository manifest must never contain those values.

## What each shared source must contain

| Locator | Required content | Installed/used as |
|---|---|---|
| `Production/.env.production` | Canonical current Production environment file, including current JWT/auth/application/S3 configuration | `/opt/EnterpriseRemoteSystems/production/.env.production`, mode 600 |
| `Production/Hetzner-S3-ers-backup` | Hetzner Object Storage S3 access key and secret for profile `ers-backup` | `/opt/EnterpriseRemoteSystems/secrets/aws-credentials`, mode 600 |
| `Production/Host-SSH` | Host SSH login material or documented replacement-host SSH bootstrap material | technician SSH access |
| `Infrastructure/Hetzner-Console` | Shared organizational Hetzner Console account/access procedure and ERS project identity | replacement-host provisioning and Object Storage inspection |
| `Infrastructure/DNS` | Shared organizational DNS provider account/access procedure for `enterpriseremotesystems.com` | DNS recovery/change |
| `technician-controlled://independent-mfa-and-recovery-codes` | Each designated technician maintains their own independent MFA/recovery capability for their individual LastPass/GitHub/provider account access | access continuity without owner approval |

Repository and edge configuration come from the shared GitHub repository:

```text
git@github.com:RodrigoMattosoSilveira/EnterpriseRemoteSystems.git
```

The edge source of truth is:

```text
edge/Caddyfile
edge/docker-compose.edge.yml
```

GitHub Actions secrets such as `DEPLOY_SSH_PRIVATE_KEY` are deployment inputs and are intentionally not readable back from GitHub. They are **not** an authoritative disaster-recovery source. The corresponding recoverable SSH material must exist in the shared LastPass recovery collection.

## Canonical Production Object Storage identity

```text
Endpoint: https://hel1.your-objectstorage.com
Region:   hel1
Bucket:   ers
Profile:  ers-backup
Domain:   app.enterpriseremotesystems.com
```

The active object prefix is read from the recovered canonical `.env.production`. Do not guess it.

## Required access policy

At least two qualified designated technicians should have independent access to the `ERS-Recovery` shared collection and pre-authorized GitHub/Hetzner/DNS access required by the runbook. Each technician must use an individual account where the provider supports it and maintain MFA/recovery material outside the shared vault they are trying to unlock; do not create a circular dependency where LastPass recovery material exists only inside LastPass.

Access must satisfy both rules encoded in the repository manifest:

```text
RECOVERY_SHARED_ACCESS_POLICY=technician-access-independent-of-owner
RECOVERY_MFA_POLICY=must-not-depend-on-owner-device-or-approval
```

If a technician must call, message, or wake the owner to obtain a password, MFA approval, file, hostname, key, account identity, or recovery decision, owner-unavailable readiness has failed.

## Configuration-change discipline

Whenever `.env.production` changes, the canonical shared LastPass `Production/.env.production` item must be replaced with the deployed version as part of the same operational change. Do not treat `scripts/init-server-env.sh` or `scripts/init-prod-env.sh` as a backup of Production configuration; those initializers can generate/default values and cannot reconstruct the deployed secrets.

Whenever host SSH credentials, Hetzner access, or DNS access changes, update the corresponding `ERS-Recovery` item before closing the change. Whenever a technician's MFA/recovery capability changes, that technician must restore independent access before the recovery-readiness change is considered complete.

## Quarterly access rehearsal

At least quarterly, and after any administrator/access-provider change, a designated technician other than the primary system owner should perform the owner-unavailable recovery rehearsal from a clean operator workstation or replacement host context.

The rehearsal is non-destructive to the live Production database:

```bash
make server-owner-unavailable-recovery-rehearsal \
  ENV=production \
  RECOVERY_REHEARSAL_OFFHOST_BACKUP_NAME=app-<timestamp>.db \
  RECOVERY_TECHNICIAN_ID=<technician-identity> \
  RECOVERY_SHARED_ACCESS_CONFIRM=OWNER-UNAVAILABLE-RECOVERY-ACCESS-CONFIRMED
```

The designated technician must obtain the Production environment file and S3 credential material from the documented shared sources before setting the confirmation token.

The resulting `rehearsal.json` must record:

- `owner_unavailable.mode = true`;
- technician identity;
- shared-access confirmation;
- SHA-256 of the non-secret access manifest;
- source locators used;
- exact S3 database/manifest VersionIds;
- backup-compatible repository revision/tree;
- proof that the compatible revision can be resolved from Git;
- isolated backend health;
- SQLite integrity/foreign-key verification;
- RPO/RTO results.

A quarterly rehearsal is **failed** if any prerequisite comes from the owner's personal vault/device/memory, any shared source is inaccessible, the backup lacks compatible revision/tree evidence, or the technician needs owner assistance.
