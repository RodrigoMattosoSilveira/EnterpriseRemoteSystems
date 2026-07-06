#!/usr/bin/env python3
"""Seed a realistic local manual-test dataset for ERS.

This script is intentionally separate from E2E/test reset data.  It is safe for
local development databases only and uses stable manual-* IDs so it can be run
more than once without duplicating rows.
"""

from __future__ import annotations

import argparse
import os
import random
import sqlite3
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parents[1]
DEFAULT_DB_PATH = ROOT_DIR / "backend" / "data" / "app.db"
TENANT_ID = "default"
TODAY = date(2026, 7, 5)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Seed ERS manual test data.")
    parser.add_argument(
        "--db-path",
        default=os.environ.get("DB_PATH") or os.environ.get("DATABASE_PATH") or str(DEFAULT_DB_PATH),
        help="SQLite database path. Defaults to backend/data/app.db.",
    )
    parser.add_argument(
        "--with-work-periods",
        action="store_true",
        help="Also create recent manual work periods so gold production can be seeded immediately.",
    )
    parser.add_argument(
        "--work-period-days",
        type=int,
        default=int(os.environ.get("MANUAL_TESTDATA_WORK_PERIOD_DAYS", "14")),
        help="Number of recent work periods to create when --with-work-periods is used. Default: 14.",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=int(os.environ.get("MANUAL_TESTDATA_RANDOM_SEED", "26070")),
        help="Random seed used for deterministic but varied manual data.",
    )
    return parser.parse_args()


def connect(db_path: str) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def table_columns(conn: sqlite3.Connection, table: str) -> set[str]:
    return {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}


def require_tables(conn: sqlite3.Connection, tables: list[str]) -> None:
    existing = {
        row["name"]
        for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
    }
    missing = [table for table in tables if table not in existing]
    if missing:
        raise SystemExit(
            f"Missing required table(s): {', '.join(missing)}. Run migrations before seeding."
        )


def insert_or_ignore(conn: sqlite3.Connection, table: str, values: dict[str, object]) -> None:
    columns = list(values.keys())
    placeholders = ", ".join("?" for _ in columns)
    sql = f"INSERT OR IGNORE INTO {table} ({', '.join(columns)}) VALUES ({placeholders})"
    conn.execute(sql, [values[column] for column in columns])


def upsert_filtered_row(conn: sqlite3.Connection, table: str, values: dict[str, object]) -> None:
    """Insert/update a row while ignoring columns missing from older local DBs."""
    available = table_columns(conn, table)
    filtered = {key: value for key, value in values.items() if key in available}
    if "id" not in filtered:
        raise ValueError(f"Cannot upsert {table}: missing id column")
    columns = list(filtered.keys())
    assignments = ", ".join(f"{column}=excluded.{column}" for column in columns if column != "id")
    sql = f"""
        INSERT INTO {table} ({', '.join(columns)})
        VALUES ({', '.join('?' for _ in columns)})
        ON CONFLICT(id) DO UPDATE SET {assignments}
    """
    conn.execute(sql, [filtered[column] for column in columns])


def manual_receipt_status(sequence: int) -> str:
    return ["PENDING_ISSUE", "ISSUED", "PRINTED", "RETURNED"][sequence % 4]


def seed_manual_receipt(
    conn: sqlite3.Connection,
    ledger_entry_id: str,
    collaborator_id: str,
    receipt_number: str,
    sequence: int,
) -> None:
    if "ledger_receipts" not in {row["name"] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}:
        return
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    status = manual_receipt_status(sequence)
    issued_at = now if status in {"ISSUED", "PRINTED", "RETURNED"} else None
    printed_at = now if status in {"PRINTED", "RETURNED"} else None
    returned_at = now if status == "RETURNED" else None
    upsert_filtered_row(
        conn,
        "ledger_receipts",
        {
            "id": f"manual-receipt-{ledger_entry_id}",
            "created_at": now,
            "updated_at": now,
            "tenant_id": TENANT_ID,
            "collaborator_id": collaborator_id,
            "ledger_entry_id": ledger_entry_id,
            "receipt_number": receipt_number,
            "receipt_type": "LEDGER_DEBIT",
            "status": status,
            "issued_at": issued_at,
            "issued_by": "manual-testdata" if issued_at else None,
            "printed_at": printed_at,
            "signed_at": returned_at,
            "returned_at": returned_at,
            "received_by": "manual-testdata" if returned_at else None,
            "signed_document_ref": f"manual/{receipt_number}.pdf" if returned_at else None,
            "notes": "Manual seed receipt lifecycle sample.",
        },
    )


