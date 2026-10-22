#!/usr/bin/env python3
"""Offline regression for Gate C. No Docker daemon, owners, or Production access."""
import ast
import contextlib
import datetime as dt
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tarfile
import tempfile
import types
from unittest import mock

HERE = Path(__file__).resolve().parent

def load(name):
    spec = importlib.util.spec_from_file_location(name.replace('-', '_'), HERE / name)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

pkg = load('ers-gatec-package.py')
owner = load('ers-gatec-owner-key.py')
public = load('ers-gatec-public-keys.py')
custody = load('ers-gatec-custody.py')
SOURCE = 'a' * 40
BASE = 'python:3.12-slim-bookworm@sha256:' + 'b' * 64
SPKI = bytes.fromhex('302a300506032b6570032100')

def blob(raw):
    return {'digest': 'sha256:' + hashlib.sha256(raw).hexdigest(), 'size': len(raw)}

def add(tar, name, raw):
    info = tarfile.TarInfo(name)
    info.size = len(raw)
    info.mode = 0o600
    tar.addfile(info, io.BytesIO(raw))

def fixture(root):
    root.mkdir(parents=True, exist_ok=True)
    conf = json.dumps({'os': 'linux', 'architecture': 'arm64', 'config': {'Labels': {
        'org.opencontainers.image.revision': SOURCE,
        'org.enterpriseremotesystems.recovery.base-image': BASE
    }}}).encode()
    layer = b'example OCI layer data\0'
    manifest = json.dumps({'schemaVersion': 2, 'config': blob(conf), 'layers': [blob(layer)]}).encode()
    inner = json.dumps({'schemaVersion': 2, 'manifests': [dict(blob(manifest), platform={'os': 'linux', 'architecture': 'arm64'})]}).encode()
    index = json.dumps({'schemaVersion': 2, 'manifests': [blob(inner)]}).encode()
    with tarfile.open(root / 'ers-approved-image.tar', 'w') as t:
        add(t, 'index.json', index)
        for data in (conf, layer, manifest, inner):
            add(t, 'blobs/sha256/' + blob(data)['digest'][7:], data)
    image_id = blob(inner)['digest']
    (root / 'ers-approved-image-id.txt').write_text(image_id + '\n')
    sha = pkg.digest_file(root / 'ers-approved-image.tar')
    (root / 'ers-approved-image-sha256.txt').write_text(sha + '\n')
    return image_id, sha

def refused(f, *a, **kw):
    try: f(*a, **kw)
    except (pkg.Failure, owner.Failure, public.Failure, custody.Failure): return
    raise AssertionError('unsafe input accepted by ' + f.__name__)

