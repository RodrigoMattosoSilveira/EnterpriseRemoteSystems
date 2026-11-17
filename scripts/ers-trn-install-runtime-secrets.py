#!/usr/bin/env python3
"""Install scoped 1Password TRN runtime values into create-only .env.training.

Only before first TRN Docker volume; never rotates credentials or resets data.
Do not pass any secret value as a command-line argument.
"""
from __future__ import annotations
import argparse
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

ROOT = Path('/opt/EnterpriseRemoteSystems/training')
KEYS = frozenset(('JWT_SECRET', 'LEDGER_CORRECTION_KEY', 'LEDGER_SETTLEMENT_KEY'))

class Blocked(Exception): pass

def entries(text: str) -> dict[str,str]:
    found={}
    for raw in text.splitlines():
        if not raw.strip() or raw.lstrip().startswith('#'):
            continue
        if '=' not in raw: raise Blocked('malformed assignment (values suppressed)')
        key,value=raw.split('=',1)
        if not re.fullmatch(r'[A-Za-z_][A-Za-z0-9_]*',key) or key in found:
            raise Blocked('invalid or duplicated assignment')
        found[key]=value
    return found

def merge(existing: str, fragment: str) -> str:
    dest=entries(existing)
    secrets=entries(fragment)
    if set(secrets) != KEYS or any(not v or v != v.strip() or '{{' in v or '\x00' in v for v in secrets.values()):
        raise Blocked('invalid training secret fragment; exact 1Password keys required')
    if dest.get('APP_ENV') != 'training':
        raise Blocked('destination is not an explicit APP_ENV=training file')
    if not KEYS.issubset(dest):
        raise Blocked('initializer did not create expected runtime keys')
    return '\n'.join((key+'='+secrets[key] if key in secrets else line)
                     for line in existing.splitlines() for key in [line.split('=',1)[0] if '=' in line else ''])+'\n'

def main(argv=None) -> int:
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--env-file',type=Path,required=True)
    p.add_argument('--fragment',type=Path,required=True)
    p.add_argument('--confirm',required=True)
    args=p.parse_args(argv)
    try:
        if args.confirm != 'INITIALIZE-TRAINING-SECRETS':
            raise Blocked('exact initial-configuration confirmation required')
        dst=args.env_file.absolute()
        if dst != ROOT/'.env.training' or dst.is_symlink() or not dst.is_file():
            raise Blocked('destination must be a regular file at the canonical TRN location')
        if dst.stat().st_mode & 0o077:
            raise Blocked('destination environment file must be mode 0600')
        if args.fragment.is_symlink() or not args.fragment.is_file() or args.fragment.stat().st_mode & 0o077:
            raise Blocked('fragment must be a 0600 regular file, not a symlink')
        result=subprocess.run(['docker','volume','inspect','ers-trn_backend-data'],capture_output=True,timeout=15)
        if result.returncode == 0:
            raise Blocked('TRN volume already exists; initial provisioning refuses credential rotation')
        if result.returncode != 1:
            raise Blocked('Docker volume absence cannot be independently verified')
        merged=merge(dst.read_text(),args.fragment.read_text())
        fd,name=tempfile.mkstemp(prefix='.env.training-',dir=dst.parent)
        try:
            os.fchmod(fd,0o600)
            with os.fdopen(fd,'w') as output:
                output.write(merged)
                output.flush();os.fsync(output.fileno())
            os.replace(name,dst)
        finally:
            if os.path.exists(name):os.unlink(name)
        print('PASS: TRN runtime values installed from scoped 1Password fragment (values suppressed)')
        return 0
    except (Blocked,OSError,subprocess.TimeoutExpired) as exc:
        print(f'BLOCKED: TRN runtime configuration: {exc}',file=sys.stderr)
        return 2

if __name__=='__main__':raise SystemExit(main())
