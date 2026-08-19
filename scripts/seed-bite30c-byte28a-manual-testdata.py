#!/usr/bin/env python3
"""Seed deterministic Bite 30C manual-test data into the local ERS SQLite DB.

Targets the existing "Byte/Bite 28A Manual Test" tenant and creates enough
People, Memberships, Collaborators, Actors, Role Grants, and Authentication
Accounts to execute the Bite 30C manual verification without repetitive hand
entry.

LOCAL DEVELOPMENT ONLY. Stop the backend before running this script.
"""
from __future__ import annotations

import argparse
import hashlib
import os
import shutil
import sqlite3
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[0]
DEFAULT_DB = Path.cwd() / "backend" / "data" / "app.db"
DEFAULT_TARGET_NAMES = ("Byte 28A Manual Test", "Bite 28A Manual Test")
DEFAULT_PASSWORD = "Manual-30C-Password!"
# bcrypt hash for DEFAULT_PASSWORD, generated with cost 10.  $2a$ is accepted
# by Go's golang.org/x/crypto/bcrypt used by ERS.
DEFAULT_PASSWORD_HASH = "$2a$10$2aGDP1WNWYv3Q2aC4URnv.t40kw1HHjYOHUfvmctSf8Pb7D6Vo0t2"
TODAY = date(2026, 8, 13)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Seed Bite 30C manual fixtures for Byte/Bite 28A Manual Test.")
    p.add_argument("--db-path", default=os.getenv("DATABASE_PATH") or str(DEFAULT_DB))
    p.add_argument("--tenant-name", default=DEFAULT_TARGET_NAMES[0])
    p.add_argument("--people", type=int, default=20, help="Number of ordinary target-tenant People to seed (default 20).")
    p.add_argument("--collaborators", type=int, default=8, help="Number of those People to make active Collaborators (default 8).")
    p.add_argument("--no-backup", action="store_true", help="Do not create a timestamped DB backup before seeding.")
    return p.parse_args()


def now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def fixture_id(kind: str, key: str) -> str:
    digest = hashlib.sha1(key.encode("utf-8")).hexdigest()[:12]
    return f"manual30c-{kind}-{digest}"


def require_tables(conn: sqlite3.Connection, tables: list[str]) -> None:
    existing = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    missing = [t for t in tables if t not in existing]
    if missing:
        raise SystemExit(
            "Missing Bite 30B/30C table(s): " + ", ".join(missing) + ". Run migrations through 000046 first."
        )


def resolve_target_tenant(conn: sqlite3.Connection, requested: str) -> sqlite3.Row:
    candidates = [requested]
    if requested.lower().startswith("byte "):
        candidates.append("Bite " + requested[5:])
    elif requested.lower().startswith("bite "):
        candidates.append("Byte " + requested[5:])
    candidates.extend(DEFAULT_TARGET_NAMES)

    seen: set[str] = set()
    for candidate in candidates:
        key = candidate.strip().lower()
        if not key or key in seen:
            continue
        seen.add(key)
        row = conn.execute(
            "SELECT id, code, name, active FROM tenants WHERE LOWER(name) = LOWER(?) LIMIT 1",
            (candidate.strip(),),
        ).fetchone()
        if row:
            if not row["active"]:
                raise SystemExit(f"Target tenant {row['name']!r} exists but is inactive.")
            return row

    rows = conn.execute("SELECT id, code, name, active FROM tenants ORDER BY name").fetchall()
    printable = "\n".join(f"  {r['id']}  {r['code']}  {r['name']}  active={r['active']}" for r in rows)
    raise SystemExit(f"Could not find target tenant {requested!r}. Available tenants:\n{printable}")


def resolve_default_tenant(conn: sqlite3.Connection) -> sqlite3.Row:
    row = conn.execute("SELECT id, code, name, active FROM tenants WHERE id = 'default' LIMIT 1").fetchone()
    if not row:
        raise SystemExit("Tenant 'default' is required for the Bite 30C multi-tenant fixtures.")
    if not row["active"]:
        raise SystemExit("Tenant 'default' exists but is inactive.")
    return row


