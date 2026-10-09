#!/usr/bin/env python3
"""Regression coverage for Bite 33.3.2 Hetzner/S3 off-host backup transport."""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import sqlite3
import subprocess
import tempfile
import threading
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"


def run(cmd, env=None, cwd=ROOT, timeout=180):
    return subprocess.run(cmd, cwd=cwd, env=env, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=False, timeout=timeout)


def ok(proc, context):
    if proc.returncode != 0:
        raise AssertionError(f"{context} failed ({proc.returncode}):\n{proc.stdout}")


def bad(proc, context, needle):
    if proc.returncode == 0 or needle not in proc.stdout:
        raise AssertionError(f"{context} did not fail with {needle!r}:\n{proc.stdout}")


def build_tools(root: Path) -> tuple[Path, Path]:
    bindir = root / "bin"; bindir.mkdir()
    backup = bindir / "ers-backup"; offhost = bindir / "ers-offhost-backup"
    for path, package in ((backup, "./cmd/ers-backup"), (offhost, "./cmd/ers-offhost-backup")):
        proc = run(["go", "build", "-o", str(path), package], cwd=BACKEND)
        ok(proc, f"build {package}")
    return backup, offhost


def make_db(path: Path):
    con = sqlite3.connect(path)
    con.executescript('''
    CREATE TABLE schema_migrations(filename TEXT PRIMARY KEY, applied_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE tenants(id TEXT PRIMARY KEY,name TEXT); CREATE TABLE global_people(id TEXT PRIMARY KEY,name TEXT);
    CREATE TABLE person_tenant_memberships(id TEXT PRIMARY KEY,person_id TEXT,tenant_id TEXT);
    CREATE TABLE auth_user_accounts(id TEXT PRIMARY KEY,login TEXT); CREATE TABLE authz_actors(id TEXT PRIMARY KEY,actor_key TEXT);
    CREATE TABLE authz_actor_role_grants(id TEXT PRIMARY KEY,actor_id TEXT); CREATE TABLE collaborator_journeys(id TEXT PRIMARY KEY,membership_id TEXT);
    CREATE TABLE ledger_entries(id TEXT PRIMARY KEY,tenant_id TEXT); CREATE TABLE work_periods(id TEXT PRIMARY KEY,tenant_id TEXT);
    INSERT INTO schema_migrations(filename) VALUES('000077_journey_bonus_award_approval.up.sql');
    INSERT INTO tenants VALUES('t','T'); INSERT INTO global_people VALUES('p','P'); INSERT INTO person_tenant_memberships VALUES('m','p','t');
    INSERT INTO auth_user_accounts VALUES('a','x@example.test'); INSERT INTO authz_actors VALUES('z','z'); INSERT INTO authz_actor_role_grants VALUES('g','z');
    INSERT INTO collaborator_journeys VALUES('j','m'); INSERT INTO ledger_entries VALUES('l','t'); INSERT INTO work_periods VALUES('w','t');
    '''); con.commit(); con.close()


def write_credentials(path: Path, profile="ers-backup", access="TESTACCESS", secret="TESTSECRET"):
    path.write_text(f"[{profile}]\naws_access_key_id={access}\naws_secret_access_key={secret}\n")


def write_s3_env(path: Path, endpoint: str, credentials: Path, *, app_env="development", enabled="true", transport="s3", region="test-region", bucket="ers-test", prefix="ers-backups"):
    path.write_text(
        f"APP_ENV={app_env}\n"
        f"SERVER_OFFHOST_BACKUP_ENABLED={enabled}\n"
        f"SERVER_OFFHOST_BACKUP_TRANSPORT={transport}\n"
        f"SERVER_OFFHOST_BACKUP_S3_ENDPOINT={endpoint}\n"
        f"SERVER_OFFHOST_BACKUP_S3_REGION={region}\n"
        f"SERVER_OFFHOST_BACKUP_S3_BUCKET={bucket}\n"
        f"SERVER_OFFHOST_BACKUP_S3_PREFIX={prefix}\n"
        f"AWS_SHARED_CREDENTIALS_FILE={credentials}\n"
        "AWS_PROFILE=ers-backup\n"
    )


def _hmac(key: bytes, value: str) -> bytes:
    return hmac.new(key, value.encode(), hashlib.sha256).digest()


