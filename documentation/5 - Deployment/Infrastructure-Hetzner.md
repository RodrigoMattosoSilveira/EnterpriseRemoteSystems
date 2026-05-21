# Recommended infrastructure

Use:

```bash
Hetzner Cloud VPS
Ubuntu 24.04 LTS
Docker + Docker Compose
Caddy reverse proxy
GitHub Actions deployment
Local mounted folder or Hetzner Volume for the database
```

Hetzner supports creating cloud servers with a preinstalled Docker CE image, which is the simplest path if you want Docker-first deployment. You can also use plain Ubuntu 24.04 and install Docker yourself.

For HTTPS and routing, use Caddy. Caddy is designed as a production reverse proxy and automatically manages HTTPS/TLS for configured domains.

# Environment model

Use three environments:

```bash
DEV → development branch
TST → test branch
PRD → production branch
```

You have two practical options.

## Option A — one VPS per environment
```bash
collab-dev-vps
collab-tst-vps
collab-prd-vps
```

This is the cleanest operationally. Each environment has its own server, database volume, logs, secrets, and Docker runtime. A mistake in DEV cannot affect PRD.

Use this when production data becomes important.

## Option B — one VPS with three stacks

```bash
one Hetzner VPS
  dev stack
  tst stack
  prd stack
```

This is cheaper and simple while you are still building.

My recommendation: start with Option B, then move PRD to its own VPS once the app becomes operational.

# Recommended application shape

Use one all-in-one Docker image:

```bash
React/Vite frontend → built into static files
Go Fiber backend → serves API + static frontend
SQLite database → stored in local volume
``

Runtime:

```bash
/app/server
/app/public
/data/app.db
```

Routes:

```bash
/api/v1/*   → backend API
/healthz    → backend health
/*          → React SPA fallback
```

This avoids running separate production frontend/backend containers.

# Server sizing

A reasonable Hetzner starting point is:

```bash
CX22 or CPX11/CPX21 class VPS
Ubuntu 24.04
2 vCPU
4 GB RAM preferred
40 GB+ disk
```

Hetzner community deployment examples commonly reference Ubuntu 24.04 and CX22-class instances as a minimum/simple starting point for Docker Compose workloads.

## For early DEV/TST:
```bash
2 vCPU / 2 GB RAM can work
```

## For PRD:
```bash
2 vCPU / 4 GB RAM is safer
```

# Server directory layout


On the VPS:

```bash
/opt/collaborator-accounting/
  dev/
    docker-compose.yml
    .env
    data/
      app.db
    backups/

  tst/
    docker-compose.yml
    .env
    data/
      app.db
    backups/

  prd/
    docker-compose.yml
    .env
    data/
      app.db
    backups/

/opt/reverse-proxy/
  docker-compose.yml
  Caddyfile
```

If you use a Hetzner attached volume, mount it under something like:

```bash
/mnt/collaborator-data/
  dev/
  tst/
  prd/
```

Then point the compose volumes to that path.

# Domain layout

Point DNS records to the VPS IP:

```bash
dev.yourdomain.com  → Hetzner VPS IP
tst.yourdomain.com  → Hetzner VPS IP
app.yourdomain.com  → Hetzner VPS IP
```

Caddy routes each domain to a different local app port and handles HTTPS automatically.

# Global Caddy reverse proxy
`/opt/reverse-proxy/docker-compose.yml`
```yaml
services:
  caddy:
    image: caddy:2
    container_name: collaborator-caddy
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - ./caddy_data:/data
      - ./caddy_config:/config
    restart: unless-stopped
```

```bash
/opt/reverse-proxy/Caddyfile
dev.yourdomain.com {
  reverse_proxy 127.0.0.1:18081
}

tst.yourdomain.com {
  reverse_proxy 127.0.0.1:18082
}

app.yourdomain.com {
  reverse_proxy 127.0.0.1:18083
}
```

# Per-environment Docker Compose

Use the same compose file in each environment folder.

`/opt/collaborator-accounting/dev/docker-compose.yml`
```yaml
services:
  app:
    image: ghcr.io/YOUR_GITHUB_USER/collaborator-accounting:${APP_VERSION}
    container_name: collaborator-accounting-${APP_ENV}
    environment:
      APP_ENV: ${APP_ENV}
      HTTP_ADDR: ":8080"
      DB_DRIVER: sqlite
      DB_PATH: /data/app.db
      JWT_SECRET: ${JWT_SECRET}
    volumes:
      - ./data:/data
    ports:
      - "127.0.0.1:${APP_PORT}:8080"
    restart: unless-stopped
```
Use the same file for tst and prd.

`dev/.env`
```bash
APP_ENV=dev
APP_PORT=18081
APP_VERSION=development-latest
JWT_SECRET=replace-dev-secret
```

`tst/.env`
```bash
APP_ENV=tst
APP_PORT=18082
APP_VERSION=test-latest
JWT_SECRET=replace-tst-secret
```

`prd/.env`
```bash
APP_ENV=prd
APP_PORT=18083
APP_VERSION=production-latest
JWT_SECRET=replace-prd-secret
```

# Database recommendation

For now, keep SQLite because your explicit requirement is:

database saved in a local volume

That means:

/opt/collaborator-accounting/prd/data/app.db

Important SQLite production settings:

```bash
foreign_keys ON
WAL mode
busy_timeout
single app container writing to DB
nightly backups
```

When ready, you can move to:

`PostgreSQL container + local Docker volume`

or a managed database. GORM will help, but migrations and SQL types still require review.

# Production Dockerfile direction

Use one image at repo root:

```dockerfile
# frontend build
FROM node:22-bookworm AS frontend-builder
WORKDIR /frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend .
RUN npm run build

# backend build
FROM golang:1.25-bookworm AS backend-builder
WORKDIR /src
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libc6-dev sqlite3 libsqlite3-dev ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend .
ENV CGO_ENABLED=1
RUN go build -o /out/server ./cmd/server

# runtime
FROM debian:bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    sqlite3 libsqlite3-0 ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=backend-builder /out/server /app/server
COPY --from=frontend-builder /frontend/dist /app/public
COPY backend/migrations /app/migrations
EXPOSE 8080
CMD ["/app/server"]
```

# Backend static serving

In production, Fiber should serve both API and frontend.

Register API first, then static frontend:

```go
routes.Register(app, deps)

app.Static("/", "/app/public")

app.Get("/*", func(c fiber.Ctx) error {
	return c.SendFile("/app/public/index.html")
})
```

Order matters:

```bash
/api/v1/* first
static files second
SPA fallback last
```

# GitHub Actions branch deployment model

Branch mapping:

```bash
development → dev
test        → tst
production  → prd
```

Workflow:

```bash
merge/push to branch
  run tests
  bundle OpenAPI
  generate frontend/backend API code
  build Docker image
  push image to GHCR
  SSH into Hetzner VPS
  update APP_VERSION
  docker compose pull
  docker compose up -d
```

GitHub Container Registry supports publishing from GitHub Actions using GITHUB_TOKEN, and Docker’s login action supports registry login during workflows.

# GitHub secrets

Create repository secrets:

```bash
HETZNER_HOST
HETZNER_USER
HETZNER_SSH_KEY
```

If your GHCR package is private and the VPS needs to pull it, also create:

GHCR_PAT

with package read access.

Optional later if you split environments:

```bash
DEV_HETZNER_HOST
TST_HETZNER_HOST
PRD_HETZNER_HOST
```

# Deployment paths by branch
```bash
development -> /opt/collaborator-accounting/dev
test        -> /opt/collaborator-accounting/tst
production  -> /opt/collaborator-accounting/prd
```

# GitHub Actions workflow
`.github/workflows/deploy-hetzner.yml`
```yaml
name: Build and Deploy to Hetzner

on:
  push:
    branches:
      - development
      - test
      - production

concurrency:
  group: deploy-${{ github.ref_name }}
  cancel-in-progress: false

jobs:
  build-and-deploy:
    runs-on: ubuntu-latest

    permissions:
      contents: read
      packages: write

    steps:
      - name: Checkout
        uses: actions/checkout@v5

      - name: Set environment
        id: env
        shell: bash
        run: |
          case "${GITHUB_REF_NAME}" in
            development)
              echo "app_env=dev" >> "$GITHUB_OUTPUT"
              echo "deploy_path=/opt/collaborator-accounting/dev" >> "$GITHUB_OUTPUT"
              echo "image_tag=development-${GITHUB_SHA}" >> "$GITHUB_OUTPUT"
              ;;
            test)
              echo "app_env=tst" >> "$GITHUB_OUTPUT"
              echo "deploy_path=/opt/collaborator-accounting/tst" >> "$GITHUB_OUTPUT"
              echo "image_tag=test-${GITHUB_SHA}" >> "$GITHUB_OUTPUT"
              ;;
            production)
              echo "app_env=prd" >> "$GITHUB_OUTPUT"
              echo "deploy_path=/opt/collaborator-accounting/prd" >> "$GITHUB_OUTPUT"
              echo "image_tag=production-${GITHUB_SHA}" >> "$GITHUB_OUTPUT"
              ;;
            *)
              echo "Unsupported branch ${GITHUB_REF_NAME}"
              exit 1
              ;;
          esac

      - name: Setup Node
        uses: actions/setup-node@v5
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: frontend/package-lock.json

      - name: Install frontend dependencies
        working-directory: frontend
        run: npm ci

      - name: Bundle OpenAPI
        run: npx @redocly/cli bundle contracts/openapi.yaml -o contracts/openapi.bundle.yaml

      - name: Generate frontend API
        working-directory: frontend
        run: npx openapi-typescript ../contracts/openapi.bundle.yaml -o src/api/generated/schema.ts

      - name: Test frontend
        working-directory: frontend
        run: npm run test:run

      - name: Setup Go
        uses: actions/setup-go@v6
        with:
          go-version: "1.25"
          cache-dependency-path: backend/go.sum

      - name: Install oapi-codegen
        run: go install github.com/oapi-codegen/oapi-codegen/v2/cmd/oapi-codegen@latest

      - name: Generate backend API
        working-directory: backend
        run: oapi-codegen -config ../contracts/oapi-codegen.yaml ../contracts/openapi.bundle.yaml

      - name: Test backend
        working-directory: backend
        run: go test ./...

      - name: Login to GHCR
        uses: docker/login-action@v4
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and push Docker image
        uses: docker/build-push-action@v7
        with:
          context: .
          file: Dockerfile
          push: true
          tags: ghcr.io/${{ github.repository }}:${{ steps.env.outputs.image_tag }}

      - name: Configure SSH
        shell: bash
        run: |
          mkdir -p ~/.ssh
          echo "${{ secrets.HETZNER_SSH_KEY }}" > ~/.ssh/deploy_key
          chmod 600 ~/.ssh/deploy_key
          ssh-keyscan -H "${{ secrets.HETZNER_HOST }}" >> ~/.ssh/known_hosts

      - name: Deploy on Hetzner VPS
        shell: bash
        run: |
          ssh -i ~/.ssh/deploy_key ${{ secrets.HETZNER_USER }}@${{ secrets.HETZNER_HOST }} << 'EOF'
            set -e
            cd "${{ steps.env.outputs.deploy_path }}"
            sed -i "s|^APP_VERSION=.*|APP_VERSION=${{ steps.env.outputs.image_tag }}|" .env
            docker compose pull
            docker compose up -d
            docker image prune -f
          EOF
```

# Backups

Create a nightly backup script.

`/opt/collaborator-accounting/prd/backup.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

cd /opt/collaborator-accounting/prd

mkdir -p backups

timestamp="$(date +%Y%m%d-%H%M%S)"

sqlite3 data/app.db ".backup 'backups/app-${timestamp}.db'"
gzip "backups/app-${timestamp}.db"

find backups -name "app-*.db.gz" -mtime +30 -delete
```

Cron:

`15 2 * * * /opt/collaborator-accounting/prd/backup.sh >> /var/log/collab-backup.log 2>&1`

Later, add off-server backups using Hetzner Storage Box, S3-compatible storage, or another backup target.

# Initial Hetzner VPS setup
- Create a Hetzner Cloud server.
- Use Ubuntu 24.04 or the Docker CE image.
- Add your SSH key.
- Configure firewall to allow:
  - 22 from your IP only if possible
  - 80 public
  - 443 public
- Create a non-root sudo user.
- Create folders:
	```bash
	sudo mkdir -p /opt/collaborator-accounting/{dev,tst,prd}
	sudo mkdir -p /opt/reverse-proxy
	sudo chown -R $USER:$USER /opt/collaborator-accounting /opt/reverse-proxy
	```
- Add each environment’s docker-compose.yml and .env.
- Start Caddy:
	```bash
	cd /opt/reverse-proxy
	docker compose up -d
	```
- Deploy once from GitHub Actions.

Hetzner’s community docs include common initial Ubuntu setup practices like creating a sudo user and setting up firewall basics.

# Final recommendation

Start with:

```bash
One Hetzner Cloud VPS
Ubuntu 24.04 or Docker CE image
Docker Compose
Global Caddy reverse proxy
Three environment folders
One all-in-one app image
SQLite in ./data/app.db
GitHub Actions branch-based deployment
Nightly SQLite backups
```

Then later upgrade to:
```bash
Separate PRD VPS
Attached Hetzner Volume
Off-server backups
PostgreSQL container or managed database
Monitoring
```

This gives you the simplicity you wanted while preserving a clean DEV/TST/PRD deployment model.

[hetzner](https://www.hetzner.com/cloud/cost-optimized)

# Creating and Adding an SSH Key for Hetzner
You can generate an SSH key locally and add it to your Hetzner Storage Box or VPS to enable secure, passwordless login.

## Generating the SSH Key
- Open a terminal on the device you will use to connect.
- Run ssh-keygen to create a new key pair.
- When prompted, choose a file path or press Enter for the default.
- Enter a passphrase or press Enter for none, then confirm it.
- Verify that the private key (id_rsa) and public key (id_rsa.pub) are saved in ~/.ssh/.

## Adding the SSH Key to Hetzner Storage Box (Option 1: via SSH)
- Ensure SSH support is enabled in your Storage Box settings.
- Run: cat ~/.ssh/id_rsa.pub | ssh -p23 uXXXXX@uXXXXX.your-storagebox.de install-ssh-key.
- Enter your Storage Box password when prompted.
- Confirm that the key was installed in both RFC4716 and OpenSSH formats.

## Adding the SSH Key to Hetzner VPS
- In the Hetzner Cloud Console, go to Security > SSH Keys.
- Open ~/.ssh/id_rsa.pub and copy its contents.
- Paste the public key into the Hetzner SSH Keys section and save.
- When creating or rebuilding a VPS, select your SSH key to attach it.

## Testing the SSH Key
- From your local machine, run: ssh -p <22 or 23> <username>@<username>.your-storagebox.de for Storage Box, or ssh root@<your-server-ip> for VPS.
- Verify that you can log in without entering a password.