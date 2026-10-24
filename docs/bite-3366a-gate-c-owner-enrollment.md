# Bite 33.6.6A — Gate C: independent owner-key enrollment (Docker Desktop)

**This is the authoritative Gate C owner-enrollment procedure.** It supersedes separately distributed Gate C scripts and earlier chat instructions. It works with the already accepted Gate B immutable Docker image. It **does not** alter the Production database, Production server, recovery Role Grants, or the Gate B lock. This document is an implementation procedure, not an assertion that two humans have attested.

**Source:** `docs/bite-3366a-isolated-end-to-end-acceptance.md`, Gate C. Gate C acceptance requires **two distinct real people** holding **different Ed25519 private signing keys**, their **matching trusted public PEMs**, and independently witnessed custody. Gate D validates the attestation is **no older than 24 hours**. Finish the human attestation close to Gate D. Gate C does not authorize live Production recovery.

## Participants and paths — read once

| Actor / computer | Transfer package path | Owner private and public key paths |
| --- | --- | --- |
| Operator / Owner A — original Mac | `$HOME/.ers-recovery/owner-enrollment-package` | `$HOME/.ers-owner-recovery/owner-a/owner-a-private.pem` (private), `owner-a.pem` (public) |
| Owner B — different independently controlled Mac | `$HOME/Downloads/ers-owner-enrollment` | `$HOME/.ers-owner-recovery/owner-b/owner-b-private.pem` (private), `owner-b.pem` (public) |
| Operator — original Mac | `~/.ers-recovery/trust-public-keys/` | Only public `owner-a.pem`, `owner-b.pem`, and fingerprint evidence |
| Operator — original Mac | `~/.ers-recovery/gate-c-incident/` | Restricted `owner-custody.json`, plus separately signed witness evidence |

The operator is assumed to be Owner A. If they are not, Owner A must perform the owner-key work on **their own** independent Mac and supply only their public PEM. Never ask an owner to send a private key or passphrase. Owner B must not use Owner A's computer/account. The witness must be neither owner. Do **not** commit generated materials or credentials to Git.

**Requirements:** Docker Desktop with the already accepted Gate B image on the operator Mac, macOS Bash, Python **3.9 or newer**, and an interactive Terminal. The owner operations use OpenSSL **inside the container**; Homebrew/OpenSSL on macOS is *not* a prerequisite. No `sudo`, Production access, or Docker socket mount is needed. The transfer archive SHA-256 and the script bundle SHA-256 must be independently communicated to Owner B over a separate authenticated channel.

## C.0 — Source and regression gate (operator's Mac)

From the original ERS checkout at the approved Git revision:

```bash
cd "$HOME/projects/EnterpriseRemoteSystems"
git branch --show-current
git rev-parse HEAD
git status --short
make recovery-owner-gatec-check
```

**PASS:** expected branch, expected reviewed HEAD, clean working tree, and `ERS_VALIDATION recovery-owner-gatec-check PASS`. This check runs *without Docker* and simulates the owner cryptography boundary; it does not establish human custody or real Docker execution. Stop for an unexpected SHA, dirty tree, or failed test. CI for the same final SHA is required before promotion. Do not repeat Gate B.

## C.1 — Create or verify the approved package (operator's Mac)

The Git checkout may be a reviewed descendant of the approved image source: the tool verifies ancestry **and** that all Gate B image inputs remain byte-for-byte unchanged. This avoids unnecessary Gate B rebuilds after Gate C-only commits.

This uses the existing approved lock at `$HOME/.ers-recovery/gate-b-approved-image-lock.json` and immutable `docker image inspect(...).Id`. It verifies the **actual OCI descriptor/blob chain** and provenance; it does **not** equate the image configuration digest with the image-index digest.

```bash
cd "$HOME/projects/EnterpriseRemoteSystems"
python3 scripts/ers-gatec-package.py --role operator
```

**PASS:** `ERS_GATEC APPROVED_IMAGE_VERIFIED PASS`, `ERS_GATEC OCI_CONTENT_CHAIN PASS`, `ERS_GATEC OPERATOR_PACKAGE_VERIFIED PASS`, `ERS_GATEC PACKAGE_VERIFICATION_COMPLETE PASS`.

**If and only if** this fails because the existing transfer package is missing, incomplete, or belongs to an older approved image, create a fresh package from the **already approved local image**:

