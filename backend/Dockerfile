# syntax=docker/dockerfile:1

FROM golang:1.26.2-bookworm AS builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux \
    go build -o /out/enterprise-remote-systems-api ./cmd/api && \
    go build -o /out/import-people ./cmd/import-people && \
    go build -o /out/provision-e2e-admin ./cmd/provision-e2e-admin

FROM debian:bookworm-slim AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates sqlite3 curl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /out/enterprise-remote-systems-api /app/enterprise-remote-systems-api
COPY --from=builder /out/import-people /app/import-people
COPY --from=builder /out/provision-e2e-admin /app/provision-e2e-admin
COPY migrations /app/migrations
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
COPY build-development-db.sh /app/build-development-db.sh
COPY restore-test-rehearsal-db.sh /app/restore-test-rehearsal-db.sh
RUN chmod +x /app/docker-entrypoint.sh /app/build-development-db.sh /app/restore-test-rehearsal-db.sh \
    && mkdir -p /app/data
RUN APP_ENV=development DATABASE_PATH=/tmp/development-db-build-check.db /app/build-development-db.sh \
    && rm -f /tmp/development-db-build-check.db /tmp/development-db-build-check.db-wal /tmp/development-db-build-check.db-shm
ENV PORT=8080
ENV DATABASE_PATH=/app/data/app.db
ENV LLM_COACHING_ENABLED=false
EXPOSE 8080
ENTRYPOINT ["/app/docker-entrypoint.sh"]