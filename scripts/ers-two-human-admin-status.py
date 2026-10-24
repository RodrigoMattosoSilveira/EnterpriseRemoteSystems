#!/usr/bin/env python3
"""Read-only canonical GLOBAL administrator status; no credential input required."""
import argparse
import json
from pathlib import Path
import sqlite3
import sys
from urllib.parse import quote


def status(database, actor_keys):
    path = Path(database).resolve(strict=True)
    if not path.is_file():
        raise ValueError("database must be an existing regular file")
    # URI read-only; do not create files or modify the application database.
    uri = "file:" + quote(str(path), safe="/") + "?mode=ro"
    conn = sqlite3.connect(uri, uri=True)
    conn.row_factory = sqlite3.Row
    try:
        result = []
        for key in actor_keys:
            rows = conn.execute("""
                SELECT a.id AS actor_id, a.actor_key, a.active AS actor_active,
                    u.id AS account_id, u.login, u.active AS account_active,
                    u.security_suspended, u.must_change_password,
                    b.scope_type, b.tenant_id, b.membership_id,
                    r.code AS role_code, r.active AS role_active, r.scope_type AS role_scope,
                    g.tenant_id AS grant_tenant, g.active AS grant_active, g.lifecycle_suspended
                FROM authz_actors a
                LEFT JOIN auth_account_actors b ON b.actor_id = a.id
                LEFT JOIN auth_user_accounts u ON u.id = b.account_id
                LEFT JOIN authz_actor_role_grants g ON g.actor_id = a.id
                LEFT JOIN authz_roles r ON r.id = g.role_id
                WHERE a.actor_key = ? COLLATE NOCASE
            """, (key,)).fetchall()
            matches = [row for row in rows if row['role_code'] == 'APPLICATION_ADMIN'
                       and row['role_scope'] == 'APPLICATION' and row['grant_tenant'] == '*'
                       and row['grant_active'] == 1 and row['lifecycle_suspended'] == 0
                       and row['role_active'] == 1]
            # Other grants need not invalidate an otherwise canonical GLOBAL
            # administrator. Exactly one linked AccountActor must exist.
            valid = len(matches) == 1
            if valid:
                linked_count = conn.execute(
                    "SELECT count(*) FROM auth_account_actors WHERE account_id = ?",
                    (matches[0]['account_id'],)).fetchone()[0]
                valid = linked_count == 1
            if valid:
                row = matches[0]
                valid = bool(row['actor_active'] and row['account_id'] and row['account_active']
                             and not row['security_suspended'] and row['scope_type'] == 'GLOBAL'
                             and row['tenant_id'] is None and row['membership_id'] is None)
            result.append({"actorKey": key, "login": rows[0]['login'] if rows else None,
                           "accountId": rows[0]['account_id'] if rows else None,
                           "actorId": rows[0]['actor_id'] if rows else None,
                           "mustChangePassword": bool(rows[0]['must_change_password']) if rows else None,
                           "usable": bool(valid)})
        # A login must never be shared by the two humans (even if DB inconsistent).
        if len(result) == 2 and result[0]['accountId'] == result[1]['accountId']:
            result[0]['usable'] = result[1]['usable'] = False
        return result
    finally:
        conn.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--db', required=True)
    parser.add_argument('--actor-key', action='append', required=True, help='repeat exactly twice')
    args = parser.parse_args()
    if len(args.actor_key) != 2 or args.actor_key[0].lower() == args.actor_key[1].lower():
        parser.error('provide two distinct --actor-key values')
    try:
        results = status(args.db, args.actor_key)
    except (OSError, ValueError, sqlite3.Error) as exc:
        print('Read-only administrator status check failed (database/schema unavailable).', file=sys.stderr)
        return 2
    print(json.dumps({"administrators": results, "ready": all(row['usable'] for row in results)}, indent=2))
    return 0 if all(row['usable'] for row in results) else 1


if __name__ == '__main__':
    sys.exit(main())