def package_tests(root):
    d = root / 'package'
    image_id, sha = fixture(d)
    assert pkg.load_package(d, image_id, platform='linux/arm64', source=SOURCE, base=BASE) == image_id
    refused(pkg.load_package, d, 'sha256:' + 'f' * 64)
    refused(pkg.load_package, d, expected_sha='f' * 64)
    refused(pkg.load_package, d, platform='linux/amd64')
    refused(pkg.load_package, d, source='0' * 40)
    refused(pkg.load_package, d, base='incorrect')
    (d / 'ers-approved-image-id.txt').write_text('')
    refused(pkg.load_package, d)
    (d / 'ers-approved-image-id.txt').write_text(image_id + '\n')
    with (d / 'ers-approved-image.tar').open('ab') as f: f.write(b'altered')
    refused(pkg.load_package, d)
    # Bypass outer checksum to prove inner chain still rejects corrupted referenced blobs.
    (d / 'ers-approved-image-sha256.txt').write_text(pkg.digest_file(d / 'ers-approved-image.tar') + '\n')
    # The trailing tar bytes do not alter the referenced OCI digests; acceptance relies on
    # independently authenticated SHA for owner B and approved image ID for owner A.
    refused(pkg.load_package, d, expected_sha=sha)
    (d / 'ers-approved-image.tar').unlink()
    fixture(d)
    assert pkg.load_package(d, expected_sha=pkg.digest_file(d / 'ers-approved-image.tar')) == image_id
    # Damage a referenced blob but update the outer TAR checksum: internal OCI digest MUST fail.
    image_id, original_sha = fixture(d)
    altered = d / 'damaged.tar'
    with tarfile.open(d / 'ers-approved-image.tar','r') as orig, tarfile.open(altered,'w') as out:
        for item in orig:
            if not item.isfile():
                continue
            data = orig.extractfile(item).read()
            if item.name.startswith('blobs/sha256/') and b'example OCI layer data' in data:
                data = data.replace(b'example OCI layer data', b'changed OCI layer data')
            add(out,item.name,data)
    altered.replace(d / 'ers-approved-image.tar')
    (d / 'ers-approved-image-sha256.txt').write_text(pkg.digest_file(d/'ers-approved-image.tar')+'\n')
    refused(pkg.load_package,d,expected_image_id=image_id)
    fixture(d)
    # A symlink must never be accepted as an archive file.
    (d / 'ers-approved-image.tar').rename(d / 'actual.tar')
    (d / 'ers-approved-image.tar').symlink_to(d / 'actual.tar')
    refused(pkg.load_package, d)
    def source_probe(args, **kwargs):
        if args[:2]==['git','rev-parse']:
            return types.SimpleNamespace(returncode=0,stdout='c'*40+'\n')
        if args[:2]==['git','merge-base']:
            return types.SimpleNamespace(returncode=0,stdout='')
        if args[:2]==['git','diff']:
            return types.SimpleNamespace(returncode=1,stdout='')
        raise AssertionError('unexpected Git command')
    with mock.patch.object(pkg.subprocess,'run',side_effect=source_probe):
        refused(pkg.verify_approved_source,root,SOURCE)
    print('ERS_GATEC OCI_AND_TRANSFER_REGRESSION PASS')
    return image_id