def upsert_reference_data(conn: sqlite3.Connection) -> None:
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    rows = [
        ("ref-person-status-active", "person_status", "ACTIVE", "Active", "Currently active", 10),
        ("ref-person-status-inactive", "person_status", "INACTIVE", "Inactive", "Inactive person", 20),
        ("ref-person-status-discontinued", "person_status", "DISCONTINUED", "Discontinued", "Discontinued person", 30),
        ("ref-collaborator-status-active", "collaborator_status", "ACTIVE", "Active", "Active collaborator journey", 10),
        ("ref-collaborator-status-finished", "collaborator_status", "FINISHED", "Finished", "Finished collaborator journey", 20),
        ("ref-method-daily", "method", "DAILY", "Daily wage", "Paid by daily wage in BRL", 10),
        ("ref-method-daily-wages", "method", "DAILY_WAGES", "Daily Wages", "Paid per day in BRL", 11),
        ("ref-method-commission", "method", "COMMISSION", "Commission", "Paid in grams of gold based on production", 20),
        ("ref-method-salary", "method", "SALARY", "Salary", "Paid monthly in BRL", 30),
        ("ref-sector-mining", "sector", "MINING", "Mining", "Mining operations", 10),
        ("ref-sector-processing", "sector", "MANUAL_PROCESSING", "Manual Processing", "Processing operations", 20),
        ("ref-sector-support", "sector", "MANUAL_SUPPORT", "Manual Support", "Site support operations", 30),
        ("ref-location-main-mine", "location", "MAIN_MINE", "Main Mine", "Default mine location", 10),
        ("ref-location-well-north", "location", "WELL_NORTH", "North Well", "Manual test gold production well", 20),
        ("ref-location-well-south", "location", "WELL_SOUTH", "South Well", "Manual test gold production well", 30),
        ("ref-location-camp", "location", "MANUAL_CAMP", "Manual Camp", "Camp and lodging", 40),
        ("ref-task-miner", "task", "MINER", "Miner", "Mining collaborator task", 10),
        ("ref-task-processing", "task", "PROCESSING", "Processing", "Gold processing task", 20),
        ("ref-task-maintenance", "task", "MAINTENANCE", "Maintenance", "Maintenance task", 30),
        ("ref-expense-category-canteen", "expense_category", "CANTEEN", "Canteen", "Canteen expense", 10),
        ("ref-expense-category-flight", "expense_category", "FLIGHT", "Flight", "Flight expense", 20),
        ("ref-expense-category-cargo", "expense_category", "CARGO", "Cargo", "Cargo expense", 30),
        ("ref-expense-category-administrative", "expense_category", "ADMINISTRATIVE", "Administrative", "Administrative expense", 35),
        ("ref-expense-category-other", "expense_category", "OTHER", "Other", "Other expense", 40),
        ("ref-value-unit-brl", "value_unit", "BRL", "Brazilian Real", "Brazilian Real monetary value", 10),
        ("ref-value-unit-gold-gram", "value_unit", "GOLD_GRAM", "Gold Gram", "Grams of gold", 20),
        ("ref-currency-brl", "ledger_currency", "BRL", "Real", "Brazilian Real", 10),
        ("ref-currency-gold", "ledger_currency", "GOLD_GRAMS", "Gold Grams", "Grams of gold", 20),
    ]
    for row_id, row_type, code, label, description, sort_order in rows:
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
            (row_id, TENANT_ID, row_type, code, label, description, sort_order, now, now),
        )


