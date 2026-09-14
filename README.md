# Enterprise Remote System

Production-oriented monorepo for a mobile-first Enterprise Remote System app.

## Production baseline

The post-Bite-30 Production architecture is the current baseline:

- Frontend: React + TypeScript, served by Nginx in Docker
- Backend: Go + Fiber in Docker
- Database: SQLite, persisted per environment and migrated in place
- Server deployment: Docker Compose on the ERS server
- Edge: Caddy reverse proxy / TLS termination
- CI/CD: GitHub Actions promotion through Development, Test, and Production
- Contract tooling: OpenAPI sources under `contracts/` generate Go and TypeScript artifacts
- Identity/access: canonical Authentication Account -> AccountActor -> APPLICATION or TENANT Actor -> exact Tenant Membership

The older Cloud Run / Cloud SQL notes in historical architecture documents are not the deployed Production topology. See `docs/05 - Deployment/Server Setup.md` for the server deployment model.

## Post-Bite-30 roadmap checkpoint

Bite 30 is the completed Identity/Access baseline. The remaining GitHub backlog has been reconciled against the exact Production source tree in:

- `docs/post-bite-30-backlog-reconciliation.md`
- `docs/post-bite-30-backlog-reconciliation.json`

Validate the reconciliation with:

```bash
make post-bite30-backlog-reconciliation-check
```

The reconciliation intentionally does not define Bite 31.


# Daily Workflow
## Build API (if necessary)
```bash
make openapi
```

## Terminal 1 (launch backend):
```bash
cd backend
air
```
## Terminal 2 (launch fronten d):
```bash
cd frontend
npm run dev
```

## Browser
Open:
```bash
http://localhost:5173
```

Your frontend changes hot reload through Vite, and backend Go changes restart automatically through air.

## Quick start
### Run development
```bash
make ddev
```
### Open:
```bash
http://localhost:5173
```

Backend health:
```bash
curl http://localhost:8080/healthz
```

## Run production-like local
```bash
mkdir -p data
docker compose up --build
```

### Open:

```bash
http://localhost:3000
```

# Development launch flow
## Build and start with Docker Compose
### Production-like local
```bash
docker compose up --build
```

### Development
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

## Open the app
### Frontend:
```bash
http://localhost:5173
```

### Backend health check:
```bash
http://localhost:8080/healthz
```

### From terminal:
```bash
curl http://localhost:8080/healthz
```

### Expected:
```JSON
{
  "status": "ok"
}
```

## Stop the app
```bash
docker compose down
```

### To remove containers and volumes:
```bash
docker compose down -v
```

## Rebuild after dependency changes
```bash
docker compose build --no-cache
docker compose up
```

## Useful development commands
### Backend logs:
```bash
docker compose logs -f backend
```

### Frontend logs:
```bash
docker compose logs -f frontend
```

### Open backend shell:
```bash
docker compose exec backend sh
```

### Open frontend shell:
```bash
docker compose exec frontend sh
```

### SQLite database should be mounted under something like:
```bash
./data/app.db
```
### Make sure the data/ folder exists:
```bash
mkdir -p data
```