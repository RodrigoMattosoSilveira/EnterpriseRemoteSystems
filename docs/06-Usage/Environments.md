# Recommended env file setup
## Backend

Use these files:
```bash
backend/
├── .env.example
├── .env.development
├── .env.test
├── .env.production.example
```

Commit:

```bash
.env.example
.env.production.example
```

Do not commit:
```bash
.env
.env.development
.env.test
.env.production
```

Add to .gitignore:
```bash
# Backend env files
backend/.env
backend/.env.*
!backend/.env.example
!backend/.env.production.example
```

Example backend/.env.example:
```env
APP_ENV=development
HTTP_PORT=8080

DB_DRIVER=sqlite
DB_DSN=./data/app.db

JWT_SECRET=change-me-in-local-env
JWT_ISSUER=minas-carara
JWT_ACCESS_TOKEN_TTL_MINUTES=60

CORS_ALLOWED_ORIGINS=http://localhost:5173
```

Example Go config names:
```env
APP_ENV
HTTP_PORT
DB_DRIVER
DB_DSN
JWT_SECRET
CORS_ALLOWED_ORIGINS
```

Avoid naming backend variables with VITE_; that prefix is only for Vite frontend variables.

##Frontend

Use these files:
```bash
frontend/
├── .env.example
├── .env.development
├── .env.production.example
```

Commit:
```bash
.env.example
.env.production.example
```

Do not commit:
```bash
.env
.env.development
.env.production
```

Add to .gitignore:

# Frontend env files
``````bash
frontend/.env
frontend/.env.*
!frontend/.env.example
!frontend/.env.production.example
```

Example frontend/.env.example:
```bash
VITE_API_BASE_URL=http://localhost:8080/api/v1
VITE_APP_NAME=Mina Carara
```

Example frontend/.env.development:
```bash
VITE_API_BASE_URL=http://localhost:8080/api/v1
VITE_APP_NAME=Mina Carara Dev
```

Important: any frontend variable exposed through Vite must start with:

VITE_

Never put secrets in frontend env files. Anything with VITE_ is visible in the browser bundle.

Best practice summary

Backend env files may contain secrets. Frontend env files must not.

Use:

backend/.env.development
frontend/.env.development

for your local two-terminal setup.

Use:

.env.example

as the committed template.

Use real production secrets through your deployment platform, Docker secrets, GitHub Actions secrets, or cloud secret manager — not committed files.