# 1. SSH into the server

From your Mac:

```bash
ssh root@YOUR_SERVER_IP # 178.105.46.193
```

Update the server:

```bash
apt update
apt upgrade -y
```

# 2. Create a deploy user
```bash
adduser deploy
usermod -aG sudo deploy```
```


Copy your SSH access to the new user:

```bash
rsync --archive --chown=deploy:deploy ~/.ssh /home/deploy
```

Add deploy to the sudo group, before exiting

```bash
ssh root@YOUR_SERVER_IP # 178.105.46.193
usermod -aG sudo deploy
groups deploy
```

Now exit and reconnect, as deploy:

```bash
exit
ssh deploy@YOUR_SERVER_IP # 178.105.46.193
```

# 3. Install Docker and Compose

If your Hetzner image already has Docker, verify:

```bash
docker --version
docker compose version
```

If not installed:

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings

curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
```

Allow deploy user to run Docker:

```bash
sudo usermod -aG docker deploy
exit
ssh deploy@YOUR_SERVER_IP # 178.105.46.193
```

Verify:

```bash
docker ps
```

4. Create app folders
```bash
sudo mkdir -p /opt/enterpriseremotesystems/{dev,tst,prd}
sudo mkdir -p /opt/reverse-proxy
sudo chown -R deploy:deploy /opt/enterpriseremotesystems /opt/reverse-proxy
```

Create per-environment folders:

```bash
mkdir -p /opt/enterpriseremotesystems/dev/{data,backups}
mkdir -p /opt/enterpriseremotesystems/tst/{data,backups}
mkdir -p /opt/enterpriseremotesystems/prd/{data,backups}
```
# 5. Create reverse proxy with Caddy

Create:

```bash
nano /opt/reverse-proxy/docker-compose.yml
```

Paste:

```yaml
services:
  caddy:
    image: caddy:2
    container_name: enterpriseremotesystems-caddy
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - ./caddy_data:/data
      - ./caddy_config:/config
    restart: unless-stopped
```

Create:

```bash
nano /opt/reverse-proxy/Caddyfile
```

For now, use your actual domains:

```bash
dev.yourdomain.com { # enterpriseremotesystems.com
  reverse_proxy 127.0.0.1:18081
}

tst.yourdomain.com { # enterpriseremotesystems.com
  reverse_proxy 127.0.0.1:18082
}

app.yourdomain.com { # enterpriseremotesystems.com
  reverse_proxy 127.0.0.1:18083
}
```

Start Caddy:

```bash
cd /opt/reverse-proxy
docker compose up -d
```

# 6. Create environment compose files

Create:
```bash
$ nano /opt/enterpriseremotesystems/dev/docker-compose.yml
```

Paste:

```yaml
services:
  app:
    image: ghcr.io/YOUR_GITHUB_USER/YOUR_REPO:${APP_VERSION}
    container_name: enterpriseremotesystems-${APP_ENV}
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

Copy to TST/PRD:

```bash
cp /opt/enterpriseremotesystems/dev/docker-compose.yml /opt/enterpriseremotesystems/tst/docker-compose.yml
cp /opt/enterpriseremotesystems/dev/docker-compose.yml /opt/enterpriseremotesystems/prd/docker-compose.yml
```

Create .env files.

`/opt/enterpriseremotesystems/dev/.env`
```bash
APP_ENV=dev
APP_PORT=18081
APP_VERSION=development-latest
JWT_SECRET=replace-with-long-random-dev-secret
```

`/opt/enterpriseremotesystems/tst/.env`
```bash
APP_ENV=tst
APP_PORT=18082
APP_VERSION=test-latest
JWT_SECRET=replace-with-long-random-tst-secret
```

`/opt/enterpriseremotesystems/prd/.env`
```bash
APP_ENV=prd
APP_PORT=18083
APP_VERSION=production-latest
JWT_SECRET=replace-with-long-random-prd-secret
```

Generate secrets with:

`openssl rand -base64 48`

# 7. Point DNS to the server

In your DNS provider, add:

```bash
A dev.yourdomain.com  YOUR_SERVER_IP
A tst.yourdomain.com  YOUR_SERVER_IP
A app.yourdomain.com  YOUR_SERVER_IP
```

Once DNS resolves, Caddy will issue HTTPS certificates automatically.

# 8. Prepare your repo for production image

At repo root, create/update:

`Dockerfile`

This should build:

```bash
frontend → dist
backend → Go server
runtime → /app/server + /app/public
```

Then your backend must serve the frontend static files after API routes.

In Fiber setup:

```go
routes.Register(app, deps)

app.Static("/", "/app/public")

app.Get("/*", func(c fiber.Ctx) error {
	return c.SendFile("/app/public/index.html")
})
```

# 9. Add GitHub secrets

In GitHub repo settings:

Settings → Secrets and variables → Actions → New repository secret

Add:

```bash
HETZNER_HOST       = your server IP
HETZNER_USER       = deploy
HETZNER_SSH_KEY    = private key used for deploy access
```

# 10. Maintainance
Run these on the Hetzner server.

## Stop Caddy reverse proxy
```bash
cd /opt/reverse-proxy
docker compose down
```

## Confirm it stopped
```bash
docker ps
```
You should not see enterpriseremotesystems-caddy.

## Edit your Caddy domains
```bash
nano /opt/reverse-proxy/Caddyfile
```
Save the updated domains.

## Restart Caddy
```bash
cd /opt/reverse-proxy
docker compose up -d
```

## Check logs
```bash
docker compose logs -f caddy
```
Caddy should reload and request certificates for the updated domains if DNS is already pointing to your server.

## If you want to restart Docker itself
Usually not necessary, but you can do:
```bash
sudo systemctl restart docker
```

Then restart Caddy again:
```bash
cd /opt/reverse-proxy
docker compose up -d
```

## Verify
```bash
curl -I http://YOUR_DOMAIN
curl -I https://YOUR_DOMAIN
```
For example:
```bash
curl -I https://dev.yourdomain.com
```