```bash
python3 scripts/ers-gatec-package.py --role operator --create-package
python3 scripts/ers-gatec-package.py --role operator
```

`--create-package` verifies the current Git SHA, image ID, platform, provenance labels, archive checksum and referenced OCI blobs **before** activating the new package. It preserves any previous package under `owner-enrollment-package-preserved-*`. **Do not repeat Gate B image builds, edit the lock, or hand-copy image IDs.** If any check fails, stop.

The approved package has exactly these three transfer artifacts: `ers-approved-image.tar`, `ers-approved-image-id.txt`, `ers-approved-image-sha256.txt`.

## C.2 — Owner A independently generates or retains their key (original Mac)

**If** Owner A already obtained `ERS_GATEC OWNER_A_KEYPAIR_CREATED PASS` for an intended, non-abandoned keypair, do **not** regenerate. Proceed to C.5. Otherwise on **Owner A's original Mac**, from the checkout root:

```bash
python3 scripts/ers-gatec-owner-key.py --slot owner-a
```

If the script reports `EXISTING_KEY_DIRECTORY_STOP` from a prior **failed and not-yet-enrolled** attempt, and you have verified that public key is **not enrolled**, use the **explicit preservation** option exactly once:

```bash
python3 scripts/ers-gatec-owner-key.py --slot owner-a --archive-existing
```

This retains previous files in a new `owner-a-abandoned-*` directory. Never use it to rotate an already approved key.

**Passphrase prompts (exactly two):** `New encryption passphrase` and `Repeat the SAME encryption passphrase`. Type one strong, unique passphrase **identically at both prompts**. It is the *only* encryption passphrase. The script uses that same value to encrypt the private key **and** to unlock it for public-key extraction; no third prompt and no second passphrase. The passphrase is passed to Docker over stdin, not as an argument, file, environment variable, or log. Owner A alone retains it.

**PASS:** `ERS_GATEC OWNER_A_ENCRYPTED_PRIVATE_KEY PASS`, `ERS_GATEC OWNER_A_PUBLIC_KEY PASS`, `ERS_GATEC OWNER_A_KEYPAIR_CREATED PASS`, and `ERS_GATEC OWNER_KEY_COMPLETE PASS`. On failure, preserve the partial directory and stop; do not automatically retry.

## C.3 — Transfer and independently verify on Owner B's Mac

The operator transfers **only** the three C.1 image package files to Owner B's Mac, into `~/Downloads/ers-owner-enrollment`. The operator must also transmit the four version-controlled Gate C operational scripts using an approved authenticated channel. To make a scripts-only bundle (no `.env`, repository ZIP, key, backup, or password):

```bash
cd "$HOME/projects/EnterpriseRemoteSystems"
python3 - <<'PY'
from pathlib import Path
import zipfile
files = ('ers-gatec-package.py','ers-gatec-owner-key.py',
         'ers-gatec-public-keys.py','ers-gatec-custody.py')
out = Path.home() / '.ers-recovery' / 'gate-c-owner-tools.zip'
if out.exists():
    raise SystemExit('STOP: bundle already exists; do not silently overwrite it')
with zipfile.ZipFile(out, 'x', compression=zipfile.ZIP_DEFLATED) as z:
    for f in files:
        z.write(Path('scripts') / f, arcname=f)
print('ERS_GATEC OWNER_TOOLS_BUNDLE_CREATED PASS')
PY
shasum -a 256 "$HOME/.ers-recovery/gate-c-owner-tools.zip"
shasum -a 256 "$HOME/.ers-recovery/owner-enrollment-package/ers-approved-image.tar"
```

Communicate *both* resulting full 64-character SHA-256 values to Owner B through a **second authenticated channel**, separately from the files. If a package was already transferred and replaced, Owner B must discard that unapproved transfer and use the current approved package. Do not send private PEMs.

On **Owner B's own Mac**, after placing the ZIP in `$HOME/Downloads/gate-c-owner-tools.zip` and the three package files in `$HOME/Downloads/ers-owner-enrollment`, run:

