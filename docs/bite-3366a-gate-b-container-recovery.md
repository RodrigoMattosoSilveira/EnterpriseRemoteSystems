# Bite 33.6.6A — Gate B standardized recovery container

This is a **dependency and isolation smoke test**, not an authorization for live Production credential recovery, not a real-backup rehearsal and not a substitute for Gates A–E in `bite-3366a-isolated-end-to-end-acceptance.md`.

## Prerequisites and image review (Gate B.1)

Run in the exact reviewed branch and commit with a clean working tree. Use Docker Desktop on LOCAL or an approved Linux host with Docker Engine and Buildx. The host needs outbound access to Docker Hub for official manifests and Debian package mirrors for the initial image build. Docker must be functional (`docker info`). No Production secrets, private owner keys, database backups or Docker socket are ever mounted into the smoke container.

The required base is the *official* `python:3.12-slim-bookworm` image, constrained to either `linux/amd64` or `linux/arm64`. Obtain the actual official SHA-256 digest (64 lowercase hex characters) independently, **not** from this document. Review:

```sh
docker buildx imagetools inspect python:3.12-slim-bookworm
```

Select the immutable **index digest** from the top `Digest: sha256:...` line (or a reviewed platform manifest digest for your selected architecture). Do not mistake the image tag, `sha256:REPLACE_WITH...`, or an attestations/unknown-platform entry for the digest. Inspect the chosen platform with `docker buildx imagetools inspect --raw python:3.12-slim-bookworm` and confirm it lists a manifest for your selected architecture, then record the inspected image tag, digest, platform, source, reviewer and date in the change evidence. Confirm upstream provenance independently; the smoke script tests digest resolution and Docker enforces content addressing but cannot independently establish that an attacker-supplied digest is the correct official image.

```sh
export ERS_RECOVERY_PLATFORM='linux/arm64'  # Apple Silicon, or linux/amd64 on x86_64
export ERS_RECOVERY_BASE_IMAGE='python:3.12-slim-bookworm@sha256:PASTE_REVIEWED_64_LOWERCASE_HEX_DIGEST'
case "$ERS_RECOVERY_BASE_IMAGE" in *PASTE_*|*REPLACE_WITH*) echo 'ERS_GATEB BASE_IMAGE_PIN_MISSING FAIL'; exit 1;; esac
```

The base image is pinned; apt dependencies are installed from Debian Bookworm repositories during the Docker build. This is not a fully reproducible, package-version-pinned build: retain the produced image digest and package listing as evidence. Review the resulting package manifest and CVEs under the organization's image policy before Production-host distribution. The container never grants Production access by itself. OpenSSL installed *inside* the container is root-owned by image filesystem construction. Gate B.4 tests its privileged-safe path **inside that Linux container**, removing the macOS Homebrew ownership obstacle. A separate Production writer must still satisfy its own explicit offline and authorization controls; the smoke image does not perform issuance.

## Gate B.2 build and smoke test

```sh
make recovery-container-gateb-check
make recovery-container-gateb-smoke
```

Expected `ERS_GATEB IMAGE_BUILD PASS`, `ERS_GATEB DEPENDENCIES PASS`, `ERS_GATEB CONTAINER_SMOKE PASS`, `ERS_GATEB CONTAINER_CLEANUP PASS`. The smoke container runs with `--network none`, read-only filesystem, all Linux capabilities dropped, no new privileges, ephemeral `/tmp`, no published ports and no mounts. Tests verify Python 3.12, SQLite integrity, OpenSSL Ed25519 signatures, Docker CLI availability, SHA tooling and recovery script syntax. These are dependency checks, **not** live credential issuance or password reset.

The script creates uniquely named `ers-gateb-smoke-*` containers and image tags and removes only those it created, even on failure. It does not stop or prune unrelated Docker resources. On a successful exit, verify independently:

```sh
docker ps -a --filter 'name=ers-gateb-smoke-' --format '{{.Names}}'
docker ps --format '{{.Ports}}'
```

The first command must show no containers *created by this Gate B invocation*. If older Gate B containers exist from unrelated runs, investigate each separately rather than running a broad prune. The smoke does not publish or bind port 8080; verify any port occupancy only against the pre-test baseline. The test-created image is deleted by default; `ERS_GATEB_KEEP_IMAGE=1` keeps only the tagged image for explicitly approved inspection. Remove that exact tag afterward (`docker image rm <recorded-tag>`), not all images.

## Gate B.3 promotion checks and boundaries

```sh
make emergency-admin-recovery-check
make promotion-readiness-check
make local-check
```

Require all three plus the exact-SHA CI run. CI's Gate B regression is offline and intentionally does **not** attempt Docker-in-Docker or require privileged GitHub runners; a real Gate B.2 build on a Docker-enabled host is a separate signed acceptance record. The container is *not* presently certified as a full Production recovery execution environment: the isolated rehearsal relies on Go tooling, live S3 version verification and actual human approvals, and those external capabilities have not been exercised inside this image. Stop and obtain a separate approved capability/rehearsal design before using this image for a Production operation. Do not copy private signing keys or credentials into an image or allow access to Production SQLite through the smoke test.

**Promotion blockers:** placeholder/unreviewed digest, wrong architecture, build/dependency failure, unclean test-created containers, missing CI and LOCAL tests, or any attempt to treat smoke success as evidence of a successful real-backup restoration or human login recovery.

