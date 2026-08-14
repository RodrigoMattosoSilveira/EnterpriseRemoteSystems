# Introduction
A clean restart of the server phase in this order:
```
development → test → production → edge Caddy → smoke tests
```

The key thing is ensure the following Compose project names:
```
ers-dev
ers-tst
ers-prd
```

# Phase 1 — Development

**From the server:**
```bash
cd /opt/EnterpriseRemoteSystems/development
```

**Pull latest code:**
Assuming the your repository's development branch has the lasted updates and that `/opt/EnterpriseRemoteSystems/development` a project clone, with `development` as the current branch"
``` bash
git pull
```

Clean up any old dev stack variants:
``` bash
docker compose \
  -p enterpriseremotesystems-dev \
  --env-file .env.development \
  -f docker-compose.server.yml \
  down 2>/dev/null || true

docker compose \
  -p ers-dev \
  --env-file .env.development \
  -f docker-compose.server.yml \
  down 2>/dev/null || true
```

**Initialize env if needed:**
``` bash
make server-init-env ENV=development SERVER_ROOT=/opt/EnterpriseRemoteSystems
```

**Build and start:**
``` bash
make server-dev-build SERVER_ROOT=/opt/EnterpriseRemoteSystems
make server-dev-up SERVER_ROOT=/opt/EnterpriseRemoteSystems
```

**Verify containers:**
``` bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep ers-dev
```

**Expected:**
``` bash
ers-dev-backend    Up ... healthy
ers-dev-frontend   Up ...
ers-dev-caddy      Up ...
```

**Verify network:**
```bash
docker network ls | grep ers-dev
```

**Expected:**
``` bash
ers-dev_default
```

**Test internally:**
```bash
docker run --rm --network ers-dev_default curlimages/curl:latest \
  -i http://ers-dev-caddy/api/v1/healthz
```

**Expected:**
```
HTTP/1.1 200 OK
```

Do not continue to test until development passes this internal Caddy health check.

# Phase 2 — Test
**Pull latest code:**
Assuming the your repository's development branch has the lasted updates and that `/opt/EnterpriseRemoteSystems/test` has a project clone, with `test` as the current branch"
```bash
cd /opt/EnterpriseRemoteSystems/test
git pull
```

**Clean old wrong stack:**
```bash
docker compose \
  -p enterpriseremotesystems-tst \
  --env-file .env.test \
  -f docker-compose.server.yml \
  down 2>/dev/null || true

docker compose \
  -p ers-tst \
  --env-file .env.test \
  -f docker-compose.server.yml \
  down 2>/dev/null || true
```

**Initialize env if needed:**
```bash
make server-init-env ENV=test SERVER_ROOT=/opt/EnterpriseRemoteSystems
```

**Build and start:**
```bash
make server-test-build SERVER_ROOT=/opt/EnterpriseRemoteSystems
make server-test-up SERVER_ROOT=/opt/EnterpriseRemoteSystems
```

**Verify:**
```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep ers-tst
docker network ls | grep ers-tst
```

**Expected network:**
```
ers-tst_default
```

**Internal test:**
```bash
docker run --rm --network ers-tst_default curlimages/curl:latest \
  -i http://ers-tst-caddy/api/v1/healthz
```

**Expected:**
```bash
HTTP/1.1 200 OK
```

# Phase 3 — Production
Assuming the your repository's development branch has the lasted updates and that `/opt/EnterpriseRemoteSystems/production` has a project clone, with `production` as the current branch"
```bash
cd /opt/EnterpriseRemoteSystems/production
git checkout production
git pull --ff-only origin production
```

**Clean old wrong stack:**
```bash
docker compose \
  -p enterpriseremotesystems-prd \
  --env-file .env.production \
  -f docker-compose.server.yml \
  down 2>/dev/null || true

docker compose \
  -p ers-prd \
  --env-file .env.production \
  -f docker-compose.server.yml \
  down 2>/dev/null || true
```

**Initialize env if needed:**
```bash
make server-init-env ENV=production SERVER_ROOT=/opt/EnterpriseRemoteSystems
```

**Build and start:**
```bash
make server-prod-build SERVER_ROOT=/opt/EnterpriseRemoteSystems
make server-prod-up SERVER_ROOT=/opt/EnterpriseRemoteSystems
```

Verify:
```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep ers-prd
docker network ls | grep ers-prd
```

**Expected network:**
```bash
ers-prd_default
```

**Internal test:**
```bash
docker run --rm --network ers-prd_default curlimages/curl:latest \
  -i http://ers-prd-caddy/api/v1/healthz
```

**Expected:**
```bash
HTTP/1.1 200 OK
```

# Phase 4 — Confirm all environment networks

**Run:**
```bash
docker network ls | grep ers
```

**Expected:**
```bash
ers-dev_default
ers-tst_default
ers-prd_default
```

**Also confirm old wrong networks are gone or unused:**
```bash
docker network ls | grep enterpriseremotesystems
docker network ls | grep reverse-proxy
```

If you see old networks and no containers are attached, remove them later. Not necessary before edge startup unless they own ports or confuse routing.

# Phase 5 — Start edge Caddy

**First remove the old public Caddy if it still exists:**
```bash
docker stop collaborator-caddy 2>/dev/null || true
docker rm collaborator-caddy 2>/dev/null || true
```

**Then:**
```bash
cd /opt/EnterpriseRemoteSystems/development
make edge-up SERVER_ROOT=/opt/EnterpriseRemoteSystems
```

**Verify:**
```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep caddy
```

**Expected:**
```bash
ers-dev-caddy     Up ...   80/tcp, ...
ers-tst-caddy     Up ...   80/tcp, ...
ers-prd-caddy     Up ...   80/tcp, ...
ers-edge-caddy    Up ...   0.0.0.0:80->80/tcp, 0.0.0.0:443->443/tcp, ...
```

**Confirm edge is attached to all three networks:**
```bash
docker network inspect ers-dev_default \
  --format '{{range $id, $c := .Containers}}{{$c.Name}}{{"\n"}}{{end}}'

docker network inspect ers-tst_default \
  --format '{{range $id, $c := .Containers}}{{$c.Name}}{{"\n"}}{{end}}'

docker network inspect ers-prd_default \
  --format '{{range $id, $c := .Containers}}{{$c.Name}}{{"\n"}}{{end}}'
```

**Each should include:**
```bash
ers-edge-caddy
```

plus the corresponding environment Caddy.

# Phase 6 — Public smoke tests

**Run:**
```bash
curl -i https://dev.enterpriseremotesystems.com/api/v1/healthz
curl -i https://tst.enterpriseremotesystems.com/api/v1/healthz
curl -i https://app.enterpriseremotesystems.com/api/v1/healthz
```

**Then:**
```bash
make server-dev-smoke SERVER_ROOT=/opt/EnterpriseRemoteSystems
make server-test-smoke SERVER_ROOT=/opt/EnterpriseRemoteSystems
make server-prod-smoke SERVER_ROOT=/opt/EnterpriseRemoteSystems
```

**Stop at the first failure and inspect the relevant logs:**
```bash
docker logs ers-dev-backend --tail=100
docker logs ers-dev-caddy --tail=100
docker logs ers-edge-caddy --tail=100
```

For test/production, replace dev with tst or prd.