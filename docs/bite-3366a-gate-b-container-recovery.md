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

The base image is pinned; apt dependencies are installed from Debian Bookworm repositories during the Docker build. This is not a fully reproducible, package-version-pinned build: retain the produced image digest and package listing as evidence. Review the resulting package manifest and CVEs under the organization's image policy before Production-host distribution. The container never grants Production access by itself. OpenSSL installed *inside* the container is root-owned by image filesystem construction; the Production host's independent `ERS_RECOVERY_OPENSSL_BIN` controls still apply to any real host execution.

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
