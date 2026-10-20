#!/usr/bin/env python3
"""Gate B approved-image builder and read-only cryptographic container launcher.

LOCAL mode uses Docker Desktop; protected-host mode is Linux/root-only.
No command mounts a database, key, Docker socket, or secret, and no command
issues recovery credentials. Protected Production issuance requires separate
Gate D/E approval and a reviewed writer-capable integration.
"""
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import stat
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
PIN = re.compile(r'^python:3\.12-slim-bookworm@sha256:[0-9a-f]{64}$')
HASH = re.compile(r'^sha256:[0-9a-f]{64}$')
SOURCE = re.compile(r'^[0-9a-f]{40}$')
TAG = re.compile(r'^ers-gateb-approved:[0-9a-f]{12}$')
PLATFORMS = {'linux/amd64', 'linux/arm64'}
FIELDS = {'format', 'base_image', 'platform', 'source_sha', 'image_id',
          'image_tag', 'launcher_sha256', 'dockerfile_sha256', 'created_utc'}

class Refusal(Exception):
    pass


def require(ok, code):
    if not ok:
        raise Refusal(code)


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def protected_path(path):
    """Both configured and symlink-resolved components must be root controlled."""
    p = Path(path)
    require(p.is_absolute(), 'PROTECTED_PATH_NOT_ABSOLUTE')
    require(p.exists(), 'PROTECTED_PATH_MISSING')
    for entry in (p, p.resolve(strict=True)):
        chain = [entry]
        while chain[-1] != chain[-1].parent:
            chain.append(chain[-1].parent)
        for item in chain:
            metadata = item.lstat()
            require(metadata.st_uid == 0 and not (metadata.st_mode & 0o022),
                    'PROTECTED_PATH_UNTRUSTED')
    return p.resolve(strict=True)


def executable(name, protected=False):
    found = shutil.which(name)
    require(found is not None, 'DOCKER_CLI_MISSING')
    if protected:
        protected_path(found)
    return found


def docker_json(command, docker):
    proc = subprocess.run([docker, *command], capture_output=True, text=True)
    require(proc.returncode == 0, 'DOCKER_INSPECT_FAILED')
    try:
        return json.loads(proc.stdout)
    except ValueError:
        raise Refusal('DOCKER_INSPECT_INVALID') from None


def git_source():
    def git(*args):
        p = subprocess.run(['git', *args], cwd=ROOT, capture_output=True, text=True)
        require(p.returncode == 0, 'SOURCE_GIT_UNAVAILABLE')
        return p.stdout.strip()
    head = git('rev-parse', 'HEAD')
    require(SOURCE.fullmatch(head), 'SOURCE_SHA_INVALID')
    require(not git('status', '--porcelain'), 'SOURCE_DIRTY')
    return head