class FakeS3State:
    def __init__(self, secret="TESTSECRET"):
        self.secret = secret
        self.objects: dict[tuple[str, str, str], bytes] = {}
        self.versions: dict[tuple[str, str], list[str]] = {}
        self.counter = 0
        self.authenticated_requests = 0
        self.lock = threading.Lock()

    def put(self, bucket: str, key: str, data: bytes) -> str:
        with self.lock:
            self.counter += 1
            version = f"v{self.counter:06d}"
            self.objects[(bucket, key, version)] = data
            self.versions.setdefault((bucket, key), []).append(version)
            return version

    def get(self, bucket: str, key: str, version: str) -> bytes | None:
        return self.objects.get((bucket, key, version))


class FakeS3Handler(BaseHTTPRequestHandler):
    server_version = "ERSFakeS3/1"

    def log_message(self, *_):
        pass

    @property
    def state(self) -> FakeS3State:
        return self.server.state  # type: ignore[attr-defined]

    def _parts(self):
        parsed = urllib.parse.urlsplit(self.path)
        parts = [urllib.parse.unquote(p) for p in parsed.path.split("/") if p]
        if len(parts) < 2:
            return None
        return parsed, parts[0], "/".join(parts[1:])

    def _authorized(self, body: bytes) -> bool:
        auth = self.headers.get("Authorization", "")
        if not auth.startswith("AWS4-HMAC-SHA256 "):
            return False
        fields = {}
        for piece in auth[len("AWS4-HMAC-SHA256 "):].split(","):
            if "=" in piece:
                k, v = piece.strip().split("=", 1); fields[k] = v
        credential = fields.get("Credential", "")
        signed_headers = fields.get("SignedHeaders", "")
        signature = fields.get("Signature", "")
        try:
            access, scope = credential.split("/", 1)
            date, region, service, terminal = scope.split("/")
        except ValueError:
            return False
        if access != "TESTACCESS" or service != "s3" or terminal != "aws4_request":
            return False
        payload_hash = hashlib.sha256(body).hexdigest()
        if self.headers.get("x-amz-content-sha256") != payload_hash:
            return False
        parsed = urllib.parse.urlsplit(self.path)
        names = signed_headers.split(";")
        canonical_headers = "".join(f"{name}:{self.headers.get(name, '').strip()}\n" for name in names)
        canonical_request = "\n".join([
            self.command, parsed.path, parsed.query, canonical_headers, signed_headers, payload_hash,
        ])
        amz_date = self.headers.get("x-amz-date", "")
        string_to_sign = "AWS4-HMAC-SHA256\n" + amz_date + "\n" + scope + "\n" + hashlib.sha256(canonical_request.encode()).hexdigest()
        k_date = _hmac(("AWS4" + self.state.secret).encode(), date)
        k_region = _hmac(k_date, region); k_service = _hmac(k_region, "s3"); k_signing = _hmac(k_service, "aws4_request")
        expected = hmac.new(k_signing, string_to_sign.encode(), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, signature):
            return False
        self.state.authenticated_requests += 1
        return True

    def do_PUT(self):
        parts = self._parts()
        if not parts:
            self.send_error(400); return
        _, bucket, key = parts
        length = int(self.headers.get("Content-Length", "0")); body = self.rfile.read(length)
        if not self._authorized(body):
            self.send_error(403, "bad signature"); return
        version = self.state.put(bucket, key, body)
        self.send_response(200); self.send_header("x-amz-version-id", version); self.end_headers()

    def do_GET(self):
        parts = self._parts()
        if not parts:
            self.send_error(400); return
        parsed, bucket, key = parts
        if not self._authorized(b""):
            self.send_error(403, "bad signature"); return
        version = urllib.parse.parse_qs(parsed.query).get("versionId", [""])[0]
        data = self.state.get(bucket, key, version)
        if data is None:
            self.send_error(404); return
        self.send_response(200); self.send_header("Content-Length", str(len(data))); self.send_header("x-amz-version-id", version); self.end_headers(); self.wfile.write(data)


def start_fake_s3():
    state = FakeS3State()
    server = ThreadingHTTPServer(("127.0.0.1", 0), FakeS3Handler)
    server.state = state  # type: ignore[attr-defined]
    thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
    return server, state, f"http://127.0.0.1:{server.server_port}"