## Gate B.4 — Approved image lock and in-container privileged-path verification (LOCAL)

**Purpose:** Complete the containerization decision. The Mac's Homebrew executable
is **not** the privileged Production verifier. A root-controlled OpenSSL inside
an immutable, reviewed Linux image is checked with the original signed fixture.
This is a non-Production, no-secret check; Docker Desktop is sufficient.

**Prerequisites:** B.1 digest provenance reviewed; B.2 and B.3 already passed.
Commit the Gate B.4/B.5 integration and obtain green CI for that **new** SHA
before running this exact-commit check. Keep your previously reviewed
`ERS_RECOVERY_BASE_IMAGE` (complete 64-hex digest) and
`ERS_RECOVERY_PLATFORM=linux/arm64` (Apple Silicon) in the same terminal.
The approved image is a new retained image, distinct from the automatically
removed B.2 smoke image; this is **not** a repeat of B.2.

From the repository root on the Mac, with a clean source tree:

```bash
mkdir -p "$HOME/.ers-recovery"
chmod 700 "$HOME/.ers-recovery"
export ERS_RECOVERY_LOCK="$HOME/.ers-recovery/gate-b-approved-image-lock.json"
test ! -e "$ERS_RECOVERY_LOCK" || { echo 'ERS_GATEB4 LOCK_ALREADY_EXISTS FAIL'; exit 1; }
make recovery-container-locked-build
make recovery-container-locked-host-check
```

A Dockerfile-specific `ops/recovery/Dockerfile.dockerignore` excludes environment files, credentials, backups, databases and unrelated source from the build context.

The builder validates the reviewed base-image reference, builds the image from
the exact clean Git checkout, inspects the platform and OCI revision/base labels,
records the image's immutable `sha256:` ID, and writes a 0600 lock **once**.
The launcher rechecks its own SHA and the locked image ID and launches by ID,
never by mutable tag. Inside the Linux container it runs the **existing**
`host-check --require-privileged-safe-path` against `/usr/bin/openssl` and the
committed Ed25519 fixture. No host OpenSSL ownership test is required on macOS.

**PASS:** The build prints `ERS_GATEB4 APPROVED_IMAGE_BUILD PASS` and
`ERS_GATEB4 IMAGE_ID=sha256:...`; the host check prints
`ERS_GATEB4 CRYPTO_INSIDE_CONTAINER PASS` and
`ERS_GATEB5 LOCAL_CONTAINER_POLICY PASS` and exits 0. The lock retains the
image ID; you do **not** need `/tmp/ers-gateb-image-id` or manual image-ID
extraction. The container is removed after execution, whether it passes or
fails. The image is intentionally **retained** for the approved lock.

**FAIL/BLOCKED:** source not clean, digest invalid, build failure, missing or
changed image/OCI labels, launcher hash mismatch, owner/mode error, signature
probe failure, or container cleanup failure. Never disable these checks.

## Gate B.5 — Protected Linux launcher contract (not a live recovery test)

The `local-host-check` above also verifies the actual B.5 Docker launch policy:
content-addressed image ID, no network, no bind mounts, no Docker socket,
read-only root filesystem, all capabilities dropped, no-new-privileges,
resource limits, isolated `/tmp`, and exact test-container cleanup. The offline
regression exercises rejection of altered locks, image substitution, insecure
permissions, Production flags on LOCAL, and failed Docker execution:

```bash
make recovery-container-locked-launcher-check
```

**B.5 LOCAL PASS:** The `ERS_GATEB5 LOCAL_CONTAINER_POLICY PASS` marker from
B.4 and `ERS_GATEB LOCKED_LAUNCHER_REGRESSION PASS` marker from the offline
regression are recorded. Do not run `sudo install`, Linux `stat -c`, or
`sha256sum` on the Mac, and do not perform live recovery in Gate B.

**Separate Production-host preflight, only before a separately approved
Production operation:** Transfer the approved image by an independently
checked offline image archive or approved secure registry mechanism; verify the
loaded `docker image inspect` ID matches the approved lock. Provision
`/usr/local/sbin/ers-recovery-container-host.py` as root:root mode 0500 and
`/etc/ers-recovery/image-lock.json` as root:root mode 0600, in root-controlled
ancestor directories on **Linux**, not on macOS. Never mount the Docker socket
into the container. The authorized root operator may then execute the
**read-only** check:

```bash
sudo env APP_ENV=production python3 /usr/local/sbin/ers-recovery-container-host.py \
  production-host-check --lock /etc/ers-recovery/image-lock.json
```

The protected-host command refuses non-Linux/non-root execution, a writable or
non-root-owned launcher, image lock, or Docker client/Python interpreter, changed launcher hash,
wrong image or labels, and any failed cryptographic/container check. It does
**not** connect to or stop the Production backend, mount a Production database,
issue tokens, or change roles. It is not an authorization for Production recovery.

**Important boundary:** The root-controlled production **writer** and
restored-backup / two-owner end-to-end rehearsal remain separate later
acceptance requirements. This patch closes the container-based Gate B host
verification and safe-launch contract; it does **not** silently replace the
`issue` tool's existing offline backend gate with a spoofable environment flag
or give the smoke container access to Production data. Do not promote the
container to a Production credential-writing tool without a separate reviewed
writer integration, independently authorized operation, and full rehearsal.
