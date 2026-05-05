# Backend

Go/Fiber API for the Enterprise Remote Systems collaborator accounting system.

## Stack

- Go 1.25
- Fiber v3: `github.com/gofiber/fiber/v3`
- GORM: `gorm.io/gorm`
- SQLite 3 driver for GORM: `gorm.io/driver/sqlite`

This SQLite configuration uses the CGO-backed SQLite 3 driver transitively through `gorm.io/driver/sqlite` / `github.com/mattn/go-sqlite3`.

## Run

```bash
cd backend
air
```

Then run:

```bash
curl http://localhost:8080/healthz
```