def ensure_reference(
    conn: sqlite3.Connection,
    tenant_id: str,
    ref_type: str,
    code: str,
    label: str,
    description: str,
    sort_order: int = 10,
) -> str:
    row = conn.execute(
        """
        SELECT id FROM reference_data
        WHERE tenant_id = ? AND type = ? AND code = ? AND active = 1
        ORDER BY created_at, id LIMIT 1
        """,
        (tenant_id, ref_type, code),
    ).fetchone()
    if row:
        return row["id"]

    ref_id = fixture_id("ref", f"{tenant_id}:{ref_type}:{code}")
    ts = now()
    conn.execute(
        """
        INSERT INTO reference_data (
          id, tenant_id, type, code, label, description, active, sort_order,
          metadata_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, NULL, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          label = excluded.label,
          description = excluded.description,
          active = 1,
          sort_order = excluded.sort_order,
          updated_at = excluded.updated_at
        """,
        (ref_id, tenant_id, ref_type, code, label, description, sort_order, ts, ts),
    )
    return ref_id


def tenant_refs(conn: sqlite3.Connection, tenant_id: str) -> dict[str, str]:
    return {
        "person_active": ensure_reference(conn, tenant_id, "person_status", "ACTIVE", "Active", "Active Person", 10),
        "collab_active": ensure_reference(conn, tenant_id, "collaborator_status", "ACTIVE", "Active", "Active Collaborator", 10),
        "method_daily": ensure_reference(conn, tenant_id, "method", "DAILY", "Daily wage", "Daily BRL wage", 10),
        "sector": ensure_reference(conn, tenant_id, "sector", "MANUAL_30C", "30C Manual Sector", "Bite 30C manual-test sector", 10),
        "location": ensure_reference(conn, tenant_id, "location", "MANUAL_30C", "30C Manual Location", "Bite 30C manual-test location", 10),
        "task": ensure_reference(conn, tenant_id, "task", "MANUAL_30C", "30C Manual Task", "Bite 30C manual-test task", 10),
    }


def make_identity(seq: int, tag: str = "person") -> dict[str, str]:
    # Values are deterministic and validation-friendly, but intentionally fake.
    # Each tag gets a separate numeric namespace to avoid accidental collisions.
    tag_seed = int(hashlib.sha1(tag.encode()).hexdigest()[:4], 16) % 7000 + 1000
    n = tag_seed * 100 + seq
    first_names = [
        "Aline", "Bruno", "Carla", "Diego", "Elisa", "Fabio", "Giovana", "Hugo", "Iara", "Joao",
        "Karina", "Lucas", "Marina", "Nicolas", "Olivia", "Paulo", "Rafaela", "Sofia", "Tiago", "Valeria",
    ]
    last_names = ["Silva", "Santos", "Oliveira", "Souza", "Pereira"]
    first = first_names[(seq - 1) % len(first_names)]
    last = last_names[(seq - 1) % len(last_names)]
    suffix = f"{n:09d}"[-9:]
    return {
        "first_name": first,
        "last_name": last,
        "nickname": f"30C {tag[:8]} {seq:02d}",
        "cpf": f"7{suffix}1"[:11],
        "rg": f"30C-{tag[:3].upper()}-{seq:04d}",
        "cellular": f"119{n % 100000000:08d}",
        "email": f"manual30c.{tag}.{seq:02d}@example.test".lower(),
        "pix_key": f"manual30c.{tag}.{seq:02d}@pix.example.test".lower(),
    }


def upsert_global_person(conn: sqlite3.Connection, global_id: str, ident: dict[str, str]) -> None:
    ts = now()
    conn.execute(
        """
        INSERT INTO global_people (
          id, first_name, last_name, nickname, cpf, rg, cellular, email,
          street1, street2, state, cep, city, country,
          bank_name, bank_number, checking_account, pix_key,
          emergency_name, emergency_cellular, emergency_email,
          profile_completion_status, can_create_collaborator, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?,
                  'Rua Manual 30C', NULL, 'PA', '66000-000', 'Manual City', 'Brasil',
                  'Manual Bank', '001', '000123-4', ?,
                  'Manual Emergency', '11999990000', 'emergency30c@example.test',
                  'COMPLETE', 1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          first_name=excluded.first_name,
          last_name=excluded.last_name,
          nickname=excluded.nickname,
          cpf=excluded.cpf,
          rg=excluded.rg,
          cellular=excluded.cellular,
          email=excluded.email,
          pix_key=excluded.pix_key,
          profile_completion_status='COMPLETE',
          can_create_collaborator=1,
          updated_at=excluded.updated_at
        """,
        (
            global_id, ident["first_name"], ident["last_name"], ident["nickname"], ident["cpf"], ident["rg"],
            ident["cellular"], ident["email"], ident["pix_key"], ts, ts,
        ),
    )