def owner_tests(root, image_id):
    home = root / 'owner-home'
    package = home / '.ers-recovery' / 'owner-enrollment-package'
    fixture(package)
    lock = package.parent / 'gate-b-approved-image-lock.json'
    lock.write_text(json.dumps({'image_id': image_id, 'source_sha': SOURCE,
                               'platform': 'linux/arm64', 'base_image': BASE}))
    original_run = subprocess.run
    base = home / '.ers-owner-recovery'
    real_stdout = io.StringIO()

    def fake_docker(args, passphrase=None, timeout=120):
        if args[:2] == ['image', 'inspect']:
            data = [{'Id': image_id, 'Os': 'linux', 'Architecture': 'arm64'}]
            return types.SimpleNamespace(returncode=0, stdout=json.dumps(data).encode(), stderr=b'')
        if args[:2] == ['rm', '-f']:
            return types.SimpleNamespace(returncode=1, stdout=b'', stderr=b'')
        if args[:2] == ['container', 'inspect']:
            return types.SimpleNamespace(returncode=1, stdout=b'', stderr=b'')
        assert args[0] == 'run' and '--network' in args and args[args.index('--network')+1] == 'none'
        assert '--pull' in args and args[args.index('--pull')+1] == 'never'
        mount = args[args.index('--mount')+1]
        pending = Path(mount.split('source=')[1].split(',')[0])
        assert str(pending).startswith(str(base))
        cmd = args[args.index('--entrypoint')+3:]
        cmd = ['openssl'] + [str(pending / v.rsplit('/', 1)[-1]) if v.startswith('/owner/') else v for v in cmd]
        # Simulate a Docker boundary with deterministic, NONREAL test-only fixture data.
        # Actual Ed25519 is verified by the approved container in the operator acceptance gate.
        assert passphrase == 'LongUniquePassphrase!42' and '-pass' in cmd or (passphrase == 'LongUniquePassphrase!42' and '-passin' in cmd)
        private_bytes = b'-----BEGIN ENCRYPTED PRIVATE KEY-----\nTEST-ONLY-NOT-A-KEY\n'
        public_bytes = b'-----BEGIN PUBLIC KEY-----\nTEST-ONLY-NOT-A-KEY\n'
        if cmd[1] == 'genpkey':
            (pending / 'owner-a-private.pem').write_bytes(private_bytes)
            return types.SimpleNamespace(returncode=0, stdout=b'', stderr=b'')
        assert cmd[1] == 'pkey'
        if '-out' in cmd:
            (pending / 'owner-a.pem').write_bytes(public_bytes)
            return types.SimpleNamespace(returncode=0, stdout=b'', stderr=b'')
        return types.SimpleNamespace(returncode=0, stdout=public_bytes, stderr=b'')

    class TTY:
        def isatty(self): return True
        def write(self, s): return len(s)
        def flush(self): pass
    # Owner A verification includes Git revision. It must never be bypassed in the actual tool.
    def fake_git(args, **kwargs):
        if args[:2] == ['git', 'rev-parse']:
            return types.SimpleNamespace(stdout=SOURCE+'\n', returncode=0)
        if args[:2] == ['git', 'diff']:
            return types.SimpleNamespace(stdout='', returncode=0)
        return original_run(args, **kwargs)

    with mock.patch.object(owner.Path, 'home', return_value=home), \
         mock.patch.object(owner, 'docker', side_effect=fake_docker), \
         mock.patch.object(owner.getpass, 'getpass', side_effect=['LongUniquePassphrase!42', 'LongUniquePassphrase!42']), \
         mock.patch.object(owner.sys, 'stdin', TTY()), mock.patch.object(owner.sys, 'stderr', TTY()), \
         mock.patch.object(owner.subprocess, 'run', side_effect=fake_git), \
         mock.patch.object(owner.sys, 'argv', ['keytool', '--slot', 'owner-a']), \
         contextlib.redirect_stdout(real_stdout):
        owner.own_key_main()
    active = home / '.ers-owner-recovery' / 'owner-a'
    assert (active / 'owner-a-private.pem').read_bytes().startswith(b'-----BEGIN ENCRYPTED PRIVATE KEY-----')
    assert (active / 'owner-a.pem').read_bytes().startswith(b'-----BEGIN PUBLIC KEY-----')
    assert 'OWNER_A_KEYPAIR_CREATED PASS' in real_stdout.getvalue()
    assert (active / 'owner-a.pem').read_text().startswith('-----BEGIN PUBLIC KEY-----')
    # No second run can silently overwrite a successfully created keypair.
    with mock.patch.object(owner.Path,'home',return_value=home), \
         mock.patch.object(owner,'docker',side_effect=fake_docker), \
         mock.patch.object(owner.sys,'stdin',TTY()), mock.patch.object(owner.sys,'stderr',TTY()), \
         mock.patch.object(owner.subprocess,'run',side_effect=fake_git), \
         mock.patch.object(owner.sys,'argv',['keytool','--slot','owner-a']), \
         contextlib.redirect_stdout(io.StringIO()):
        refused(owner.own_key_main)
    assert (active / 'owner-a-private.pem').is_file()
    print('ERS_GATEC ENCRYPTED_OWNER_KEY_REGRESSION PASS')

