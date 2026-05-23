FROM node:22-alpine AS frontend
WORKDIR /src/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend ./
RUN npm run build

FROM golang:1.25-bookworm AS backend
WORKDIR /src/backend
RUN apt-get update && apt-get install -y --no-install-recommends gcc libc6-dev sqlite3 libsqlite3-dev && rm -rf /var/lib/apt/lists/*
COPY backend/go.mod backend/go.sum* ./
RUN go mod download
COPY backend ./
COPY --from=frontend /src/frontend/dist ./public
RUN CGO_ENABLED=0 go build -o /out/enterpriseremotesystems ./cmd/server

FROM debian:bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libc6-dev sqlite3 libsqlite3-dev ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY --from=backend /out/enterpriseremotesystems /app/enterpriseremotesystems
COPY backend/migrations /app/migrations
COPY --from=frontend /src/frontend/dist /app/public
ENV HTTP_ADDR=:8080
ENV DB_PATH=/data/app.db
EXPOSE 8080
CMD ["/app/enterpriseremotesystems"]