def upsert_legacy_person(
    conn: sqlite3.Connection,
    tenant_id: str,
    global_id: str,
    key: str,
    ident: dict[str, str],
    status_id: str,
    notes: str,
) -> tuple[str, str]:
    ts = now()
    legacy_id = fixture_id("person", f"{key}:{tenant_id}")
    membership_id = fixture_id("membership", f"{global_id}:{tenant_id}")
    conn.execute(
        """
        INSERT INTO people (
          id, tenant_id, first_name, last_name, nickname, cpf, rg, cellular, email,
          street1, state, cep, city, country, bank_name, bank_number, checking_account,
          pix_key, emergency_name, emergency_cellular, emergency_email,
          profile_completion_status, can_create_collaborator, status_id, notes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?,
                  'Rua Manual 30C', 'PA', '66000-000', 'Manual City', 'Brasil',
                  'Manual Bank', '001', '000123-4', ?, 'Manual Emergency', '11999990000',
                  'emergency30c@example.test', 'COMPLETE', 1, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          first_name=excluded.first_name,
          last_name=excluded.last_name,
          nickname=excluded.nickname,
          cpf=excluded.cpf,
          rg=excluded.rg,
          cellular=excluded.cellular,
          email=excluded.email,
          pix_key=excluded.pix_key,
          profile_completion_status='COMPLETE',
          can_create_collaborator=1,
          status_id=excluded.status_id,
          notes=excluded.notes,
          updated_at=excluded.updated_at
        """,
        (
            legacy_id, tenant_id, ident["first_name"], ident["last_name"], ident["nickname"], ident["cpf"], ident["rg"],
            ident["cellular"], ident["email"], ident["pix_key"], status_id, notes, ts, ts,
        ),
    )
    conn.execute(
        """
        INSERT INTO person_tenant_memberships (
          id, created_at, updated_at, tenant_id, person_id, status_id, notes, legacy_person_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(person_id, tenant_id) DO UPDATE SET
          status_id=excluded.status_id,
          notes=excluded.notes,
          legacy_person_id=excluded.legacy_person_id,
          updated_at=excluded.updated_at
        """,
        (membership_id, ts, ts, tenant_id, global_id, status_id, notes, legacy_id),
    )
    return legacy_id, membership_id


def seed_person(
    conn: sqlite3.Connection,
    tenant_id: str,
    status_id: str,
    key: str,
    seq: int,
    tag: str,
    notes: str,
    email_override: str | None = None,
) -> dict[str, str]:
    ident = make_identity(seq, tag)
    if email_override is not None:
        ident["email"] = email_override.strip().lower()
    global_id = fixture_id("global-person", key)
    upsert_global_person(conn, global_id, ident)
    legacy_id, membership_id = upsert_legacy_person(conn, tenant_id, global_id, key, ident, status_id, notes)
    return {**ident, "global_id": global_id, "legacy_id": legacy_id, "membership_id": membership_id}


def seed_collaborator(
    conn: sqlite3.Connection,
    tenant_id: str,
    refs: dict[str, str],
    person: dict[str, str],
    key: str,
    seq: int,
) -> str:
    collab_id = fixture_id("collab", f"{key}:{tenant_id}")
    ts = now()
    start = TODAY - timedelta(days=20 + seq)
    default_end = start + timedelta(days=90)
    conn.execute(
        """
        INSERT INTO collaborator_journeys (
          id, created_at, updated_at, tenant_id, person_id, journey_start_date,
          default_end_date, extension_days, projected_end_date, payment_method_id,
          payment_value, sector_id, location_id, task_id, status_id, notes,
          daily_brl_amount, planning_availability
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
        ON CONFLICT(id) DO UPDATE SET
          person_id=excluded.person_id,
          payment_method_id=excluded.payment_method_id,
          payment_value=excluded.payment_value,
          sector_id=excluded.sector_id,
          location_id=excluded.location_id,
          task_id=excluded.task_id,
          status_id=excluded.status_id,
          notes=excluded.notes,
          daily_brl_amount=excluded.daily_brl_amount,
          planning_availability='ACTIVE',
          updated_at=excluded.updated_at
        """,
        (
            collab_id, ts, ts, tenant_id, person["legacy_id"], start.isoformat(), default_end.isoformat(),
            default_end.isoformat(), refs["method_daily"], 300.0 + seq * 10, refs["sector"], refs["location"], refs["task"],
            refs["collab_active"], f"Bite 30C manual collaborator #{seq}.", 300.0 + seq * 10,
        ),
    )
    return collab_id