```bash
printf 'Separately authenticated tools ZIP SHA-256: '; IFS= read -r TOOLS_SHA
printf 'Separately authenticated image TAR SHA-256: '; IFS= read -r ARCHIVE_SHA
[ "$(shasum -a 256 "$HOME/Downloads/gate-c-owner-tools.zip" | awk '{print $1}')" = "$TOOLS_SHA" ] || { echo 'ERS_GATEC TOOLS_SHA_MISMATCH FAIL'; exit 1; }
[ "$(shasum -a 256 "$HOME/Downloads/ers-owner-enrollment/ers-approved-image.tar" | awk '{print $1}')" = "$ARCHIVE_SHA" ] || { echo 'ERS_GATEC IMAGE_SHA_MISMATCH FAIL'; exit 1; }
mkdir -p "$HOME/Downloads/ers-gatec-tools"
python3 -m zipfile -e "$HOME/Downloads/gate-c-owner-tools.zip" "$HOME/Downloads/ers-gatec-tools"
python3 "$HOME/Downloads/ers-gatec-tools/ers-gatec-package.py" --role recipient --independent-sha "$ARCHIVE_SHA"
```

**PASS:** `ERS_GATEC RECIPIENT_IMAGE_VERIFIED PASS` and `ERS_GATEC PACKAGE_VERIFICATION_COMPLETE PASS`. The archive must match the **independently authenticated digest**; the command refuses malformed OCI blobs and does not execute an image before verifying it. Owner B must not use any older scripts downloaded from chat.

**Docker Desktop OCI attestation compatibility:** The approved archive may have an OCI image index that contains **one** runnable `linux/arm64` or `linux/amd64` image and one or more BuildKit `unknown/unknown` attestation manifests. This is not a second runnable platform. The recipient verifier now validates the attestation blobs and their reference to the unique runnable image. It still rejects a second runnable platform, unclassified index children, corrupted blobs, or a mismatched independently authenticated archive checksum. **Do not disable verification or invent a recipient-side image lock.**

**If Owner B previously encountered `OCI_MULTI_PLATFORM_REQUIRES_APPROVED_LOCK FAIL`:** The archive checksum and Gate B image lock do not need to change. After the operator applies and tests the approved OCI-verifier correction, create a **new, versioned tools ZIP** from the revised four repository scripts. Send only that ZIP and its newly calculated SHA-256 to Owner B over the established authenticated transfer and independent-digest channels. Owner B must verify the new ZIP checksum, preserve their previous `~/Downloads/ers-gatec-tools` directory under a distinct backup name, extract the new verified scripts, run `python3 -m py_compile` on all four files, and repeat C.3's **recipient verification command**. Do not repeat the Docker image export or any owner-key generation that previously completed. If the updated recipient check fails, stop and retain the error output for diagnosis.


## C.4 — Owner B independently creates their key (Owner B's Mac only)

From Owner B's own Terminal, using the **same `ARCHIVE_SHA`** authenticated above:

```bash
python3 "$HOME/Downloads/ers-gatec-tools/ers-gatec-owner-key.py" --slot owner-b --independent-sha "$ARCHIVE_SHA"
```

If a failed, **never-enrolled** prior `owner-b` key directory exists, repeat only with `--archive-existing`, which preserves the unsuccessful files. Do not reset a successfully enrolled key. The two prompts use **the same passphrase twice**; Owner B must never disclose this passphrase or their private key to Owner A or the operator.

**PASS:** `ERS_GATEC OWNER_B_ENCRYPTED_PRIVATE_KEY PASS`, `ERS_GATEC OWNER_B_PUBLIC_KEY PASS`, `ERS_GATEC OWNER_B_KEYPAIR_CREATED PASS`, `ERS_GATEC OWNER_KEY_COMPLETE PASS`.

## C.5 — Two separate public-key fingerprint calculations

Owner A, from the original Git checkout:

```bash
python3 scripts/ers-gatec-public-keys.py fingerprint --slot owner-a
```

Owner B, on their own Mac:

```bash
python3 "$HOME/Downloads/ers-gatec-tools/ers-gatec-public-keys.py" fingerprint --slot owner-b
```

Both commands must emit `ERS_GATEC PUBLIC_FINGERPRINT PASS` and a 64-character lowercase hex `OWNER_A_PUBLIC_SHA256=...` or `OWNER_B_PUBLIC_SHA256=...`. These SHA-256 fingerprints cover the **DER-encoded Ed25519 public key**, not its PEM text. The script verifies the Ed25519 SPKI prefix and mounts **only one public PEM file read-only** in Docker. Each owner independently communicates their fingerprint to the operator through an authenticated channel separate from the public-file transfer. Compare both values: they must differ. Do not transmit any owner private PEM.

