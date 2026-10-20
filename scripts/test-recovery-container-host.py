#!/usr/bin/env python3
"""Offline, daemon-free security regression for the image-locked Gate B launcher."""
import json
import os
from pathlib import Path
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
LAUNCHER = ROOT / 'scripts/ers-recovery-container-host.py'
SOURCE = 'a' * 40
IMAGE_ID = 'sha256:' + 'b' * 64
BASE = 'python:3.12-slim-bookworm@sha256:' + 'c' * 64


def expect(predicate, message):
    if not predicate:
        raise AssertionError(message)


def run(*args, env):
    return subprocess.run(['python3', str(LAUNCHER), *args], cwd=ROOT,
                          env=env, capture_output=True, text=True, timeout=30)


def main():
    with tempfile.TemporaryDirectory(prefix='ers-gateb-launcher-test-') as t:
        root = Path(t)
        log = root/'docker.log'
        git = root/'git'
        git.write_text('''#!/usr/bin/env bash
set -eu
case "$1" in
 rev-parse) echo "$MOCK_SOURCE";;
 status) exit 0;;
 *) exit 9;;
esac
''')
        git.chmod(0o755)
        docker = root/'docker'
        docker.write_text('''#!/usr/bin/env python3
import json, os, sys
args=sys.argv[1:]
with open(os.environ['MOCK_LOG'],'a') as stream:
    stream.write(json.dumps(args)+'\\n')
if args[:2]==['image','inspect']:
    print(json.dumps([{'Id':os.getenv('MOCK_ID','sha256:'+'b'*64),
      'Os':'linux','Architecture':'arm64',
      'Config':{'Labels':{'org.opencontainers.image.revision':os.environ['MOCK_SOURCE'],
         'org.enterpriseremotesystems.recovery.base-image':os.environ['MOCK_BASE']}}}]))
elif args[:1]==['run']:
    if os.getenv('MOCK_RUN_FAIL')=='1':
        sys.exit(32)
    print('ERS_REHEARSAL HOST_OPENSSL_PRIVILEGED_PATH PASS')
    print('ERS_REHEARSAL RECOVERY_HOST_OPENSSL PASS')
elif args[:2]==['container','inspect']:
    sys.exit(1)
elif args[:1] in (['build'],['buildx'],['rm']):
    sys.exit(0)
else:
    sys.exit(8)
''')
        docker.chmod(0o755)
        base = dict(os.environ, PATH=str(root)+os.pathsep+os.environ['PATH'],
                    MOCK_LOG=str(log), MOCK_SOURCE=SOURCE, MOCK_BASE=BASE,
                    ERS_RECOVERY_PLATFORM='linux/arm64', ERS_RECOVERY_BASE_IMAGE=BASE)
        base.pop('APP_ENV', None)
        lock = root/'image-lock.json'
        proc = run('build-lock', '--lock', str(lock), env=base)
        expect(proc.returncode == 0 and 'APPROVED_IMAGE_BUILD PASS' in proc.stdout,
               f'valid lock build: {proc.stdout} {proc.stderr}')
        expect(lock.stat().st_mode & 0o077 == 0, 'lock must be private')
        proc = run('local-host-check', '--lock', str(lock), env=base)
        expect(proc.returncode == 0 and 'CRYPTO_INSIDE_CONTAINER PASS' in proc.stdout and
               'LOCAL_CONTAINER_POLICY PASS' in proc.stdout, f'valid launch: {proc.stdout} {proc.stderr}')
        calls = [json.loads(x) for x in log.read_text().splitlines()]
        runs = [x for x in calls if x and x[0] == 'run']
        expect(len(runs) == 1 and IMAGE_ID in runs[0], 'must execute by immutable image ID')
        invocation = runs[0]
        for required in ('--network','none','--read-only','--cap-drop','ALL','no-new-privileges',
                         '--pull','never','--pids-limit','--memory',
                         '--require-privileged-safe-path'):
            expect(required in invocation, f'missing container isolation: {required}')
        expect(all('/var/run/docker.sock' not in x and '--privileged' not in x and
                   '--volume' not in x and '--mount' not in x for x in invocation),
               'unapproved mount or elevated privilege')
        expect(any(x[:2] == ['rm','-f'] and x[2].startswith('ers-gateb-locked-') for x in calls),
               'cleanup failed')
        # The launcher must fail closed when the inspected image differs.
        proc = run('local-host-check', '--lock', str(lock), env=dict(base, MOCK_ID='sha256:'+'d'*64))
        expect(proc.returncode and 'LOCKED_IMAGE_ID_OR_PLATFORM_MISMATCH' in proc.stderr,
               'unapproved image accepted')
        proc = run('local-host-check', '--lock', str(lock), env=dict(base, MOCK_RUN_FAIL='1'))
        expect(proc.returncode and 'CONTAINER_CRYPTO_CHECK_FAILED' in proc.stderr,
               'failed signature verifier accepted')
        original = lock.read_text()
        document = json.loads(original)
        document['launcher_sha256'] = 'e'*64
        lock.write_text(json.dumps(document))
        proc = run('local-host-check', '--lock', str(lock), env=base)
        expect(proc.returncode and 'LAUNCHER_SHA_MISMATCH' in proc.stderr,
               'altered launcher hash accepted')
        lock.write_text(original)
        os.chmod(lock, 0o644)
        proc = run('local-host-check', '--lock', str(lock), env=base)
        expect(proc.returncode and 'LOCK_MODE_INVALID' in proc.stderr,
               'public-readable lock accepted')
        os.chmod(lock, 0o600)
        proc = run('production-host-check', '--lock', str(lock), env=base)
        expect(proc.returncode and ('PRODUCTION_LINUX_ROOT_REQUIRED' in proc.stderr or
                                     'PRODUCTION_ENV_REQUIRED' in proc.stderr),
               'local runner accepted Production root operation')
        proc = run('local-host-check', '--lock', str(lock), env=dict(base, APP_ENV='production'))
        expect(proc.returncode and 'LOCAL_PRODUCTION_ENV_FORBIDDEN' in proc.stderr,
               'local runner accepted Production mode')
        proc = run('build-lock', '--lock', str(lock), env=dict(base, ERS_RECOVERY_BASE_IMAGE='BAD'))
        expect(proc.returncode and 'BASE_IMAGE_PIN_INVALID' in proc.stderr,
               'unreviewed image pin accepted')
    dockerfile = (ROOT/'ops/recovery/Dockerfile').read_text()
    ignore = (ROOT/'ops/recovery/Dockerfile.dockerignore').read_text()
    expect('org.opencontainers.image.revision' in dockerfile and
           'ers-emergency-admin-isolated-rehearsal.py' in dockerfile and
           'emergency-recovery-host-probe' in dockerfile,
           'image missing revision or signed fixture')
    expect('**' in ignore and '!scripts/ers-emergency-admin-isolated-rehearsal.py' in ignore and
           '!scripts/testdata/emergency-recovery-host-probe/**' in ignore,
           'Docker build context does not explicitly exclude unrelated secrets')
    print('ERS_GATEB LOCKED_LAUNCHER_REGRESSION PASS')


if __name__ == '__main__':
    main()
