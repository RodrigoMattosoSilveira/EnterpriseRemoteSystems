# syntax=docker/dockerfile:1

FROM golang:1.26-bookworm AS builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -o /out/enterprise-remote-systems-api ./cmd/api

FROM debian:bookworm-slim AS runtime
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates sqlite3 curl \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=builder /out/enterprise-remote-systems-api /app/enterprise-remote-systems-api
COPY migrations /app/migrations
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh \
    && mkdir -p /app/data
ENV PORT=8080
ENV DATABASE_PATH=/app/data/app.db
ENV LLM_COACHING_ENABLED=false
EXPOSE 8080
ENTRYPOINT ["/app/docker-entrypoint.sh"]