def role_id(conn: sqlite3.Connection, code: str) -> str:
    row = conn.execute("SELECT id FROM authz_roles WHERE code = ? AND active = 1 LIMIT 1", (code,)).fetchone()
    if not row:
        raise SystemExit(f"Required authorization role {code!r} is missing or inactive.")
    return row["id"]


def upsert_actor(
    conn: sqlite3.Connection,
    key: str,
    display_name: str,
    legacy_person_id: str,
) -> str:
    actor_id = fixture_id("actor", key)
    actor_key = f"manual30c-{hashlib.sha1(key.encode()).hexdigest()[:16]}"
    ts = now()
    conn.execute(
        """
        INSERT INTO authz_actors (
          id, actor_key, display_name, person_id, collaborator_id, active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, NULL, 1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          display_name=excluded.display_name,
          person_id=excluded.person_id,
          collaborator_id=NULL,
          active=1,
          updated_at=excluded.updated_at
        """,
        (actor_id, actor_key, display_name, legacy_person_id, ts, ts),
    )
    return actor_id


def upsert_grant(conn: sqlite3.Connection, actor_id: str, role_code: str, tenant_id: str) -> None:
    rid = role_id(conn, role_code)
    grant_id = fixture_id("grant", f"{actor_id}:{rid}:{tenant_id}")
    ts = now()
    conn.execute(
        """
        INSERT INTO authz_actor_role_grants (
          id, actor_id, role_id, tenant_id, active, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 1, ?, ?)
        ON CONFLICT(id) DO UPDATE SET active=1, updated_at=excluded.updated_at
        """,
        (grant_id, actor_id, rid, tenant_id, ts, ts),
    )


def upsert_account(
    conn: sqlite3.Connection,
    key: str,
    login: str,
    primary_actor_id: str,
    global_person_id: str,
    primary_tenant_id: str,
    primary_membership_id: str,
) -> str:
    account_id = fixture_id("account", key)
    ts = now()
    # actor_id is intentionally omitted from the UPDATE clause because Bite 28's
    # compatibility pointer is immutable.
    conn.execute(
        """
        INSERT INTO auth_user_accounts (
          id, actor_id, login, password_hash, active, must_change_password,
          last_login_at, password_changed_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 1, 0, NULL, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          login=excluded.login,
          password_hash=excluded.password_hash,
          active=1,
          must_change_password=0,
          password_changed_at=excluded.password_changed_at,
          updated_at=excluded.updated_at
        """,
        (account_id, primary_actor_id, login.lower(), DEFAULT_PASSWORD_HASH, ts, ts, ts),
    )
    conn.execute(
        """
        INSERT INTO auth_account_people (account_id, person_id, created_at, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(account_id) DO UPDATE SET updated_at=excluded.updated_at
        """,
        (account_id, global_person_id, ts, ts),
    )
    conn.execute(
        """
        INSERT OR IGNORE INTO auth_account_actors (
          account_id, actor_id, scope_type, tenant_id, membership_id,
          is_primary, created_at, updated_at
        ) VALUES (?, ?, 'TENANT', ?, ?, 1, ?, ?)
        """,
        (account_id, primary_actor_id, primary_tenant_id, primary_membership_id, ts, ts),
    )
    return account_id


def bind_secondary_actor(
    conn: sqlite3.Connection,
    account_id: str,
    actor_id: str,
    tenant_id: str,
    membership_id: str,
) -> None:
    ts = now()
    conn.execute(
        """
        INSERT OR IGNORE INTO auth_account_actors (
          account_id, actor_id, scope_type, tenant_id, membership_id,
          is_primary, created_at, updated_at
        ) VALUES (?, ?, 'TENANT', ?, ?, 0, ?, ?)
        """,
        (account_id, actor_id, tenant_id, membership_id, ts, ts),
    )


