#!/usr/bin/env python3
"""Offline Production credential cutover safety regression; no network or credentials."""
import os
from pathlib import Path
import subprocess
import sys
import tempfile

TOOL = Path(__file__).with_name('ers-production-credential-cutover.py')

def private(path, data):
    path.write_text(data)
    path.chmod(0o600)
    return path

def attempt(root, *, apply=False, approve=False, confirm=False):
    cmd = [sys.executable, str(TOOL), '--env-file', str(root/'production.env'),
           '--runtime-fragment', str(root/'runtime.env'), '--aws-fragment', str(root/'aws.env'),
           '--aws-target', str(root/'secrets/aws-credentials')]
    if apply: cmd.append('--apply')
    if approve: cmd.append('--approve-ledger-activation')
    if confirm: cmd += ['--confirm', 'INSTALL_PRODUCTION_CREDENTIALS']
    p = subprocess.run(cmd, capture_output=True, text=True)
    assert all(s not in p.stdout+p.stderr for s in ('jwtvalue', 'correctionvalue', 'settlementvalue', 'accessvalue', 'secretvalue'))
    return p

def main():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        secret_dir = root/'secrets'; secret_dir.mkdir(mode=0o700)
        target = secret_dir/'aws-credentials'
        original = (f'APP_ENV=production\nDEV_SEED_ADMIN=false\nDEV_ADMIN_PASSWORD=\n'
                    f'AUTHZ_BOOTSTRAP_ENABLED=false\nLLM_COACHING_ENABLED=false\n'
                    f'AWS_SHARED_CREDENTIALS_FILE={target}\nAWS_PROFILE=ers-backup\n'
                    'JWT_SECRET=jwtvalue\nLEDGER_CORRECTION_KEY=\nLEDGER_SETTLEMENT_KEY=\n')
        private(root/'production.env', original)
        private(root/'runtime.env', 'JWT_SECRET=jwtvalue\nLEDGER_CORRECTION_KEY=correctionvalue\nLEDGER_SETTLEMENT_KEY=settlementvalue\n')
        private(root/'aws.env', '[ers-backup]\naws_access_key_id = accessvalue\naws_secret_access_key = secretvalue\n')
        assert attempt(root).returncode != 0, 'ledger activation must be explicitly approved'
        assert attempt(root, approve=True).returncode == 0
        assert (root/'production.env').read_text() == original
        assert not target.exists(), 'dry-run may not install backup credentials'
        assert attempt(root, apply=True, approve=True).returncode != 0, 'apply requires confirmation'
        assert attempt(root, apply=True, approve=True, confirm=True).returncode == 0
        assert target.stat().st_mode & 0o777 == 0o600
        assert (root/'production.env').stat().st_mode & 0o777 == 0o600
        assert attempt(root, apply=True, confirm=True).returncode == 0, 'idempotent rerun'
        baseline = (root/'production.env').read_bytes(), target.read_bytes()
        private(root/'runtime.env', 'JWT_SECRET=different\nLEDGER_CORRECTION_KEY=correctionvalue\nLEDGER_SETTLEMENT_KEY=settlementvalue\n')
        assert attempt(root, apply=True, confirm=True).returncode != 0
        assert ((root/'production.env').read_bytes(), target.read_bytes()) == baseline
        private(root/'runtime.env', 'JWT_SECRET=jwtvalue\nLEDGER_CORRECTION_KEY=correctionvalue\nLEDGER_SETTLEMENT_KEY=settlementvalue\n')
        private(root/'aws.env', '[ers-backup]\naws_access_key_id = DIFFERENT\naws_secret_access_key = secretvalue\n')
        assert attempt(root, apply=True, confirm=True).returncode != 0
        assert ((root/'production.env').read_bytes(), target.read_bytes()) == baseline
        private(root/'aws.env', '[ers-backup]\naws_access_key_id = accessvalue\naws_secret_access_key = secretvalue\n')
        env = root/'production.env'
        env.write_bytes(env.read_bytes().replace(b'AUTHZ_BOOTSTRAP_ENABLED=false', b'AUTHZ_BOOTSTRAP_ENABLED=true'))
        assert attempt(root).returncode != 0
        env.write_bytes(baseline[0])
        (root/'runtime.env').chmod(0o644)
        assert attempt(root).returncode != 0, 'world-readable materialization rejected'
        (root/'runtime.env').chmod(0o600)
        # Symlink target forbidden, never follow it.
        target.unlink()
        target.symlink_to(env)
        assert attempt(root).returncode != 0
        assert env.read_bytes() == baseline[0]
    print('Production credential cutover safeguards verified.')

if __name__ == '__main__':
    main()
