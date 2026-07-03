# Prior to promote to developemtn

## Test the backend
```bash
go clean -testcache
go test ./...
```

## Test the frontend

```bash
npm run check
num run test:run
npm run test:e2e
```

# 1. Commit and push to development
```bash
git status
git add backend
git commit -m "Add accrual runs and accrual items foundation"
git push origin development
```

## Verify DEV:
```bash
cd /opt/EnterpriseRemocd ../t teSystems/development

docker logs ers-dev-backend --since=5m --tail=200
docker logs -f ers-dev-backend
container=ers-dev-backend; printf 'Created=%s %s\n' "$(TZ=America/Los_Angeles date --date="$(docker inspect "$container" --format '{{.Created}}')" '+%Y-%m-%d %I:%M:%S %p %Z')" "$(docker inspect "$container" --format 'Status={{.State.Status}} Health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}')"
docker exec ers-dev-backend curl -i http://localhost:8080/api/v1/healthz
curl -i https://dev.enterpriseremotesystems.com/api/v1/healthz
```

## Verify migration:

```bash
docker compose \
  -p ers-dev \
  --env-file .env.development \
  -f docker-compose.server.yml \
  run --rm --no-deps --entrypoint sh backend -lc '
sqlite3 /app/data/app.db ".schema ledger_receipts"
'

docker exec ers-dev-backend \
  sqlite3 /app/data/app.db \
  'SELECT filename FROM schema_migrations WHERE filename = "000019_create_ledger_receipts.up.sql";'
```

# 2. Promote development to test
```bash
git checkout test
git pull origin test
git merge development
git push origin test
```

# Verify TST:

```bash
cd /opt/EnterpriseRemoteSystems/test


docker logs ers-tst-backend --since=5m --tail=200
docker logs -f ers-tst-backend
container=ers-tst-backend; printf 'Created=%s %s\n' "$(TZ=America/Los_Angeles date --date="$(docker inspect "$container" --format '{{.Created}}')" '+%Y-%m-%d %I:%M:%S %p %Z')" "$(docker inspect "$container" --format 'Status={{.State.Status}} Health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}')"
docker exec ers-tst-backend curl -i http://localhost:8080/api/v1/healthz
curl -i https://tst.enterpriseremotesystems.com/api/v1/healthz
```

## Verify migration:

```bash
docker compose \
  -p ers-tst \
  --env-file .env.test \
  -f docker-compose.server.yml \
  run --rm --no-deps --entrypoint sh backend -lc '
sqlite3 /app/data/app.db ".schema ledger_receipts"
'

docker exec ers-tst-backend \
  sqlite3 /app/data/app.db \
  'SELECT filename FROM schema_migrations WHERE filename = "000019_create_ledger_receipts.up.sql";'
```

# 3. Promote test to production

Only after TST is healthy:

```bash
git checkout production
git pull origin production
git merge test
git push origin production
```

## Verify PRD:
```bash
cd /opt/EnterpriseRemoteSystems/production

docker logs ers-prd-backend --since=5m --tail=200
docker logs -f ers-prd-backend
container=ers-prd-backend; printf 'Created=%s %s\n' "$(TZ=America/Los_Angeles date --date="$(docker inspect "$container" --format '{{.Created}}')" '+%Y-%m-%d %I:%M:%S %p %Z')" "$(docker inspect "$container" --format 'Status={{.State.Status}} Health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}')"
docker exec ers-prd-backend curl -i http://localhost:8080/api/v1/healthz
curl -i https://app.enterpriseremotesystems.com/api/v1/healthz
```

## Verify production migration:

```bash
docker compose \
  -p ers-prd \
  --env-file .env.production \
  -f docker-compose.server.yml \
  run --rm --no-deps --entrypoint sh backend -lc '
sqlite3 /app/data/app.db ".schema ledger_receipts"
'

docker exec ers-prd-backend \
  sqlite3 /app/data/app.db \
  'SELECT filename FROM schema_migrations WHERE filename = "000019_create_ledger_receipts.up.sql";'
```