def seed_auth_identity(
    conn: sqlite3.Connection,
    tenant_id: str,
    refs: dict[str, str],
    key: str,
    seq: int,
    tag: str,
    role_code: str | None,
    login: str,
) -> dict[str, str]:
    person = seed_person(
        conn,
        tenant_id,
        refs["person_active"],
        key,
        seq,
        tag,
        f"30C auth fixture: {tag}.",
        email_override=login,
    )
    actor_id = upsert_actor(conn, f"{key}:{tenant_id}", f"{person['first_name']} {person['last_name']} ({tag})", person["legacy_id"])
    # Bite 30D requires tenant delegated Roles to match an existing tenant Actor
    # binding, so create/bind the Account before adding delegated authority.
    # Self-service fixtures pass role_code=None and need no Role Grant.
    account_id = upsert_account(
        conn, key, login, actor_id, person["global_id"], tenant_id, person["membership_id"]
    )
    if role_code:
        upsert_grant(conn, actor_id, role_code, tenant_id)
    return {**person, "actor_id": actor_id, "account_id": account_id, "login": login.lower()}


def seed_multi_identity(
    conn: sqlite3.Connection,
    target_id: str,
    target_refs: dict[str, str],
    default_id: str,
    default_refs: dict[str, str],
    key: str,
    seq: int,
    tag: str,
    login: str,
    bind_default: bool,
) -> dict[str, str]:
    ident = make_identity(seq, tag)
    # Keep the deliberately named manual authentication fixtures easy to follow
    # across /people, /admin/authentication, SQL spot checks, and sign-in. ERS
    # itself does not require Person.email to equal Authentication Account.login.
    ident["email"] = login.strip().lower()
    global_id = fixture_id("global-person", key)
    upsert_global_person(conn, global_id, ident)
    target_legacy, target_membership = upsert_legacy_person(
        conn, target_id, global_id, key, ident, target_refs["person_active"], f"30C {tag}: target membership."
    )
    default_legacy, default_membership = upsert_legacy_person(
        conn, default_id, global_id, key, ident, default_refs["person_active"], f"30C {tag}: default membership."
    )
    target_actor = upsert_actor(conn, f"{key}:{target_id}", f"{ident['first_name']} {ident['last_name']} ({tag} target)", target_legacy)
    default_actor = upsert_actor(conn, f"{key}:{default_id}", f"{ident['first_name']} {ident['last_name']} ({tag} default)", default_legacy)
    account_id = upsert_account(conn, key, login, target_actor, global_id, target_id, target_membership)
    if bind_default:
        bind_secondary_actor(conn, account_id, default_actor, default_id, default_membership)
    return {
        **ident,
        "global_id": global_id,
        "target_legacy_id": target_legacy,
        "target_membership_id": target_membership,
        "default_legacy_id": default_legacy,
        "default_membership_id": default_membership,
        "target_actor_id": target_actor,
        "default_actor_id": default_actor,
        "account_id": account_id,
        "login": login.lower(),
    }


