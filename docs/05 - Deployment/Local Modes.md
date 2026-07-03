There are two valid local modes
## Mode 1: Docker server-style mode

Use this when testing the deployment shape.

**Start:**
```bash
docker compose \
  --env-file .env.development \
  -f docker-compose.server.yml \
  -f docker-compose.local.yml \
  -p ers-dev \
  down

docker compose \
  --env-file .env.development \
  -f docker-compose.server.yml \
  -f docker-compose.local.yml \
  -p ers-dev \
  build

docker compose \
  --env-file .env.development \
  -f docker-compose.server.yml \
  -f docker-compose.local.yml \
  -p ers-dev \
  up -d
```
**Then test frontend through local Caddy:**
```bash
curl -i http://localhost:8088
```

**Test backend through local Caddy:**
```bash
curl -i http://localhost:8088/api/v1/healthz
```

**Test backend directly:**
```bash
curl -i http://localhost:8080/api/v1/healthz
```

## Mode 2: normal app development mode
Use this when actively editing React and Go.

**Terminal 1:**
``` bash
cd backend
go run ./cmd/api

or whatever your actual backend command path is.
```
**Terminal 2:**
``` bash
cd frontend
npm run dev
```
**Then this should work:**
``` bash
curl -i http://localhost:5173
``

In this mode, Vite should proxy /api to the backend.