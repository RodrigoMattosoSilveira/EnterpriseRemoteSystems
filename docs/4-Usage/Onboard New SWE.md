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

Then verify a protected endpoint using the actor headers:

```bash
curl -i \
  -H "X-Actor-ID: bootstrap-admin" \
  -H "X-Tenant-ID: default" \
  http://localhost:8080/api/v1/people/
```

Expected result: not 401 missing_actor. A 200 is ideal. If there is a different validation or data response, that is fine; the key is that authorization is wired.

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

Because the temporary auth mechanism is header/localStorage-based until real login exists, the easiest developer workflow is to use the Authorization Admin UI or seed localStorage manually.

In browser devtools console, seed:

```bash
localStorage.setItem(
  "ers.authzAdmin.requestActor",
  JSON.stringify({ actorId: "bootstrap-admin", tenantId: "default" })
);
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

curl -i \
  -H "X-Actor-ID: bootstrap-admin" \
  -H "X-Tenant-ID: default" \
  http://localhost:8080/api/v1/people/

cd frontend
npm run check
npm run test:e2e
```

# Common Bite 18J onboarding mistakes

The most common failure will be:

```json
{"error":{"code":"missing_actor","message":"Authorization actor is required"}}
```

That means the request reached the backend but did not include an actor. Fix by ensuring one of these is true:

```
API/curl request includes:
X-Actor-ID: bootstrap-admin
X-Tenant-ID: default

Browser localStorage includes:
ers.authzAdmin.requestActor = {"actorId":"bootstrap-admin","tenantId":"default"}

E2E setup has authz helper/proxy enabled.
Backend was started with AUTHZ_BOOTSTRAP_ENABLED=true.
```

The second common failure is:

```
actor exists but forbidden
```

That usually means the actor exists but lacks the needed role/grant. For initial local setup, use bootstrap-admin with APPLICATION_ADMIN.

# My recommendation

For the new engineer, I would avoid having him manually discover these details. Give him a small docs/local-development-18j.md or scripts/dev-bootstrap.sh that starts the backend with the exact bootstrap env vars. Bite 18J made authorization correctness much better, but it also made “casual local startup” less forgiving.
