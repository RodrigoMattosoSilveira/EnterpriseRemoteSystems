# Crete a Github Issue
- Header
- Body
- Assignee
- Labeld

# Crete a Github Issue Branch
- Click on create issue branch
- Select branch -- often the default branch
- Copy Github Generated commands to download issue branch

# Check out Issue Branch into your local development environment
NEVER WRITE SOFTWARE IN YOUR LOCAL DEVELOPMENT/TEST/PRODUCTION BRANCHES
```bash
# These are the commands you copied after clicking on the GitHub create branch link
# Simply paste and execute them them in your terminal prompt
git fetch origin
git checkout <<issue branch name>>
```

# Backend
Two options to launch the backend, and a few health checks.
## Option 1/2 - Terminal 1:
```bash
make local-backend
```

## Option 2/2 - Terminal 1:
```bash
cd backend
air
```

## Health Check - Terminal 2:
```bash
cd backend
go test ./...
curl http://localhost:8080/healthz
```

# Frontend
Two options to launch the backend, and a few health checks.
## Option 1/2 - Terminal 3:
```bash
make local-frontend
```

## Option 1/2 - Terminal 3:
npm run dev
```bash
```

## Health Check - Terminal 2:
```bash
cd frontend
npm run check
npm run build
npm run test:run
npm run test:e2e
```

# App health - Terminal 3
```bash
make local-smoke
make local-lan-smoke
```

# Launch Browser
Open:
```bash
http://localhost:5173
```