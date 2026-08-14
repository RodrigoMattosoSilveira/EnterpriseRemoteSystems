# Use Docker-network tests before edge Caddy is up

**For the development stack:**
```bash
docker run --rm --network ers-dev_default curlimages/curl:latest \
  -i http://ers-dev-backend:8080/api/v1/healthz
```

**And through the environment Caddy:**
```bash
docker run --rm --network ers-dev_default curlimages/curl:latest \
  -i http://ers-dev-caddy/api/v1/healthz
```

**Frontend through environment Caddy:**
```bash
docker run --rm --network ers-dev_default curlimages/curl:latest \
  -i http://ers-dev-caddy/
```

# Use public domain tests after edge Caddy is up

**Once edge Caddy is running and DNS points to the server:**
```bash
curl -i https://dev.enterpriseremotesystems.com/api/v1/healthz
curl -i https://tst.enterpriseremotesystems.com/api/v1/healthz
curl -i https://app.enterpriseremotesystems.com/api/v1/healthz
```

B**efore DNS is fully ready, from the server you can test edge Caddy with:**
```bash
curl -i \
  -H "Host: dev.enterpriseremotesystems.com" \
  http://127.0.0.1/api/v1/healthz
```