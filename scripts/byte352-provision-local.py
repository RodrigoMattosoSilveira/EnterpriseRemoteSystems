#!/usr/bin/env python3
"""Interactive LOCAL-only Byte 35.2 fixture provisioning, no plaintext credential files.

Run from repository root after a verified database backup. The operator must
record each distinct password in the LOCAL ERS 1Password vault first.
"""
import getpass
import json
import os
from pathlib import Path
import subprocess
import sys

CREDENTIALS = (
    ('ADMIN-A', 'e2e-authz-admin-tenant-admin@example.com'),
    ('ADMIN-B', 'e2e-isolation-tenant-admin@example.com'),
    ('EARN-A', 'e2e-authz-admin-earnings-operator@example.com'),
    ('EXP-A', 'e2e-authz-admin-expenses-operator@example.com'),
    ('EARN-B', 'e2e-isolation-earnings-operator@example.com'),
    ('EXP-B', 'e2e-isolation-expenses-operator@example.com'),
    ('COLLAB-A', 'e2e-byte352-collaborator-a@example.com'),
    ('COLLAB-B', 'e2e-byte352-collaborator-b@example.com'),
    ('SHARED', 'e2e-byte352-shared@example.com'),
)


def main():
    repo = Path(__file__).resolve().parent.parent
    db = (repo / 'backend' / 'data' / 'app.db').resolve()
    if os.environ.get('APP_ENV', '').lower() not in ('local',):
        raise SystemExit('STOP: set APP_ENV=local explicitly; no deployments allowed with this helper')
    if not db.is_file() or db.stat().st_size == 0:
        raise SystemExit('STOP: existing LOCAL database missing')
    print('LOCAL database:', db)
    print('STOP unless you have stopped LOCAL ERS and verified a SQLite backup and integrity_check.')
    if input('Type BACKUP-VERIFIED to continue: ').strip() != 'BACKUP-VERIFIED':
        raise SystemExit('Aborted; no mutation')
    print('Enter exact passwords stored in 1Password ers-development LOCAL items.')
    credentials = {}
    for name, login in CREDENTIALS:
        pw = getpass.getpass(f'{name} ({login}): ')
        if len(pw) < 16 or pw.strip() != pw or '\n' in pw or '\r' in pw or pw in credentials.values():
            raise SystemExit('STOP: password must be unique, >=16 characters, and contain no leading/trailing whitespace or newlines')
        credentials[login] = pw
    print('Administrator credential policy:')
    print('  PRESERVE: only use supplied passwords if they already match existing administrator hashes')
    print('  ROTATE: explicitly replace passwords for ADMIN-A and ADMIN-B only; never APP')
    mode = input('Type PRESERVE or ROTATE: ').strip()
    if mode not in ('PRESERVE', 'ROTATE'):
        raise SystemExit('Aborted; no mutation')
    if mode == 'ROTATE':
        print('WARNING: This changes existing LOCAL ADMIN-A and ADMIN-B passwords; update their 1Password items.')
        if input('Type ROTATE-TWO-LOCAL-TENANT-ADMINS to confirm: ').strip() != 'ROTATE-TWO-LOCAL-TENANT-ADMINS':
            raise SystemExit('Aborted; no mutation')
    payload = json.dumps({'databasePath': str(db), 'credentials': credentials,
                          'rotateTenantAdministratorPasswords': mode == 'ROTATE'})
    env = {**os.environ, 'APP_ENV': 'local', 'DB_PATH': str(db)}
    completed = subprocess.run(['go', 'run', './cmd/provision-e2e-admin', '--byte352-fixtures-only'],
                               cwd=repo / 'backend', env=env, input=payload, text=True, check=False)
    if completed.returncode != 0:
        raise SystemExit(f'Provisioning failed (exit {completed.returncode}); inspect error and verify database integrity')
    print('Provisioning succeeded. Next: complete P-02 browser authentication for all ten identities (including APP).')


if __name__ == '__main__':
    main()