def build_lock(args):
    require(PIN.fullmatch(os.environ.get('ERS_RECOVERY_BASE_IMAGE', '')),
            'BASE_IMAGE_PIN_INVALID')
    platform = os.environ.get('ERS_RECOVERY_PLATFORM', '')
    require(platform in PLATFORMS, 'PLATFORM_INVALID')
    source = git_source()
    docker = executable('docker')
    tag = 'ers-gateb-approved:' + source[:12]
    require(not Path(args.lock).exists() and not Path(args.lock).is_symlink(), 'LOCK_ALREADY_EXISTS')
    # The directory is caller-controlled on LOCAL. A Production operator must
    # separately install an approved lock under root-controlled /etc/ers-recovery.
    require(Path(args.lock).is_absolute() and Path(args.lock).parent.is_dir(), 'LOCK_PATH_INVALID')
    require(subprocess.run([docker, 'buildx', 'imagetools', 'inspect',
                            os.environ['ERS_RECOVERY_BASE_IMAGE']], capture_output=True).returncode == 0,
            'PIN_NOT_RESOLVABLE')
    command = [docker, 'build', '--platform', platform,
               '--build-arg', 'ERS_RECOVERY_BASE_IMAGE=' + os.environ['ERS_RECOVERY_BASE_IMAGE'],
               '--build-arg', 'ERS_SOURCE_SHA=' + source,
               '-f', 'ops/recovery/Dockerfile', '-t', tag, '.']
    result = subprocess.run(command, cwd=ROOT)
    require(result.returncode == 0, 'IMAGE_BUILD_FAILED')
    info = docker_json(['image', 'inspect', tag], docker)
    require(isinstance(info, list) and len(info) == 1, 'IMAGE_INSPECT_INVALID')
    row = info[0]
    image_id = row.get('Id', '')
    require(HASH.fullmatch(image_id), 'IMAGE_ID_INVALID')
    require(row.get('Os') + '/' + row.get('Architecture') == platform, 'IMAGE_ARCH_MISMATCH')
    labels = (row.get('Config') or {}).get('Labels') or {}
    require(labels.get('org.opencontainers.image.revision') == source and
            labels.get('org.enterpriseremotesystems.recovery.base-image') == os.environ['ERS_RECOVERY_BASE_IMAGE'],
            'IMAGE_LABEL_MISMATCH')
    lock = {'format': 1, 'base_image': os.environ['ERS_RECOVERY_BASE_IMAGE'],
            'platform': platform, 'source_sha': source, 'image_id': image_id,
            'image_tag': tag, 'launcher_sha256': digest(__file__),
            'dockerfile_sha256': digest(ROOT/'ops/recovery/Dockerfile'),
            'created_utc': dt.datetime.now(dt.timezone.utc).isoformat()}
    fd = os.open(args.lock, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, 'O_NOFOLLOW', 0), 0o600)
    with os.fdopen(fd, 'w') as writer:
        json.dump(lock, writer, sort_keys=True, indent=2)
        writer.write('\n')
        writer.flush()
        os.fsync(writer.fileno())
    print('ERS_GATEB4 APPROVED_IMAGE_BUILD PASS')
    print('ERS_GATEB4 IMAGE_ID=' + image_id)
    print('ERS_GATEB4 LOCK_CREATED=' + args.lock)


def load_lock(path, protected):
    p = Path(path)
    require(p.is_absolute() and p.is_file() and not p.is_symlink(), 'LOCK_INVALID_PATH')
    if protected:
        protected_path(p)
        require(stat.S_IMODE(p.stat().st_mode) == 0o600, 'LOCK_MODE_INVALID')
        protected_path(Path(__file__).absolute())
        protected_path(Path(sys.executable))
    else:
        require(not (p.stat().st_mode & 0o077), 'LOCK_MODE_INVALID')
    try:
        lock = json.loads(p.read_text())
    except (ValueError, UnicodeError):
        raise Refusal('LOCK_JSON_INVALID') from None
    require(isinstance(lock, dict) and set(lock) == FIELDS and lock['format'] == 1,
            'LOCK_SCHEMA_INVALID')
    require(PIN.fullmatch(lock['base_image']) and lock['platform'] in PLATFORMS and
            SOURCE.fullmatch(lock['source_sha']) and HASH.fullmatch(lock['image_id']) and
            TAG.fullmatch(lock['image_tag']) and
            re.fullmatch('[0-9a-f]{64}', lock['launcher_sha256']) and
            re.fullmatch('[0-9a-f]{64}', lock['dockerfile_sha256']) and
            isinstance(lock['created_utc'], str), 'LOCK_VALUE_INVALID')
    require(lock['image_tag'] == 'ers-gateb-approved:' + lock['source_sha'][:12],
            'LOCK_IMAGE_TAG_MISMATCH')
    require(lock['launcher_sha256'] == digest(__file__), 'LAUNCHER_SHA_MISMATCH')
    return lock


