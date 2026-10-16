#!/usr/bin/env python3
"""Guarded offline installation of already-resolved Production 1Password fragments.

This never invokes 1Password, restarts containers or touches SQLite. Run only after
verified backup and approvals, from a private operator-owned scratch workspace.
"""
import argparse
import os
from pathlib import Path
import re
import stat
import sys
import tempfile

from importlib.machinery import SourceFileLoader
validator = SourceFileLoader('ers_fragments', str(Path(__file__).with_name('ers-op-validate-fragments.py'))).load_module()
KEYS = ('JWT_SECRET', 'LEDGER_CORRECTION_KEY', 'LEDGER_SETTLEMENT_KEY')
PROFILE_KEYS = ('aws_access_key_id', 'aws_secret_access_key')


def refuse(message):
    raise ValueError(message + ' (credential values suppressed)')


def secure_file(path, *, must_exist=True):
    if must_exist and not path.exists():
        refuse('required file missing')
    if path.is_symlink():
        refuse('symlink is forbidden')
    if path.exists():
        info = path.stat()
        if not stat.S_ISREG(info.st_mode) or info.st_mode & 0o077:
            refuse('secret file must be regular and have owner-only permissions')
        if info.st_uid != os.geteuid():
            refuse('secret file must belong to invoking operator')


def assignments(text, keys):
    found = {}
    for line in text.splitlines():
        if not line or line.lstrip().startswith('#') or (line.startswith('[') and line.endswith(']')):
            continue
        if '=' not in line:
            refuse('invalid credential assignment')
        key, value = line.split('=', 1)
        key, value = key.strip(), value.strip()
        if key not in keys or key in found:
            refuse('unexpected or duplicate credential assignment')
        found[key] = value
    if set(found) != set(keys):
        refuse('missing credential assignment')
    return found


def existing_env(text):
    result = {}
    for line in text.splitlines():
        if not line or line.lstrip().startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        key = key.strip()
        if key in result:
            refuse('duplicate environment key')
        result[key] = value.strip().strip('"').strip("'")
    return result


def stage(path, data):
    fd, name = tempfile.mkstemp(prefix='.ers-cutover-', dir=path.parent)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, 'w') as dest:
            dest.write(data)
            dest.flush()
            os.fsync(dest.fileno())
        return Path(name)
    except BaseException:
        os.close(fd) if fd >= 0 else None
        Path(name).unlink(missing_ok=True)
        raise


def run(args):
    env_file = args.env_file.absolute()
    aws_target = args.aws_target.absolute()
    runtime = args.runtime_fragment.absolute()
    aws = args.aws_fragment.absolute()
    for source in (env_file, runtime, aws):
        secure_file(source)
    secure_file(aws_target, must_exist=False)
    if not aws_target.parent.is_dir() or aws_target.parent.is_symlink():
        refuse('credential target parent invalid')
    if aws_target.parent.stat().st_mode & 0o077:
        refuse('credential target directory must be private')
    if env_file == aws_target or runtime in (env_file, aws_target) or aws in (env_file, aws_target):
        refuse('source/target overlap')
    rt_text, aws_text = runtime.read_text(), aws.read_text()
    validator.validate(rt_text, 'production')
    validator.validate(aws_text, 'production', aws=True)
    new = assignments(rt_text, KEYS)
    aws_new = assignments(aws_text, PROFILE_KEYS)
    env_text = env_file.read_text()
    current = existing_env(env_text)
    if current.get('APP_ENV') != 'production' or current.get('DEV_SEED_ADMIN') != 'false' or current.get('AUTHZ_BOOTSTRAP_ENABLED') != 'false':
        refuse('Production runtime environment safeguards not satisfied')
    if current.get('AWS_SHARED_CREDENTIALS_FILE') != str(aws_target) or current.get('AWS_PROFILE') != 'ers-backup':
        refuse('AWS credential path/profile differs from Production contract')
    if current.get('LLM_COACHING_ENABLED', 'false') != 'false' or current.get('DEV_ADMIN_PASSWORD', '') != '':
        refuse('disabled AI/development-admin contract violated')
    for key in KEYS:
        if key not in current:
            refuse('Production runtime credential assignment missing')
        if current[key] and current[key] != new[key]:
            refuse('existing Production runtime credential differs; rotate via separate approval')
    if aws_target.exists():
        old_aws = assignments(aws_target.read_text(), PROFILE_KEYS)
        if any(old_aws[k] != aws_new[k] for k in PROFILE_KEYS):
            refuse('existing Production backup credential differs; rotate via separate approval')
    if any(not current[k] for k in KEYS[1:]) and not args.approve_ledger_activation:
        refuse('new ledger credentials require --approve-ledger-activation')
    new_lines = []
    for line in env_text.splitlines(keepends=True):
        if '=' in line and line.split('=', 1)[0].strip() in KEYS:
            key = line.split('=', 1)[0].strip()
            new_lines.append(f'{key}={new[key]}\n')
        else:
            new_lines.append(line)
    new_env = ''.join(new_lines)
    new_aws = '[ers-backup]\n' + ''.join(f'{key} = {aws_new[key]}\n' for key in PROFILE_KEYS)
    if not args.apply:
        print('PASS: Production credential cutover preflight (no files changed; values suppressed)')
        return
    if args.confirm != 'INSTALL_PRODUCTION_CREDENTIALS':
        refuse('explicit Production confirmation missing')
    # A rollback image of each target is retained only in protected process memory.
    old_env = env_text
    old_aws_text = aws_target.read_text() if aws_target.exists() else None
    created = []
    installed = []
    try:
        created = [stage(env_file, new_env), stage(aws_target, new_aws)]
        os.replace(created[0], env_file)
        installed.append(env_file)
        os.replace(created[1], aws_target)
        installed.append(aws_target)
    except BaseException:
        # Do not leave mixed runtime and backup credentials after an I/O failure.
        for target, original in ((env_file, old_env), (aws_target, old_aws_text)):
            if target not in installed:
                continue
            if original is None:
                target.unlink(missing_ok=True)
            else:
                staged = stage(target, original)
                os.replace(staged, target)
        raise
    finally:
        for tmp in created:
            tmp.unlink(missing_ok=True)
    print('PASS: Production credential files installed (no service restarted; values suppressed)')


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--env-file', type=Path, required=True)
    p.add_argument('--aws-target', type=Path, required=True)
    p.add_argument('--runtime-fragment', type=Path, required=True)
    p.add_argument('--aws-fragment', type=Path, required=True)
    p.add_argument('--approve-ledger-activation', action='store_true')
    p.add_argument('--apply', action='store_true')
    p.add_argument('--confirm', default='')
    args = p.parse_args()
    try:
        run(args)
    except (OSError, ValueError) as e:
        # Avoid printing exception text from lower-level IO libraries or secrets.
        print('Production credential cutover refused; consult guards and file permissions (values suppressed)', file=sys.stderr)
        return 2
    return 0


if __name__ == '__main__':
    sys.exit(main())