def trust_and_custody_tests(root):
    # Ed25519 X.509 SPKI DER format: 12-byte prefix + 32 public bytes.
    der_a, der_b = SPKI + b'\x01' * 32, SPKI + b'\x02' * 32
    assert len(der_a)==44 and len(der_b)==44
    fps = {'owner-a':hashlib.sha256(der_a).hexdigest(),
           'owner-b':hashlib.sha256(der_b).hexdigest()}
    assert len(fps['owner-a'])==64 and fps['owner-a']!=fps['owner-b']
    now = dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    rows = {slot:{'person_id':slot, 'witness_id':'independent-witness',
                  'custody_method':'TEST ONLY — NO HUMAN ATTESTATION',
                  'attested_at':now, 'public_key_sha256':fps[slot],
                  'owner_controls_private_key':True, 'private_key_excluded_from_production_host':True}
            for slot in ('owner-a','owner-b')}
    assert rows['owner-a']['person_id']!=rows['owner-b']['person_id']
    rows['owner-b']['person_id']='owner-a'
    assert rows['owner-a']['person_id']==rows['owner-b']['person_id']
    trust = root / 'trust'
    trust.mkdir()
    (trust/'gate-c-fingerprints.json').write_text(json.dumps(fps))
    record = root / 'incident' / 'owner-custody.json'
    answers = ['VERIFIED','person-a','witness-c','hardware protected by owner-a',now,
               'person-b','witness-c','hardware protected by owner-b',now]
    with mock.patch.object(custody,'TRUST',trust),mock.patch.object(custody,'RECORD',record), \
         mock.patch('builtins.input',side_effect=answers),contextlib.redirect_stdout(io.StringIO()):
        custody.main()
    doc=json.loads(record.read_text())
    assert set(doc['slots'])=={'owner-a','owner-b'}
    assert doc['slots']['owner-a']['public_key_sha256']==fps['owner-a']
    assert (record.stat().st_mode & 0o777)==0o600
    with mock.patch.object(custody,'TRUST',trust),mock.patch.object(custody,'RECORD',record), \
         mock.patch('builtins.input',side_effect=answers),contextlib.redirect_stdout(io.StringIO()):
        refused(custody.main)
    print('ERS_GATEC PUBLIC_FINGERPRINT_AND_CUSTODY_CONTRACT PASS')


def optional_native_crypto():
    # macOS's system OpenSSL may lack Ed25519. Gate C ALWAYS performs real crypto
    # inside the approved Docker image; do not make LOCAL offline tests depend on it.
    if not shutil.which('openssl'):
        print('ERS_GATEC HOST_ED25519_INTEGRATION SKIPPED (Docker acceptance required)')
        return
    with tempfile.TemporaryDirectory() as d:
        a=Path(d)/'private.pem'; b=Path(d)/'public.pem'
        passwd=b'correct-test-passphrase-42\n'
        run=subprocess.run(['openssl','genpkey','-algorithm','ED25519','-aes-256-cbc',
                            '-pass','stdin','-out',str(a)],input=passwd,capture_output=True)
        if run.returncode!=0:
            print('ERS_GATEC HOST_ED25519_INTEGRATION SKIPPED (Docker acceptance required)')
            return
        pub=subprocess.run(['openssl','pkey','-in',str(a),'-passin','stdin','-pubout','-out',str(b)],
                           input=passwd,capture_output=True)
        assert pub.returncode == 0, 'could not derive Ed25519 test public key'
        wrong=subprocess.run(['openssl','pkey','-in',str(a),'-passin','stdin','-pubout'],
                             input=b'wrong\n',capture_output=True)
        assert wrong.returncode != 0
    print('ERS_GATEC HOST_ED25519_INTEGRATION PASS')

def main():
    for script in list(HERE.glob('ers-gatec-*.py'))+[HERE/'test-gatec-offline.py']:
        ast.parse(script.read_text(), filename=str(script), feature_version=(3,9))
    print('ERS_GATEC PYTHON39_SYNTAX PASS')
    with tempfile.TemporaryDirectory(prefix='ers-gatec-offline-') as tmp:
        root=Path(tmp)
        image_id=package_tests(root)
        owner_tests(root,image_id)
        trust_and_custody_tests(root)
        optional_native_crypto()
    print('ERS_GATEC OFFLINE_REGRESSION PASS')

if __name__ == '__main__':
    main()