def seed_people(conn: sqlite3.Connection) -> None:
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    first_names = [
        "Ana", "Bruno", "Camila", "Davi", "Elisa", "Felipe", "Giovana", "Hugo", "Isabela", "Joao",
        "Karina", "Lucas", "Marina", "Nicolas", "Olivia", "Paulo", "Quiteria", "Rafael", "Sofia", "Tiago",
        "Ursula", "Victor", "Wesley", "Xavier", "Yasmin", "Zeca", "Aline", "Breno", "Clara", "Diego",
        "Estela", "Fabio", "Gisele", "Henrique", "Iara", "Jorge", "Kelly", "Leandro", "Monica", "Nelson",
        "Priscila", "Roberto", "Sandra", "Tadeu", "Valeria", "William", "Yuri", "Bianca", "Cesar", "Daniela",
        "Eduardo", "Fernanda", "Gabriel", "Helena", "Igor", "Julia", "Laura", "Mateus", "Natalia", "Otavio",
        "Patricia", "Renato", "Simone", "Thais", "Vinicius", "Alice", "Caio", "Denise", "Elias", "Flavia",
    ]
    last_names = ["Silva", "Santos", "Oliveira", "Souza", "Pereira", "Costa", "Ferreira", "Almeida", "Ribeiro", "Gomes"]

    for i in range(1, 71):
        first_name = first_names[i - 1]
        last_name = last_names[(i - 1) % len(last_names)]
        nickname = f"MT {i:02d} {first_name}"
        person_id = f"manual-person-{i:03d}"
        conn.execute(
            """
            INSERT INTO people (
              id, tenant_id, first_name, last_name, nickname, cpf, rg, cellular,
              email, country, pix_key, profile_completion_status,
              can_create_collaborator, status_id, notes, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Brasil', ?, 'COMPLETE', 1,
              'ref-person-status-active', ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              first_name = excluded.first_name,
              last_name = excluded.last_name,
              nickname = excluded.nickname,
              cpf = excluded.cpf,
              rg = excluded.rg,
              cellular = excluded.cellular,
              email = excluded.email,
              pix_key = excluded.pix_key,
              profile_completion_status = 'COMPLETE',
              can_create_collaborator = 1,
              status_id = 'ref-person-status-active',
              notes = excluded.notes,
              updated_at = excluded.updated_at
            """,
            (
                person_id,
                TENANT_ID,
                first_name,
                last_name,
                nickname,
                f"900000{i:05d}",
                f"MT-{i:05d}",
                f"1199{i:07d}",
                f"manual.person{i:03d}@example.test",
                f"manual.person{i:03d}@pix.example.test",
                "Manual test seed person with complete profile.",
                now,
                now,
            ),
        )


def seed_collaborators(conn: sqlite3.Connection) -> None:
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    columns = table_columns(conn, "collaborator_journeys")
    sectors = ["ref-sector-mining", "ref-sector-processing", "ref-sector-support"]
    locations = ["ref-location-main-mine", "ref-location-well-north", "ref-location-well-south", "ref-location-camp"]
    tasks = ["ref-task-miner", "ref-task-processing", "ref-task-maintenance"]

    for i in range(1, 41):
        start = TODAY - timedelta(days=60 - (i % 21))
        default_end = start + timedelta(days=90)
        extension_days = 0 if i % 5 else 7
        projected_end = default_end + timedelta(days=extension_days)

        if i <= 16:
            payment_method_id = "ref-method-commission"
            payment_value = 7.5 if i % 4 else 8.0
            daily_brl_amount = None
            fixed_monthly_brl_amount = None
            gold_commission_percent = payment_value
            notes = "Manual test collaborator: gold commission earner."
        elif i <= 32:
            payment_method_id = "ref-method-daily"
            payment_value = 280 + ((i - 17) % 8) * 25
            daily_brl_amount = payment_value
            fixed_monthly_brl_amount = None
            gold_commission_percent = None
            notes = "Manual test collaborator: daily wage earner."
        else:
            payment_method_id = "ref-method-salary"
            payment_value = 4500 + ((i - 33) % 8) * 350
            daily_brl_amount = None
            fixed_monthly_brl_amount = payment_value
            gold_commission_percent = None
            notes = "Manual test collaborator: monthly salary earner."

        values: dict[str, object] = {
            "id": f"manual-collab-{i:03d}",
            "tenant_id": TENANT_ID,
            "person_id": f"manual-person-{i:03d}",
            "journey_start_date": start.isoformat(),
            "default_end_date": default_end.isoformat(),
            "extension_days": extension_days,
            "projected_end_date": projected_end.isoformat(),
            "payment_method_id": payment_method_id,
            "payment_value": payment_value,
            "sector_id": sectors[(i - 1) % len(sectors)],
            "location_id": locations[(i - 1) % len(locations)],
            "task_id": tasks[(i - 1) % len(tasks)],
            "status_id": "ref-collaborator-status-active",
            "notes": notes,
            "created_at": now,
            "updated_at": now,
        }

        if "daily_brl_amount" in columns:
            values["daily_brl_amount"] = daily_brl_amount
        if "fixed_monthly_brl_amount" in columns:
            values["fixed_monthly_brl_amount"] = fixed_monthly_brl_amount
        if "gold_commission_percent" in columns:
            values["gold_commission_percent"] = gold_commission_percent
        if "time_off_gold_split_percent" in columns:
            values["time_off_gold_split_percent"] = 50.0 if payment_method_id == "ref-method-commission" else None
        if "sick_day_off_replacement_gold_grams" in columns:
            values["sick_day_off_replacement_gold_grams"] = 1.0 if payment_method_id == "ref-method-commission" else None
        if "planning_availability" in columns:
            values["planning_availability"] = "ACTIVE"

        assignments = ", ".join(f"{column}=excluded.{column}" for column in values if column != "id")
        conn.execute(
            f"""
            INSERT INTO collaborator_journeys ({', '.join(values.keys())})
            VALUES ({', '.join('?' for _ in values)})
            ON CONFLICT(id) DO UPDATE SET {assignments}
            """,
            list(values.values()),
        )