def main() -> None:
    args = parse_args()
    if args.people < 8:
        raise SystemExit("--people must be at least 8 so collaborator/manual coverage remains useful.")
    if args.collaborators < 0 or args.collaborators > args.people:
        raise SystemExit("--collaborators must be between 0 and --people.")

    db_path = Path(args.db_path).expanduser().resolve()
    if not db_path.exists():
        raise SystemExit(f"Database not found: {db_path}")
    if "prod" in str(db_path).lower() or "production" in str(db_path).lower():
        raise SystemExit("Refusing to seed a path that looks like production.")

    if not args.no_backup:
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        backup = db_path.with_name(db_path.name + f".before-bite30c-manual-seed-{stamp}.bak")
        shutil.copy2(db_path, backup)
        print(f"Backup: {backup}")

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    require_tables(conn, [
        "tenants", "reference_data", "people", "global_people", "person_tenant_memberships",
        "collaborator_journeys", "authz_actors", "authz_roles", "authz_actor_role_grants",
        "auth_user_accounts", "auth_account_people", "auth_account_actors",
    ])

    target = resolve_target_tenant(conn, args.tenant_name)
    default = resolve_default_tenant(conn)
    if target["id"] == default["id"]:
        raise SystemExit("Target tenant resolved to 'default'; this script is intended for Byte/Bite 28A Manual Test.")

    print(f"Target tenant: {target['name']} ({target['id']})")
    print(f"Second tenant: {default['name']} ({default['id']})")

    try:
        conn.execute("BEGIN IMMEDIATE")
        target_refs = tenant_refs(conn, target["id"])
        default_refs = tenant_refs(conn, default["id"])

        ordinary: list[dict[str, str]] = []
        for i in range(1, args.people + 1):
            ordinary.append(
                seed_person(
                    conn,
                    target["id"],
                    target_refs["person_active"],
                    f"ordinary-{i:02d}",
                    i,
                    "ordinary",
                    f"Bite 30C manual seed ordinary Person #{i:02d}.",
                )
            )

        collaborator_ids = []
        for i in range(1, args.collaborators + 1):
            collaborator_ids.append(
                seed_collaborator(conn, target["id"], target_refs, ordinary[i - 1], f"ordinary-{i:02d}", i)
            )

        target_admin = seed_auth_identity(
            conn,
            target["id"],
            target_refs,
            "target-tenant-admin",
            91,
            "tenantadmin",
            "TENANT_ADMIN",
            "manual30c.byte28a-admin@example.test",
        )
        single = seed_auth_identity(
            conn,
            target["id"],
            target_refs,
            "single-tenant-user",
            92,
            "single",
            None,
            "manual30c.single@example.test",
        )
        multi_ready = seed_multi_identity(
            conn,
            target["id"],
            target_refs,
            default["id"],
            default_refs,
            "multi-ready",
            93,
            "multi",
            "manual30c.multi@example.test",
            bind_default=True,
        )
        attach_candidate = seed_multi_identity(
            conn,
            target["id"],
            target_refs,
            default["id"],
            default_refs,
            "attach-candidate",
            94,
            "attach",
            "manual30c.attach@example.test",
            bind_default=False,
        )

        # Optional guaranteed Tenant Administrator for `default`, useful for the
        # cross-tenant 30B/30C manual workflows. This is the only extra ordinary
        # account deliberately created in default by this script.
        default_admin = seed_auth_identity(
            conn,
            default["id"],
            default_refs,
            "default-tenant-admin",
            95,
            "defaultadmin",
            "TENANT_ADMIN",
            "manual30c.default-admin@example.test",
        )

        fk_errors = conn.execute("PRAGMA foreign_key_check").fetchall()
        if fk_errors:
            raise RuntimeError("Foreign-key check failed: " + "; ".join(str(tuple(r)) for r in fk_errors[:10]))
        conn.commit()
    except Exception:
        conn.rollback()
        raise

    people_count = conn.execute("SELECT COUNT(*) FROM people WHERE tenant_id = ?", (target["id"],)).fetchone()[0]
    membership_count = conn.execute("SELECT COUNT(*) FROM person_tenant_memberships WHERE tenant_id = ?", (target["id"],)).fetchone()[0]
    collaborator_count = conn.execute("SELECT COUNT(*) FROM collaborator_journeys WHERE tenant_id = ?", (target["id"],)).fetchone()[0]
    conn.close()

    print("\nSeed complete.")
    print(f"  Target People:       {people_count}")
    print(f"  Target Memberships:  {membership_count}")
    print(f"  Target Collaborators:{collaborator_count}")
    print("\nAll seeded authentication accounts use:")
    print(f"  Password: {DEFAULT_PASSWORD}")
    print("  For the five named authentication fixtures, Person email == Authentication login.")
    print("\nUseful Bite 30C identities:")
    print(f"  Target Tenant Admin:  {target_admin['login']}")
    print(f"  Default Tenant Admin: {default_admin['login']}")
    print(f"  Single-tenant user:   {single['login']}")
    print(f"  Multi-actor ready:    {multi_ready['login']}  (already bound to both tenant Actors)")
    print(f"  Attach candidate:     {attach_candidate['login']}  (target Actor bound; default Actor intentionally unbound)")
    print("\nAttach-candidate actor IDs:")
    print(f"  Target Actor:  {attach_candidate['target_actor_id']}")
    print(f"  Default Actor: {attach_candidate['default_actor_id']}")
    print("\nRestart make local-backend after seeding so all runtime caches/foundation checks start from this state.")


if __name__ == "__main__":
    main()
