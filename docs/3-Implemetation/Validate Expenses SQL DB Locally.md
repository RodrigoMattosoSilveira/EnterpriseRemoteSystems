# 1. Copy the DEV database from the server

From the server
```bash
mkdir -p /tmp/ers-db-check

docker cp ers-dev-backend:/app/data/app.db \
  /tmp/ers-db-check/ers-dev-app.db
```

From your local machine:
```bash
mkdir -p /tmp/ers-db-check

scp deploy@178.105.46.193:/tmp/ers-db-check/ers-dev-app.db \
  /tmp/ers-db-check/ers-dev-app.db
```

If that path is different on the server, confirm it with:

```bash
ssh deploy@178.105.46.193 'docker inspect ers-dev-backend --format "{{range .Mounts}}{{println .Source .Destination}}{{end}}"'
```

# 2. Make a working copy
```bash
cp /tmp/ers-db-check/ers-dev-app.db \
   /tmp/ers-db-check/ers-dev-app.backup.db
```

# 3. Apply only migration 000008

From your repo root:
```bash
sqlite3 /tmp/ers-db-check/ers-dev-app.db < backend/migrations/000008_create_expenses.up.sql
```

If it returns no output and exit code 0, the migration applied cleanly.

Check exit code:

```bash
echo $?
```
Expected:

```
0
```

# 4. Verify the schema
```bash
sqlite3 /tmp/ers-db-check/ers-dev-app.db ".schema expenses"
```

You should see the expenses table with columns like:

```
tenant_id
collaborator_id
expense_category_id
value_unit_id
amount
expense_date
description
```

Also verify indexes:

```bash
sqlite3 /tmp/ers-db-check/ers-dev-app.db ".indexes expenses"
```

# 5. Verify foreign keys
```bash
sqlite3 /tmp/ers-db-check/ers-dev-app.db "PRAGMA foreign_key_check;"
```

Expected: no output.

# 6. Verify reference-data seeds are available

Because 000008 creates the table but your seed function provides expense_category and value_unit, also check whether your copied DEV DB already has those after running the new backend locally, or insertions will happen at API startup.

You can check the copied DB with:

```bash
sqlite3 /tmp/ers-db-check/ers-dev-app.db \
  "select type, code, label, active from reference_data where type in ('expense_category','value_unit') order by type, sort_order;"
```

If you have not started the updated backend against this DB, this may return no rows. That is okay if the code seed will run on startup. To fully simulate startup, use your local backend against the copied DB after applying migration:

```bash
cd backend
DATABASE_PATH=/tmp/ers-db-check/ers-dev-app.db APP_ENV=development go run ./cmd/api
```

Stop it after it starts, then re-run:

```bash
sqlite3 /tmp/ers-db-check/ers-dev-app.db \
  "select type, code, label, active from reference_data where type in ('expense_category','value_unit') order by type, sort_order;"
```

Expected rows:

```
expense_category|CANTEEN|Canteen|1
expense_category|FLIGHT|Flight|1
expense_category|CARGO|Cargo|1
expense_category|OTHER|Other|1
value_unit|BRL|Brazilian Real|1
value_unit|GOLD_GRAM|Gold Gram|1
```

Safer full deployment simulation

This applies all pending migrations idempotently, like runtime startup:

```bash
cp /tmp/ers-db-check/ers-dev-app.backup.db \
   /tmp/ers-db-check/app-dev-runtime-sim.db

DATABASE_PATH=/tmp/ers-db-check/app-dev-runtime-sim.db \
  ./scripts/db-migrate.sh
```

Then:

```bash
sqlite3 /tmp/ers-db-check/app-dev-runtime-sim.db ".schema expenses"
sqlite3 /tmp/ers-db-check/app-dev-runtime-sim.db "PRAGMA foreign_key_check;"
```

If those pass, 000008_create_expenses.up.sql is safe for the existing DEV database.