def seed_price_lists(conn: sqlite3.Connection) -> None:
    if "expense_price_list_items" not in {
        row["name"] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
    }:
        return
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    items = [
        ("manual-price-canteen-meal", "CANTEEN", "MEAL", "Canteen meal", 35.00, 10),
        ("manual-price-canteen-water", "CANTEEN", "WATER", "Bottled water pack", 12.00, 20),
        ("manual-price-canteen-supplies", "CANTEEN", "SUPPLIES", "Canteen supplies", 58.50, 30),
        ("manual-price-admin-phone", "ADMINISTRATIVE", "PHONE", "Phone credit", 45.00, 10),
        ("manual-price-admin-ppe", "ADMINISTRATIVE", "PPE", "Safety equipment replacement", 125.00, 20),
        ("manual-price-admin-docs", "ADMINISTRATIVE", "DOCS", "Administrative documents", 80.00, 30),
    ]
    for item_id, item_type, code, description, unit_price, sort_order in items:
        conn.execute(
            """
            INSERT INTO expense_price_list_items (
              id, created_at, updated_at, tenant_id, item_type, code, description,
              unit_price_brl, active, sort_order
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
            ON CONFLICT(id) DO UPDATE SET
              description = excluded.description,
              unit_price_brl = excluded.unit_price_brl,
              active = 1,
              sort_order = excluded.sort_order,
              updated_at = excluded.updated_at
            """,
            (item_id, now, now, TENANT_ID, item_type, code, description, unit_price, sort_order),
        )