def test_s3_round_trip(backup_tool: Path, offhost_tool: Path):
    server, state, endpoint = start_fake_s3()
    try:
        with tempfile.TemporaryDirectory(prefix="ers-3332-s3-") as td:
            root = Path(td); b = root / "app-20261009T120000Z.db"; make_db(b); m = Path(str(b) + ".manifest.json")
            p = run([str(backup_tool), "create-manifest", "--backup", str(b), "--manifest", str(m), "--environment", "development", "--source-container", "manual", "--source-database-path", "/app/data/app.db", "--created-at", "2026-10-09T12:00:00Z"]); ok(p, "create manifest")
            credentials = root / "credentials"; write_credentials(credentials)
            cfg = root / ".env.development"; write_s3_env(cfg, endpoint, credentials)
            p = run([str(offhost_tool), "replicate", "--environment", "development", "--env-file", str(cfg), "--backup", str(b)]); ok(p, "S3 replicate")
            receipt_path = Path(str(b) + ".offhost.json")
            receipt = json.loads(receipt_path.read_text())
            if receipt["transport"] != "s3": raise AssertionError("S3 receipt transport missing")
            for name in ("backup", "manifest"):
                ref = receipt["remote"][name]
                if not ref.get("key") or not ref.get("version_id") or not ref.get("sha256"): raise AssertionError(f"missing exact S3 {name} evidence")
            if "TESTSECRET" in receipt_path.read_text(): raise AssertionError("S3 secret leaked into receipt")
            db_ref = receipt["remote"]["backup"]; manifest_ref = receipt["remote"]["manifest"]
            before = (len(state.versions[("ers-test", db_ref["key"])]), len(state.versions[("ers-test", manifest_ref["key"])]))
            p = run([str(offhost_tool), "verify-replica", "--environment", "development", "--env-file", str(cfg), "--receipt", str(receipt_path)]); ok(p, "S3 exact-version verify")
            hidden_db = root / "hidden.db"; hidden_manifest = root / "hidden.manifest.json"; b.rename(hidden_db); m.rename(hidden_manifest)
            p = run([str(offhost_tool), "verify-replica", "--environment", "development", "--env-file", str(cfg), "--receipt", str(receipt_path)]); ok(p, "S3 verify without local backup pair")
            hidden_db.rename(b); hidden_manifest.rename(m)
            p = run([str(offhost_tool), "replicate", "--environment", "development", "--env-file", str(cfg), "--backup", str(b)]); ok(p, "S3 idempotent retry")
            after = (len(state.versions[("ers-test", db_ref["key"])]), len(state.versions[("ers-test", manifest_ref["key"])]))
            if before != after: raise AssertionError(f"retry created replacement object versions: before={before} after={after}")
            state.objects[("ers-test", db_ref["key"], db_ref["version_id"])] += b"tamper"
            p = run([str(offhost_tool), "verify-replica", "--environment", "development", "--env-file", str(cfg), "--receipt", str(receipt_path)]); bad(p, "tampered exact S3 version", "mismatch")
            if state.authenticated_requests < 6: raise AssertionError("fake S3 endpoint did not observe signed requests")
    finally:
        server.shutdown(); server.server_close()