Owner B securely transfers **only** `~/.ers-owner-recovery/owner-b/owner-b.pem` to the operator. On the operator's Mac, before receiving it:

```bash
mkdir -p "$HOME/.ers-recovery/incoming-public"
chmod 700 "$HOME/.ers-recovery/incoming-public"
```

Place the received file at `$HOME/.ers-recovery/incoming-public/owner-b.pem`, **not** in the trust directory yet.

## C.6 — Atomic public-key enrollment (operator's original Mac)

On the operator Mac, from the original Git checkout:

```bash
printf 'Authenticated Owner A public fingerprint (64 lowercase hex): '; IFS= read -r A_FP
printf 'Authenticated Owner B public fingerprint (64 lowercase hex): '; IFS= read -r B_FP
python3 scripts/ers-gatec-public-keys.py enroll \
  --owner-b-public "$HOME/.ers-recovery/incoming-public/owner-b.pem" \
  --owner-a-authenticated-sha "$A_FP" \
  --owner-b-authenticated-sha "$B_FP"
python3 scripts/ers-gatec-public-keys.py verify-enrolled
```

**PASS:** `ERS_GATEC DISTINCT_ENROLLED_PUBLIC_KEYS PASS`, `ERS_GATEC TRUST_ENROLLMENT_COMPLETE PASS`, `ERS_GATEC ENROLLED_PUBLIC_KEYS_VERIFIED PASS`.

This writes **only public material** into `$HOME/.ers-recovery/trust-public-keys` and atomically publishes the directory after preparing both PEMs and `gate-c-fingerprints.json`. The tool refuses an existing trust directory. It does not install Production trust or access Production.

## C.7 — Independent human witnessing and restricted custody record

An independent authorized witness who is neither owner must actually check the identities of both owners, their exclusive device/key/passphrase custody, independent fingerprint evidence, and exclusion of private PEMs from the Production host. Retain signed/witnessed identity evidence **separately, restricted, outside Git**. A program cannot attest these real-world facts.

**Within 24 hours before Gate D starts**, from the original operator Mac:

```bash
python3 scripts/ers-gatec-public-keys.py verify-enrolled
python3 scripts/ers-gatec-custody.py
```

Enter the **actual** Owner A and Owner B `person_id`, actual independent witness `witness_id`, real custody method, and truthful UTC timestamp in `YYYY-MM-DDTHH:MM:SSZ` format. Use the confirmation `VERIFIED` **only after** human attestation. If the witness evidence has expired, obtain a new genuine attestation rather than editing the timestamp. The record is written at `$HOME/.ers-recovery/gate-c-incident/owner-custody.json`, mode 0600; never overwrite it silently.

**PASS:** `ERS_GATEC CUSTODY_JSON_WRITTEN PASS`, two distinct human owners/witness evidence, matching trusted fingerprints, and contemporaneous signed custody proof. **BLOCKED:** incomplete identities, old timestamp, shared keys, false/missing witness evidence, or any conflict with the future Gate D validator.

## C.8 — Docker cleanup, evidence, and acceptance

On **each owner's computer**, run:

```bash
docker ps -a --filter 'name=ers-enroll-' --filter 'name=ers-gatec-fp-' --format '{{.ID}} {{.Names}} {{.Status}}'
```

Expected: **no enrollment-created containers**. On the operator's Mac also run the trust verification from C.6 and record its PASS marker. These scripts never publish a port, mount a Docker socket, or use Production credentials; no ERS-related ports need to be opened. If a container remains, identify its exact Gate C test name and remove **only that container**, not unrelated containers. Record any failed cleanup as a blocker. Retain the source Git SHA, approved image lock metadata, separately authenticated package checksums, public fingerprints, actual witnessed evidence, and custody record path. Never include private PEMs or passphrases in evidence logs.

**Gate C PASS:** valid two-owner encrypted keys on independently controlled machines, two distinct DER fingerprints, atomic local public trust enrollment, genuine independent witness evidence, fresh validated custody JSON, and no leftover enrollment containers. Operator reports alone are not a substitute for two real-world attestations. Gate D and subsequent Production recovery gates remain separate.

**Glossary impact:** none. The terms Owner A and Owner B identify independent cryptographic approval slots; they are not role grants or shared accounts.
