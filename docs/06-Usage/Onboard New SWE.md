# 1. Clone and choose the right branch

```bash
git clone git@github.com:<your-org-or-user>/EnterpriseRemoteSystems.git
cd EnterpriseRemoteSystems

# Set out working issue branc
$ git fetch origin
git checkout <<issue branch name>>
```

# 2. Install prerequisites

You should have:

```
Docker Desktop
Go version used by the repo/toolchain
Node/npm version compatible with the repo
Git
make
sqlite3, useful for debugging local DBs
```

## On macOS, this is usually enough:
```bash
brew install go node sqlite git make
```

For Windows, we will use `WSL2 + Ubuntu + Docker Desktop WSL integration`, not native Windows shell, because `Makefile`, `shell quoting`, `SQLite paths`, and `Docker` behavior will match `CI/Linux` more closely.

# 3. Install frontend dependencies

```bash
cd frontend
npm ci
cd ..
```

# 4. Create or verify local env files

The important Bite 18J-compatible local backend env must include the controlled authz bootstrap actor.

For local development, make sure the backend process receives these values:

```bash
AUTHZ_BOOTSTRAP_ENABLED=true
AUTHZ_BOOTSTRAP_ACTOR_KEY=bootstrap-admin
AUTHZ_BOOTSTRAP_DISPLAY_NAME="Bootstrap Admin"
AUTHZ_BOOTSTRAP_ROLE_CODE=APPLICATION_ADMIN
AUTHZ_BOOTSTRAP_TENANT_ID='*'
AUTHZ_BOOTSTRAP_REQUIRE_EMPTY_ACTOR_TABLE=false
```

The reason: after Bite 18J, protected routes like People, Collaborators, Planning, Earnings, Expenses, and Current Account routes require an actor with persisted permissions. bootstrap-admin is the local/admin bootstrap actor that can exercise the app before real login/session work exists.

# 5. Start backend locally with bootstrap enabled

Use your existing Make target if it already injects these env vars. If not, use this explicit command from repo root:

```bash
ERS_DATABASE_PATH=data/app-local.db \
AUTHZ_BOOTSTRAP_ENABLED=true \
AUTHZ_BOOTSTRAP_ACTOR_KEY=bootstrap-admin \
AUTHZ_BOOTSTRAP_DISPLAY_NAME="Bootstrap Admin" \
AUTHZ_BOOTSTRAP_ROLE_CODE=APPLICATION_ADMIN \
AUTHZ_BOOTSTRAP_TENANT_ID='*' \
AUTHZ_BOOTSTRAP_REQUIRE_EMPTY_ACTOR_TABLE=false \
make local-backend
```

In a second terminal, verify health:

```bash
curl -fsS http://localhost:8080/healthz
```

Then verify the backend health endpoint directly:

```bash
curl -fsS http://localhost:8080/api/v1/healthz
```

Protected business APIs require an authenticated session in normal deployed traffic. During local development before Bite 28D's login UX, use the Vite frontend proxy described below; it supplies only the configured persisted bootstrap actor while the backend is explicitly in `AUTHZ_ACTOR_HEADER_MODE=bootstrap`.

# 6. Start frontend locally

In another terminal:

```bash
cd frontend
npm run dev -- --host 0.0.0.0 --port 5173
```

Open:

```
http://localhost:5173
```

Before Bite 28D supplies the login UX, the local Vite proxy provides the explicit bootstrap compatibility path. The browser API client itself does not store or send actor identity. It stores only the selected tenant under `ers.auth.selectedTenantId`.

The default local tenant is `default`. To change it manually in browser developer tools:

```javascript
localStorage.setItem("ers.auth.selectedTenantId", "default");
location.reload();
```

Then navigate to:

```bash
/people
/collaborators
/expenses
/admin/authorization
```

# 7. Run local checks

From repo root:

```bash
cd backend
go test ./...
```

Then:

```bash
cd ../frontend
npm run check
npm run test:run
npm run test:e2e
```

For Bite 18J specifically, npm run test:e2e should use the local Playwright setup that bootstraps bootstrap-admin and injects authz headers. If he gets 401 missing_actor, the local backend was likely started without authz bootstrap, or the frontend/E2E proxy/request actor setup is missing.

The “fastest reliable” script for him

I would give him this as the canonical local verification script:

cd EnterpriseRemoteSystems

## Terminal 1

```bash
ERS_DATABASE_PATH=data/app-local.db \
AUTHZ_BOOTSTRAP_ENABLED=true \
AUTHZ_BOOTSTRAP_ACTOR_KEY=bootstrap-admin \
AUTHZ_BOOTSTRAP_DISPLAY_NAME="Bootstrap Admin" \
AUTHZ_BOOTSTRAP_ROLE_CODE=APPLICATION_ADMIN \
AUTHZ_BOOTSTRAP_TENANT_ID='*' \
AUTHZ_BOOTSTRAP_REQUIRE_EMPTY_ACTOR_TABLE=false \
make local-backend
```
# Terminal 2

```bash
cd frontend
npm ci
npm run dev -- --host 0.0.0.0 --port 5173
# Terminal 3
curl -fsS http://localhost:8080/healthz

curl -fsS http://localhost:8080/api/v1/healthz

cd frontend
npm run check
npm run test:e2e
```

# Common authorization onboarding mistakes

A normal protected request without a login session returns:

```json
{"error":{"code":"authentication_required","message":"An authenticated session is required"}}
```

Before Bite 28D's login UX, make sure local backend and frontend were started through the project-root `make local-backend` and `make local-frontend` targets. The backend should use `AUTHZ_ACTOR_HEADER_MODE=bootstrap`, and the Vite proxy supplies only the configured `bootstrap-admin` actor.

A `tenant_selection_required` response means the browser has no selected tenant. Store the tenant ID under `ers.auth.selectedTenantId` or select it in an administration page.

A `forbidden` response means the authenticated or explicit local-bootstrap actor exists but lacks the required persisted grant for the selected tenant.

# My recommendation

For the new engineer, I would avoid having him manually discover these details. Give him a small docs/local-development-18j.md or scripts/dev-bootstrap.sh that starts the backend with the exact bootstrap env vars. Bite 18J made authorization correctness much better, but it also made “casual local startup” less forgiving.
