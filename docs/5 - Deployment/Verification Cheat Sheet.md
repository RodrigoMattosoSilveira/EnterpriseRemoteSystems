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
git status
git add backend
git commit -m "Add accrual runs and accrual items foundation"
git push origin development

## Verify DEV:

cd /opt/EnterpriseRemoteSystems/development

docker logs ers-dev-backend --since=5m --tail=200
docker logs -f ers-dev-backend
docker inspect ers-dev-backend \
  --format 'Time={{.Created}} Status={{.State.Status}} Health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}'
docker exec ers-dev-backend curl -i http://localhost:8080/api/v1/healthz

## Verify migration:

docker compose \
  -p ers-dev \
  --env-file .env.development \
  -f docker-compose.server.yml \
  run --rm --no-deps --entrypoint sh backend -lc '
sqlite3 /app/data/app.db "
SELECT filename
FROM schema_migrations
WHERE filename = \"000015_create_accrual_runs_and_items.up.sql\";
"
'

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
docker inspect ers-tst-backend \
  --format 'Time={{.Created}} Status={{.State.Status}} Health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}'
docker exec ers-tst-backend curl -i http://localhost:8080/api/v1/healthz
```

## Verify migration:

```bash
docker compose \
  -p ers-tst \
  --env-file .env.test \
  -f docker-compose.server.yml \
  run --rm --no-deps --entrypoint sh backend -lc '
sqlite3 /app/data/app.db "
SELECT filename
FROM schema_migrations
WHERE filename = \"000015_create_accrual_runs_and_items.up.sql\";
"
'
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
docker inspect ers-prd-backend \
  --format 'Time={{.Created}} Status={{.State.Status}} Health={{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}'
docker exec ers-prd-backend curl -i http://localhost:8080/api/v1/healthz
```

## Verify production migration:

```bash
docker compose \
  -p ers-prd \
  --env-file .env.production \
  -f docker-compose.server.yml \
  run --rm --no-deps --entrypoint sh backend -lc '
sqlite3 /app/data/app.db "
SELECT filename
FROM schema_migrations
WHERE filename = \"000015_create_accrual_runs_and_items.up.sql\";
"
'
```bash