def host_check(args):
    production = args.action == 'production-host-check'
    if production:
        require(sys.platform.startswith('linux') and os.geteuid() == 0,
                'PRODUCTION_LINUX_ROOT_REQUIRED')
        require(os.environ.get('APP_ENV') == 'production', 'PRODUCTION_ENV_REQUIRED')
    else:
        require(os.environ.get('APP_ENV') != 'production', 'LOCAL_PRODUCTION_ENV_FORBIDDEN')
    lock = load_lock(args.lock, production)
    if not production:
        require(git_source() == lock['source_sha'], 'SOURCE_SHA_MISMATCH')
        require(digest(ROOT/'ops/recovery/Dockerfile') == lock['dockerfile_sha256'],
                'DOCKERFILE_SHA_MISMATCH')
    docker = executable('docker', protected=production)
    rows = docker_json(['image', 'inspect', lock['image_id']], docker)
    require(isinstance(rows, list) and len(rows) == 1, 'LOCKED_IMAGE_MISSING')
    row = rows[0]
    require(row.get('Id') == lock['image_id'] and
            row.get('Os') + '/' + row.get('Architecture') == lock['platform'],
            'LOCKED_IMAGE_ID_OR_PLATFORM_MISMATCH')
    labels = (row.get('Config') or {}).get('Labels') or {}
    require(labels.get('org.opencontainers.image.revision') == lock['source_sha'] and
            labels.get('org.enterpriseremotesystems.recovery.base-image') == lock['base_image'],
            'LOCKED_IMAGE_LABEL_MISMATCH')
    # Always run by inspected, content-addressed IMAGE ID; never by a mutable tag.
    container = 'ers-gateb-locked-' + secrets.token_hex(8)
    command = [docker, 'run', '--name', container, '--pull', 'never',
               '--platform', lock['platform'], '--network', 'none', '--read-only',
               '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
               '--pids-limit', '64', '--memory', '256m',
               '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m',
               '--env', 'ERS_RECOVERY_OPENSSL_BIN=/usr/bin/openssl',
               '--entrypoint', 'python3', lock['image_id'],
               '/opt/ers/scripts/ers-emergency-admin-isolated-rehearsal.py',
               'host-check', '--require-privileged-safe-path']
    try:
        result = subprocess.run(command, capture_output=True, text=True)
        require(result.returncode == 0 and
                'ERS_REHEARSAL HOST_OPENSSL_PRIVILEGED_PATH PASS' in result.stdout and
                'ERS_REHEARSAL RECOVERY_HOST_OPENSSL PASS' in result.stdout,
                'CONTAINER_CRYPTO_CHECK_FAILED')
        print('ERS_GATEB4 CRYPTO_INSIDE_CONTAINER PASS')
    finally:
        subprocess.run([docker, 'rm', '-f', container], capture_output=True)
    remain = subprocess.run([docker, 'container', 'inspect', container], capture_output=True)
    require(remain.returncode != 0, 'TEST_CONTAINER_CLEANUP_FAILED')
    print('ERS_GATEB5 CONTAINER_ISOLATION_AND_CLEANUP PASS')
    if production:
        print('ERS_GATEB5 PRODUCTION_PROTECTED_HOST_CHECK PASS')
    else:
        print('ERS_GATEB5 LOCAL_CONTAINER_POLICY PASS')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='action', required=True)
    for name in ('build-lock', 'local-host-check', 'production-host-check'):
        part = sub.add_parser(name)
        part.add_argument('--lock', required=True, help='absolute file path')
    args = parser.parse_args()
    try:
        if args.action == 'build-lock':
            build_lock(args)
        else:
            host_check(args)
    except (OSError, Refusal, TypeError, KeyError) as e:
        code = str(e) if isinstance(e, Refusal) else 'HOST_LAUNCHER_RUNTIME_ERROR'
        print('ERS_GATEB ' + code + ' FAIL', file=sys.stderr)
        return 2
    return 0

if __name__ == '__main__':
    sys.exit(main())