def test_config(offhost_tool: Path):
    with tempfile.TemporaryDirectory(prefix="ers-3332-config-") as td:
        root = Path(td); credentials = root / "credentials"; write_credentials(credentials)
        prod = root / "prod.env"; write_s3_env(prod, "https://hel1.your-objectstorage.com", credentials, app_env="production", region="hel1", bucket="ers")
        p = run([str(offhost_tool), "check-config", "--environment", "production", "--env-file", str(prod), "--runtime-files"]); ok(p, "valid Production Hetzner S3 config")
        disabled = root / "disabled.env"; write_s3_env(disabled, "https://hel1.your-objectstorage.com", credentials, app_env="production", enabled="false", region="hel1", bucket="ers")
        bad(run([str(offhost_tool), "status", "--environment", "production", "--env-file", str(disabled)]), "Production disabled", "requires SERVER_OFFHOST_BACKUP_ENABLED=true")
        ssh = root / "ssh.env"; write_s3_env(ssh, "https://hel1.your-objectstorage.com", credentials, app_env="production", transport="ssh", region="hel1", bucket="ers")
        bad(run([str(offhost_tool), "check-config", "--environment", "production", "--env-file", str(ssh)]), "Production SSH transport", "TRANSPORT=s3")
        wrong = root / "wrong.env"; write_s3_env(wrong, "https://fsn1.your-objectstorage.com", credentials, app_env="production", region="hel1", bucket="ers")
        bad(run([str(offhost_tool), "check-config", "--environment", "production", "--env-file", str(wrong)]), "Production endpoint mismatch", "must be https://hel1.your-objectstorage.com")
        insecure = root / "http.env"; write_s3_env(insecure, "http://hel1.your-objectstorage.com", credentials, app_env="production", region="hel1", bucket="ers")
        bad(run([str(offhost_tool), "check-config", "--environment", "production", "--env-file", str(insecure)]), "Production HTTP S3", "must use HTTPS")
        missing_profile = root / "missing.env"; write_s3_env(missing_profile, "https://hel1.your-objectstorage.com", credentials, app_env="production", region="hel1", bucket="ers")
        missing_profile.write_text(missing_profile.read_text().replace("AWS_PROFILE=ers-backup", "AWS_PROFILE=missing"))
        bad(run([str(offhost_tool), "check-config", "--environment", "production", "--env-file", str(missing_profile), "--runtime-files"]), "missing credentials profile", "must define aws_access_key_id")
        dev_disabled = root / "dev.env"; write_s3_env(dev_disabled, "http://127.0.0.1:1", credentials, enabled="false")
        p = run([str(offhost_tool), "status", "--environment", "development", "--env-file", str(dev_disabled)]); ok(p, "development disabled status")
        if p.stdout.strip() != "disabled": raise AssertionError(p.stdout)


def test_repository_contract():
    make = (ROOT / "Makefile").read_text(); docker = (BACKEND / "Dockerfile").read_text(); guard = (ROOT / "scripts" / "ers-environment-guard.sh").read_text(); ci = (ROOT / ".github/workflows/ci.yml").read_text(); deploy = (ROOT / ".github/workflows/deploy.yml").read_text(); example = (BACKEND / ".env.production.example").read_text()
    for frag in ("server-offhost-backup:", "server-offhost-backup-verify:", "run-backup-go-tool.sh ers-offhost-backup status", "run-backup-go-tool.sh ers-offhost-backup replicate", "off-host-backup-protection-check"):
        if frag not in make: raise AssertionError(f"Makefile missing {frag}")
    if "python3 scripts/ers-offhost-backup.py" in make or (ROOT / "scripts" / "ers-offhost-backup.py").exists(): raise AssertionError("Production off-host Python implementation still exists")
    for frag in ("go build -o /out/ers-offhost-backup ./cmd/ers-offhost-backup", "COPY --from=builder /out/ers-offhost-backup /app/ers-offhost-backup"):
        if frag not in docker: raise AssertionError(f"backend image missing {frag}")
    for frag in ("SERVER_OFFHOST_BACKUP_ENABLED must be true", "SERVER_OFFHOST_BACKUP_TRANSPORT must be s3", "SERVER_OFFHOST_BACKUP_S3_ENDPOINT", "AWS_SHARED_CREDENTIALS_FILE"):
        if frag not in guard: raise AssertionError(f"guard missing {frag}")
    for frag in ("SERVER_OFFHOST_BACKUP_TRANSPORT=s3", "SERVER_OFFHOST_BACKUP_S3_PREFIX=ers-backups", "AWS_PROFILE=ers-backup"):
        if frag not in example: raise AssertionError(f"Production example missing {frag}")
    if "make off-host-backup-protection-check" not in ci or "make off-host-backup-protection-check" not in deploy: raise AssertionError("CI/deploy missing 33.3 regression")


def main():
    with tempfile.TemporaryDirectory(prefix="ers-3332-go-tools-") as td:
        backup_tool, offhost_tool = build_tools(Path(td))
        test_s3_round_trip(backup_tool, offhost_tool)
        test_config(offhost_tool)
    test_repository_contract()
    print("Bite 33.3.2 Hetzner/S3 off-host backup protection verified with Go Production tooling.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