def seed_gold_prices(conn: sqlite3.Connection) -> None:
    tables = {row["name"] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    if "gold_prices" not in tables:
        return
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    for days_ago, price in [(7, 625.0), (3, 632.5), (0, 638.0)]:
        price_date = TODAY - timedelta(days=days_ago)
        conn.execute(
            """
            INSERT INTO gold_prices (
              id, created_at, updated_at, tenant_id, price_date, brl_per_gram,
              recorded_by, notes, active
            ) VALUES (?, ?, ?, ?, ?, ?, 'manual-testdata', 'Manual test seed gold price.', 1)
            ON CONFLICT(id) DO UPDATE SET
              brl_per_gram = excluded.brl_per_gram,
              recorded_by = excluded.recorded_by,
              notes = excluded.notes,
              active = 1,
              updated_at = excluded.updated_at
            """,
            (f"manual-gold-price-{price_date.isoformat()}", now, now, TENANT_ID, price_date.isoformat(), price),
        )


def seed_expenses(conn: sqlite3.Connection, rng: random.Random) -> None:
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    expense_columns = table_columns(conn, "expenses")
    price_items = conn.execute(
        "SELECT id, item_type, code, description, unit_price_brl FROM expense_price_list_items WHERE tenant_id = ? AND active = 1 ORDER BY sort_order, id",
        (TENANT_ID,),
    ).fetchall() if "expense_price_list_items" in {row["name"] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")} else []
    categories = [
        ("ref-expense-category-canteen", "CANTEEN", "Canteen manual seed expense"),
        ("ref-expense-category-administrative", "ADMINISTRATIVE", "Administrative manual seed expense"),
        ("ref-expense-category-cargo", "CARGO", "Cargo manual seed expense"),
        ("ref-expense-category-flight", "FLIGHT", "Flight manual seed expense"),
        ("ref-expense-category-other", "OTHER", "Other manual seed expense"),
    ]

    for i in range(1, 81):
        collaborator_index = ((i - 1) % 40) + 1
        category_id, item_type, default_description = categories[(i - 1) % len(categories)]
        expense_date = TODAY - timedelta(days=(i % 28))
        quantity = float(1 + (i % 3))
        price_item = price_items[(i - 1) % len(price_items)] if price_items and item_type in {"CANTEEN", "ADMINISTRATIVE"} else None
        unit_price_brl = float(price_item["unit_price_brl"]) if price_item else float(25 + (i % 12) * 15)
        total = round(unit_price_brl * quantity, 2)
        values: dict[str, object] = {
            "id": f"manual-expense-{i:03d}",
            "created_at": now,
            "updated_at": now,
            "tenant_id": TENANT_ID,
            "collaborator_id": f"manual-collab-{collaborator_index:03d}",
            "expense_category_id": category_id,
            "value_unit_id": "ref-value-unit-brl",
            "amount": total,
            "expense_date": expense_date.isoformat(),
            "description": f"{default_description} #{i:03d}",
        }
        if "active" in expense_columns:
            values["active"] = 1
        if "price_list_item_id" in expense_columns:
            values["price_list_item_id"] = price_item["id"] if price_item else None
        if "item_type" in expense_columns:
            values["item_type"] = price_item["item_type"] if price_item else item_type
        if "price_list_item_code" in expense_columns:
            values["price_list_item_code"] = price_item["code"] if price_item else None
        if "item_description" in expense_columns:
            values["item_description"] = price_item["description"] if price_item else default_description
        if "quantity" in expense_columns:
            values["quantity"] = quantity
        if "unit_price_brl" in expense_columns:
            values["unit_price_brl"] = unit_price_brl
        if "currency_code" in expense_columns:
            values["currency_code"] = "BRL"
        if "unit_price_amount" in expense_columns:
            values["unit_price_amount"] = unit_price_brl
        if "total_amount" in expense_columns:
            values["total_amount"] = total
        if "calculation_method" in expense_columns:
            values["calculation_method"] = "BRL_PRICE_LIST" if price_item else "MANUAL_AMOUNT"
        if "calculation_details_json" in expense_columns:
            values["calculation_details_json"] = '{"source":"manual-testdata"}'

        assignments = ", ".join(f"{column}=excluded.{column}" for column in values if column != "id")
        conn.execute(
            f"""
            INSERT INTO expenses ({', '.join(values.keys())})
            VALUES ({', '.join('?' for _ in values)})
            ON CONFLICT(id) DO UPDATE SET {assignments}
            """,
            list(values.values()),
        )


def seed_expense_ledger_entries(conn: sqlite3.Connection) -> None:
    if "ledger_entries" not in {row["name"] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}:
        return
    for row in conn.execute(
        """
        SELECT id, created_at, updated_at, tenant_id, collaborator_id, value_unit_id,
               amount, expense_date, description, active
        FROM expenses
        WHERE id LIKE 'manual-expense-%'
        ORDER BY id
        """
    ):
        ledger_id = f"manual-ledger-expense-{row['id'].replace('manual-expense-', '')}"
        upsert_filtered_row(
            conn,
            "ledger_entries",
            {
                "id": ledger_id,
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
                "tenant_id": row["tenant_id"],
                "collaborator_id": row["collaborator_id"],
                "value_unit_id": row["value_unit_id"],
                "entry_type": "EXPENSE_DEDUCTION",
                "direction": "DEBIT",
                "amount": row["amount"],
                "effective_date": row["expense_date"],
                "source_type": "EXPENSE",
                "source_id": row["id"],
                "description": row["description"],
                "active": row["active"],
                "correction_type": "ORIGINAL",
            },
        )
        seed_manual_receipt(
            conn,
            ledger_id,
            row["collaborator_id"],
            f"MAN-EXP-{row['id'].replace('manual-expense-', '')}",
            int(row["id"].replace("manual-expense-", "")),
        )


def seed_pix_ledger_entries(conn: sqlite3.Connection) -> None:
    if "ledger_entries" not in {row["name"] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}:
        return
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    for i in range(1, 16):
        collaborator_id = f"manual-collab-{((i * 2 - 1) % 40) + 1:03d}"
        effective_date = TODAY - timedelta(days=i % 14)
        amount = float(175 + (i % 6) * 65)
        ledger_id = f"manual-ledger-pix-{i:03d}"
        upsert_filtered_row(
            conn,
            "ledger_entries",
            {
                "id": ledger_id,
                "created_at": now,
                "updated_at": now,
                "tenant_id": TENANT_ID,
                "collaborator_id": collaborator_id,
                "value_unit_id": "ref-value-unit-brl",
                "entry_type": "PIX_REMITTANCE",
                "direction": "DEBIT",
                "amount": amount,
                "effective_date": effective_date.isoformat(),
                "source_type": "PIX_REMITTANCE",
                "source_id": f"manual-pix-remittance-{i:03d}",
                "description": "Manual seed PIX remittance",
                "active": 1,
                "correction_type": "ORIGINAL",
            },
        )
        seed_manual_receipt(conn, ledger_id, collaborator_id, f"MAN-PIX-{i:03d}", i + 80)


def seed_earning_ledger_entries(conn: sqlite3.Connection) -> None:
    tables = {row["name"] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    if "ledger_entries" not in tables or "work_periods" not in tables:
        return
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    work_periods = conn.execute(
        """
        SELECT id, work_date
        FROM work_periods
        WHERE id LIKE 'manual-work-period-%'
        ORDER BY work_date ASC
        LIMIT 12
        """
    ).fetchall()
    collaborators = conn.execute(
        """
        SELECT id, payment_method_id, payment_value, daily_brl_amount,
               fixed_monthly_brl_amount, gold_commission_percent
        FROM collaborator_journeys
        WHERE id LIKE 'manual-collab-%'
        ORDER BY id
        """
    ).fetchall()
    for period_index, period in enumerate(work_periods, start=1):
        total_gold = 76.0
        if "gold_production_entries" in tables:
            produced = conn.execute(
                """
                SELECT SUM(gold_grams_produced) AS total_gold
                FROM gold_production_entries
                WHERE work_period_id = ? AND active = 1
                """,
                (period["id"],),
            ).fetchone()
            if produced and produced["total_gold"] is not None:
                total_gold = float(produced["total_gold"])
        for collaborator_index, collaborator in enumerate(collaborators, start=1):
            method = collaborator["payment_method_id"]
            if method == "ref-method-commission":
                value_unit_id = "ref-value-unit-gold-gram"
                rate = float(collaborator["gold_commission_percent"] or collaborator["payment_value"] or 0)
                amount = round(total_gold * rate / 100, 4)
                description = "Manual seed posted gold commission earning"
            elif method in {"ref-method-daily", "ref-method-daily-wages"}:
                value_unit_id = "ref-value-unit-brl"
                amount = round(float(collaborator["daily_brl_amount"] or collaborator["payment_value"] or 0), 2)
                description = "Manual seed posted daily wage earning"
            else:
                value_unit_id = "ref-value-unit-brl"
                monthly = float(collaborator["fixed_monthly_brl_amount"] or collaborator["payment_value"] or 0)
                amount = round(monthly / 30, 2)
                description = "Manual seed posted salary daily equivalent earning"
            if amount <= 0:
                continue
            upsert_filtered_row(
                conn,
                "ledger_entries",
                {
                    "id": f"manual-ledger-earning-{period_index:02d}-{collaborator_index:03d}",
                    "created_at": now,
                    "updated_at": now,
                    "tenant_id": TENANT_ID,
                    "collaborator_id": collaborator["id"],
                    "value_unit_id": value_unit_id,
                    "entry_type": "EARNING_CREDIT",
                    "direction": "CREDIT",
                    "amount": amount,
                    "effective_date": period["work_date"],
                    "source_type": "MANUAL_WORK_PERIOD_EARNING",
                    "source_id": f"{period['id']}:{collaborator['id']}",
                    "description": description,
                    "active": 1,
                    "correction_type": "ORIGINAL",
                },
            )


def seed_current_account_ledger(conn: sqlite3.Connection) -> None:
    seed_expense_ledger_entries(conn)
    seed_pix_ledger_entries(conn)
    seed_earning_ledger_entries(conn)




def seed_work_periods(conn: sqlite3.Connection, days: int) -> None:
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    for period_index, offset in enumerate(range(days - 1, -1, -1), start=1):
        work_date = TODAY - timedelta(days=offset)
        status = "FULLY_POSTED" if period_index <= 12 else "ACCRUAL_OPEN"
        conn.execute(
            """
            INSERT INTO work_periods (
              id, tenant_id, work_date, period_code, name, starts_at, ends_at,
              status, informed_at, accrual_opened_at, created_at, updated_at
            ) VALUES (?, ?, ?, 'DAY', ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(tenant_id, work_date, period_code) DO UPDATE SET
              name = excluded.name,
              starts_at = excluded.starts_at,
              ends_at = excluded.ends_at,
              status = excluded.status,
              informed_at = excluded.informed_at,
              accrual_opened_at = excluded.accrual_opened_at,
              updated_at = excluded.updated_at
            """,
            (
                f"manual-work-period-{work_date.isoformat()}",
                TENANT_ID,
                work_date.isoformat(),
                f"Manual Work Period {work_date.isoformat()}",
                f"{work_date.isoformat()} 07:00:00",
                f"{work_date.isoformat()} 17:00:00",
                status,
                f"{work_date.isoformat()} 06:00:00" if status == "FULLY_POSTED" else None,
                f"{work_date.isoformat()} 17:00:00",
                now,
                now,
            ),
        )


def seed_gold_production(conn: sqlite3.Connection, rng: random.Random) -> int:
    tables = {row["name"] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    if "gold_production_entries" not in tables or "work_periods" not in tables:
        return 0
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    work_periods = conn.execute(
        """
        SELECT id, work_date
        FROM work_periods
        WHERE tenant_id = ?
          AND id LIKE 'manual-work-period-%'
          AND status = 'FULLY_POSTED'
        ORDER BY work_date ASC
        LIMIT 12
        """,
        (TENANT_ID,),
    ).fetchall()
    inserted = 0
    for period in work_periods:
        for location_id in ["ref-location-well-north", "ref-location-well-south"]:
            grams = round(38.0 + rng.uniform(-3.25, 3.25), 3)
            entry_id = f"manual-gold-production-{period['work_date']}-{location_id}"
            conn.execute(
                """
                INSERT INTO gold_production_entries (
                  id, tenant_id, work_period_id, location_id, production_date,
                  gold_grams_produced, active, notes, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, 1, 'Manual test seed production around 38g per well/day.', ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                  work_period_id = excluded.work_period_id,
                  location_id = excluded.location_id,
                  production_date = excluded.production_date,
                  gold_grams_produced = excluded.gold_grams_produced,
                  active = 1,
                  notes = excluded.notes,
                  updated_at = excluded.updated_at
                """,
                (entry_id, TENANT_ID, period["id"], location_id, period["work_date"], grams, now, now),
            )
            inserted += 1
    return inserted


def seed_manual_accrual_runs(conn: sqlite3.Connection) -> None:
    tables = {row["name"] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    if "accrual_runs" not in tables or "work_periods" not in tables:
        return

    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    work_periods = conn.execute(
        """
        SELECT id, work_date, status
        FROM work_periods
        WHERE id LIKE 'manual-work-period-%'
        ORDER BY work_date ASC
        """
    ).fetchall()
    for period_index, period in enumerate(work_periods, start=1):
        posted = period_index <= 12
        run_status = "POSTED" if posted else "PENDING_INPUT"
        notes = "Manual seed: posted accruals." if posted else "Manual seed: waiting for gold production."
        upsert_filtered_row(
            conn,
            "accrual_runs",
            {
                "id": f"manual-accrual-run-{period_index:02d}",
                "tenant_id": TENANT_ID,
                "work_period_id": period["id"],
                "status": run_status,
                "accrual_date": period["work_date"],
                "notes": notes,
                "created_at": now,
                "updated_at": now,
            },
        )


def manual_seed_counts(conn: sqlite3.Connection) -> dict[str, int]:
    table_names = {row["name"] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    return {
        "people": conn.execute("SELECT COUNT(*) FROM people WHERE id LIKE 'manual-person-%'").fetchone()[0],
        "collaborators": conn.execute("SELECT COUNT(*) FROM collaborator_journeys WHERE id LIKE 'manual-collab-%'").fetchone()[0],
        "expenses": conn.execute("SELECT COUNT(*) FROM expenses WHERE id LIKE 'manual-expense-%'").fetchone()[0],
        "work_periods": conn.execute("SELECT COUNT(*) FROM work_periods WHERE id LIKE 'manual-work-period-%'").fetchone()[0] if "work_periods" in table_names else 0,
        "gold_production": conn.execute("SELECT COUNT(*) FROM gold_production_entries WHERE id LIKE 'manual-gold-production-%'").fetchone()[0] if "gold_production_entries" in table_names else 0,
        "earning_ledger": conn.execute("SELECT COUNT(*) FROM ledger_entries WHERE id LIKE 'manual-ledger-earning-%'").fetchone()[0] if "ledger_entries" in table_names else 0,
        "expense_ledger": conn.execute("SELECT COUNT(*) FROM ledger_entries WHERE id LIKE 'manual-ledger-expense-%'").fetchone()[0] if "ledger_entries" in table_names else 0,
        "pix_ledger": conn.execute("SELECT COUNT(*) FROM ledger_entries WHERE id LIKE 'manual-ledger-pix-%'").fetchone()[0] if "ledger_entries" in table_names else 0,
        "receipts": conn.execute("SELECT COUNT(*) FROM ledger_receipts WHERE id LIKE 'manual-receipt-%'").fetchone()[0] if "ledger_receipts" in table_names else 0,
    }


def assert_manual_seed_counts(conn: sqlite3.Connection, expect_work_periods: bool) -> None:
    counts = manual_seed_counts(conn)
    expected = {"people": 70, "collaborators": 40, "expenses": 80, "expense_ledger": 80, "pix_ledger": 15}
    if expect_work_periods:
        expected.update({"work_periods": 14, "gold_production": 24, "earning_ledger": 480})
    for label, count in expected.items():
        if counts[label] != count:
            raise SystemExit(
                f"Manual seed verification failed for {label}: expected {count}, got {counts[label]}."
            )

    if expect_work_periods and "accrual_runs" in {row["name"] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}:
        posted = conn.execute(
            "SELECT COUNT(*) FROM accrual_runs WHERE id LIKE 'manual-accrual-run-%' AND status = 'POSTED'"
        ).fetchone()[0]
        pending = conn.execute(
            "SELECT COUNT(*) FROM accrual_runs WHERE id LIKE 'manual-accrual-run-%' AND status = 'PENDING_INPUT'"
        ).fetchone()[0]
        if posted != 12 or pending != 2:
            raise SystemExit(
                "Manual seed verification failed for accrual runs: "
                f"expected posted=12 and pending=2, got posted={posted} and pending={pending}."
            )


def print_summary(conn: sqlite3.Connection, production_rows: int) -> None:
    counts = manual_seed_counts(conn)
    payment_mix = conn.execute(
        """
        SELECT payment_method_id, COUNT(*) AS count
        FROM collaborator_journeys
        WHERE id LIKE 'manual-collab-%'
        GROUP BY payment_method_id
        ORDER BY payment_method_id
        """
    ).fetchall()
    print("✅ Manual test data seeded.")
    print(f"  People:        {counts['people']}")
    print(f"  Collaborators: {counts['collaborators']}")
    print(f"  Expenses:      {counts['expenses']}")
    print(f"  Work Periods:  {counts['work_periods']}")
    print(f"  Gold production rows created/updated this run: {production_rows}")
    print(f"  Earning ledger entries: {counts['earning_ledger']}")
    print(f"  Expense ledger entries: {counts['expense_ledger']}")
    print(f"  PIX ledger entries:     {counts['pix_ledger']}")
    print(f"  Ledger receipts:        {counts['receipts']}")
    print("  Collaborator payment mix:")
    for row in payment_mix:
        print(f"    {row['payment_method_id']}: {row['count']}")


def main() -> None:
    args = parse_args()
    rng = random.Random(args.seed)
    db_path = Path(args.db_path).expanduser().resolve()
    if not db_path.exists():
        raise SystemExit(f"Database does not exist: {db_path}. Run migrations first.")

    with connect(str(db_path)) as conn:
        require_tables(conn, ["tenants", "reference_data", "people", "collaborator_journeys", "expenses"])
        with conn:
            upsert_reference_data(conn)
            seed_people(conn)
            seed_collaborators(conn)
            seed_price_lists(conn)
            seed_gold_prices(conn)
            seed_expenses(conn, rng)
            if args.with_work_periods:
                seed_work_periods(conn, args.work_period_days)
            production_rows = seed_gold_production(conn, rng)
            if args.with_work_periods:
                seed_manual_accrual_runs(conn)
            seed_current_account_ledger(conn)
            assert_manual_seed_counts(conn, args.with_work_periods)
        print_summary(conn, production_rows)
        if production_rows == 0:
            print("\nℹ️  No gold production rows were seeded because no Work Periods exist yet.")
            print("   Create Work Periods manually and rerun make manual-testdata-local-seed, or use:")
            print("   make manual-testdata-local-reset-with-work-periods")


if __name__ == "__main__":
    main()
