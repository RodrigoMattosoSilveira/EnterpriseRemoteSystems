SHELL := /usr/bin/env bash
.DEFAULT_GOAL := help

# ==============================================================================
# Call It Cure It - Root Makefile
# ==============================================================================

SERVER_ROOT ?= /opt/CallItCureIt
REPO_URL ?= git@github.com:RodrigoMattosoSilveira/CallItCureIt.git
LAN_HOST ?= 5.78.208.230

ENV ?= development

ifeq ($(ENV),development)
  ENV_DIR := $(SERVER_ROOT)/development
  ENV_FILE := .env.development
  COMPOSE_PROJECT := callitcureit-dev
  BRANCH := development
  DOMAIN := dev.callitcureit.com
  CONTAINER_PREFIX := callitcureit-dev
endif

ifeq ($(ENV),test)
  ENV_DIR := $(SERVER_ROOT)/test
  ENV_FILE := .env.test
  COMPOSE_PROJECT := callitcureit-tst
  BRANCH := test
  DOMAIN := tst.callitcureit.com
  CONTAINER_PREFIX := callitcureit-tst
endif

ifeq ($(ENV),production)
  ENV_DIR := $(SERVER_ROOT)/production
  ENV_FILE := .env.production
  COMPOSE_PROJECT := callitcureit-prd
  BRANCH := production
  DOMAIN := app.callitcureit.com
  CONTAINER_PREFIX := callitcureit-prd
endif

EDGE_DIR := $(SERVER_ROOT)/edge

# ==============================================================================
# Help
# ==============================================================================

.PHONY: help
help:
	@echo "Call It Cure It Makefile"
	@echo
	@echo "Local development:"
	@echo "  make doctor"
	@echo "  make check-repo"
	@echo "  make local-init-env"
	@echo "  make local-db-init"
	@echo "  make local-db-reset"
	@echo "  make local-admin-reset"
	@echo "  make backend-check"
	@echo "  make frontend-check"
	@echo "  make local-check"
	@echo "  make local-backend"
	@echo "  make local-frontend"
	@echo "  make local-smoke"
	@echo "  make local-lan-smoke LAN_HOST=LAN_HOST"
	@echo "  make local-login-test"
	@echo "  make local-admin-test"
	@echo
	@echo "Generic server targets:"
	@echo "  make server-init-env ENV=development|test|production"
	@echo "  make server-pull ENV=development|test|production"
	@echo "  make server-build ENV=development|test|production"
	@echo "  make server-up ENV=development|test|production"
	@echo "  make server-down ENV=development|test|production"
	@echo "  make server-ps ENV=development|test|production"
	@echo "  make server-logs ENV=development|test|production"
	@echo "  make server-backend-logs ENV=development|test|production"
	@echo "  make server-frontend-logs ENV=development|test|production"
	@echo "  make server-caddy-logs ENV=development|test|production"
	@echo "  make server-backend-health ENV=development|test|production"
	@echo "  make server-smoke ENV=development|test|production"
	@echo "  make server-admin-test ENV=development|test|production"
	@echo "  make server-dns-check ENV=development|test|production"
	@echo "  make server-cert-check ENV=development|test|production"
	@echo "  make server-backup ENV=development|test|production"
	@echo
	@echo "Development aliases:"
	@echo "  make server-dev-pull"
	@echo "  make server-dev-build"
	@echo "  make server-dev-up"
	@echo "  make server-dev-smoke"
	@echo "  make server-dev-admin-test"
	@echo
	@echo "Test aliases:"
	@echo "  make server-test-pull"
	@echo "  make server-test-build"
	@echo "  make server-test-up"
	@echo "  make server-test-smoke"
	@echo "  make server-test-admin-test"
	@echo
	@echo "Production aliases:"
	@echo "  make server-prod-pull"
	@echo "  make server-prod-build"
	@echo "  make server-prod-up"
	@echo "  make server-prod-smoke"
	@echo "  make server-prod-admin-test"
	@echo
	@echo "Edge proxy:"
	@echo "  make edge-init"
	@echo "  make edge-sync"
	@echo "  make edge-diff"
	@echo "  make edge-up"
	@echo "  make edge-down"
	@echo "  make edge-reload"
	@echo "  make edge-restart"
	@echo "  make edge-logs"
	@echo "  make edge-deploy"
	@echo
	@echo "Docker maintenance:"
	@echo "  make docker-ps"
	@echo "  make docker-df"
	@echo "  make docker-prune-build-cache"

# ==============================================================================
# Local validation
# ==============================================================================

.PHONY: doctor
doctor:
	@command -v go >/dev/null || (echo "go not found" && exit 1)
	@command -v node >/dev/null || (echo "node not found" && exit 1)
	@command -v npm >/dev/null || (echo "npm not found" && exit 1)
	@command -v sqlite3 >/dev/null || (echo "sqlite3 not found" && exit 1)
	@command -v docker >/dev/null || (echo "docker not found" && exit 1)
	@docker compose version >/dev/null || (echo "docker compose not found" && exit 1)
	@command -v jq >/dev/null || (echo "jq not found" && exit 1)
	@command -v git >/dev/null || (echo "git not found" && exit 1)
	@command -v curl >/dev/null || (echo "curl not found" && exit 1)
	@command -v openssl >/dev/null || (echo "openssl not found" && exit 1)
	@echo "All required tools are available."

.PHONY: check-repo
check-repo:
	@test -f backend/Dockerfile || (echo "Missing backend/Dockerfile" && exit 1)
	@test -f backend/docker-entrypoint.sh || (echo "Missing backend/docker-entrypoint.sh" && exit 1)
	@test -d backend/migrations || (echo "Missing backend/migrations" && exit 1)
	@test -f frontend/Dockerfile || (echo "Missing frontend/Dockerfile" && exit 1)
	@test -f frontend/nginx.conf || (echo "Missing frontend/nginx.conf" && exit 1)
	@test -f docker-compose.server.yml || (echo "Missing docker-compose.server.yml" && exit 1)
	@test -f deploy/Caddyfile || (echo "Missing deploy/Caddyfile" && exit 1)
	@test -f edge/Caddyfile || (echo "Missing edge/Caddyfile" && exit 1)
	@test -f edge/docker-compose.edge.yml || (echo "Missing edge/docker-compose.edge.yml" && exit 1)
	@test -f scripts/init-dev-env.sh || (echo "Missing scripts/init-dev-env.sh" && exit 1)
	@test -f scripts/init-server-env.sh || (echo "Missing scripts/init-server-env.sh" && exit 1)
	@test -f scripts/dev-backend.sh || (echo "Missing scripts/dev-backend.sh" && exit 1)
	@test -f scripts/dev-frontend.sh || (echo "Missing scripts/dev-frontend.sh" && exit 1)
	@if [ -d backend/cmd/create-admin ] || [ -d backend/cmd/create-admin.disabled ]; then \
		echo "Obsolete create-admin command found under backend/cmd. Remove it."; \
		exit 1; \
	fi
	@echo "Repository structure looks good."

# ==============================================================================
# Local environment
# ==============================================================================

.PHONY: local-init-env
local-init-env:
	chmod +x scripts/init-dev-env.sh
	./scripts/init-dev-env.sh

.PHONY: local-db-init
local-db-init:
	mkdir -p backend/data
	@for migration in backend/migrations/*.up.sql; do \
		echo "Applying $$migration"; \
		sqlite3 backend/data/app.db < "$$migration"; \
	done
	sqlite3 backend/data/app.db ".tables"

.PHONY: local-db-reset
local-db-reset:
	sqlite3 backend/data/app.db "DELETE FROM session_scores; DELETE FROM action_evaluations; DELETE FROM trainee_actions; DELETE FROM session_events; DELETE FROM sessions;"
	@echo "Local session data reset."

.PHONY: local-admin-reset
local-admin-reset:
	sqlite3 backend/data/app.db "DELETE FROM users WHERE email = 'admin@example.com';"
	@echo "Local admin deleted. Restart backend to reseed."

.PHONY: backend-check
backend-check:
	cd backend && go mod tidy && go test ./...

.PHONY: frontend-check
frontend-check:
	cd frontend && npm install && npm run check

.PHONY: local-check
local-check: check-repo backend-check frontend-check
	@echo "Local checks passed."

.PHONY: local-backend
local-backend:
	chmod +x scripts/dev-backend.sh
	./scripts/dev-backend.sh

.PHONY: local-frontend
local-frontend:
	chmod +x scripts/dev-frontend.sh
	./scripts/dev-frontend.sh

.PHONY: local-smoke
local-smoke:
	curl -fsS http://localhost:8080/api/v1/healthz >/dev/null
	curl -fsS http://localhost:5173/api/v1/healthz >/dev/null
	curl -fsS http://localhost:5173/api/v1/scenarios >/dev/null
	@echo "Local smoke tests passed."

.PHONY: local-lan-smoke
local-lan-smoke:
	curl -fsS http://$(LAN_HOST):5173/api/v1/healthz >/dev/null
	curl -fsS http://$(LAN_HOST):5173/api/v1/scenarios >/dev/null
	@echo "LAN smoke test passed for $(LAN_HOST)."

.PHONY: local-login-test
local-login-test:
	curl -fsS -X POST http://localhost:5173/api/v1/auth/login \
		-H "Content-Type: application/json" \
		-d '{"email":"admin@example.com","password":"admin123"}' | jq .

.PHONY: local-admin-test
local-admin-test:
	TOKEN=$$(curl -fsS -X POST http://localhost:5173/api/v1/auth/login \
		-H "Content-Type: application/json" \
		-d '{"email":"admin@example.com","password":"admin123"}' | jq -r '.data.token'); \
	curl -fsS http://localhost:5173/api/v1/admin/scenarios \
		-H "Authorization: Bearer $$TOKEN" | jq .

# ==============================================================================
# Generic server environment targets
# ==============================================================================

.PHONY: server-init-env
server-init-env:
	chmod +x scripts/init-server-env.sh
	./scripts/init-server-env.sh $(ENV)

.PHONY: server-pull
server-pull:
	cd $(ENV_DIR) && git checkout $(BRANCH) && git pull

.PHONY: server-build
server-build:
	cd $(ENV_DIR) && BUILDX_NO_DEFAULT_ATTESTATIONS=1 docker compose \
		--progress plain \
		-p $(COMPOSE_PROJECT) \
		--env-file $(ENV_FILE) \
		-f docker-compose.server.yml \
		build

.PHONY: server-up
server-up:
	cd $(ENV_DIR) && docker compose \
		-p $(COMPOSE_PROJECT) \
		--env-file $(ENV_FILE) \
		-f docker-compose.server.yml \
		up -d

.PHONY: server-down
server-down:
	cd $(ENV_DIR) && docker compose \
		-p $(COMPOSE_PROJECT) \
		--env-file $(ENV_FILE) \
		-f docker-compose.server.yml \
		down

.PHONY: server-down-volumes
server-down-volumes:
	@echo "WARNING: this deletes the $(ENV) SQLite Docker volume."
	@echo "Use only for development/test resets or after a backup."
	cd $(ENV_DIR) && docker compose \
		-p $(COMPOSE_PROJECT) \
		--env-file $(ENV_FILE) \
		-f docker-compose.server.yml \
		down -v

.PHONY: server-ps
server-ps:
	cd $(ENV_DIR) && docker compose \
		-p $(COMPOSE_PROJECT) \
		--env-file $(ENV_FILE) \
		-f docker-compose.server.yml \
		ps -a

.PHONY: server-logs
server-logs:
	cd $(ENV_DIR) && docker compose \
		-p $(COMPOSE_PROJECT) \
		--env-file $(ENV_FILE) \
		-f docker-compose.server.yml \
		logs -f --tail=200

.PHONY: server-backend-logs
server-backend-logs:
	docker logs -f --tail=200 $(CONTAINER_PREFIX)-backend

.PHONY: server-frontend-logs
server-frontend-logs:
	docker logs -f --tail=200 $(CONTAINER_PREFIX)-frontend

.PHONY: server-caddy-logs
server-caddy-logs:
	docker logs -f --tail=200 $(CONTAINER_PREFIX)-caddy

.PHONY: server-backend-health
server-backend-health:
	docker exec $(CONTAINER_PREFIX)-backend curl -fsS http://localhost:8080/api/v1/healthz
	@echo "$(CONTAINER_PREFIX)-backend health check passed."

.PHONY: server-env-caddy-health
server-env-caddy-health:
	docker exec $(CONTAINER_PREFIX)-caddy wget -q -O- http://localhost:80/api/v1/healthz >/dev/null
	@echo "$(CONTAINER_PREFIX)-caddy internal health check passed."

.PHONY: server-smoke
server-smoke:
	curl -fsS https://$(DOMAIN)/api/v1/healthz >/dev/null
	curl -fsS https://$(DOMAIN)/api/v1/scenarios >/dev/null
	@echo "$(DOMAIN) smoke tests passed."

.PHONY: server-admin-test
server-admin-test:
	cd $(ENV_DIR) && \
	ADMIN_EMAIL=$$(grep '^DEV_ADMIN_EMAIL=' $(ENV_FILE) | cut -d '=' -f2-); \
	ADMIN_PASSWORD=$$(grep '^DEV_ADMIN_PASSWORD=' $(ENV_FILE) | cut -d '=' -f2-); \
	TOKEN=$$(curl -fsS -X POST https://$(DOMAIN)/api/v1/auth/login \
		-H "Content-Type: application/json" \
		-d "$$(printf '{"email":"%s","password":"%s"}' "$$ADMIN_EMAIL" "$$ADMIN_PASSWORD")" | jq -r '.data.token'); \
	curl -fsS https://$(DOMAIN)/api/v1/admin/scenarios \
		-H "Authorization: Bearer $$TOKEN" | jq .

.PHONY: server-dns-check
server-dns-check:
	dig $(DOMAIN)
	dig AAAA $(DOMAIN)

.PHONY: server-cert-check
server-cert-check:
	echo | openssl s_client -connect $(DOMAIN):443 -servername $(DOMAIN) -showcerts 2>/dev/null \
		| openssl x509 -noout -subject -issuer -dates -ext subjectAltName

.PHONY: server-backup
server-backup:
	mkdir -p $(ENV_DIR)/backups
	TIMESTAMP=$$(date +%Y%m%d-%H%M%S); \
	CONTAINER="$(CONTAINER_PREFIX)-backend"; \
	docker exec $$CONTAINER sqlite3 /app/data/app.db ".backup '/tmp/app-backup.db'"; \
	docker cp $$CONTAINER:/tmp/app-backup.db $(ENV_DIR)/backups/app-$$TIMESTAMP.db; \
	docker exec $$CONTAINER rm -f /tmp/app-backup.db; \
	echo "Backup written to $(ENV_DIR)/backups/app-$$TIMESTAMP.db"

.PHONY: server-reset-admin
server-reset-admin:
	cd $(ENV_DIR) && \
	ADMIN_EMAIL=$$(grep '^DEV_ADMIN_EMAIL=' $(ENV_FILE) | cut -d '=' -f2-); \
	docker exec $(CONTAINER_PREFIX)-backend sqlite3 /app/data/app.db \
		"DELETE FROM users WHERE email = '$$ADMIN_EMAIL';"; \
	docker restart $(CONTAINER_PREFIX)-backend; \
	echo "Deleted and reseeded admin for $(ENV): $$ADMIN_EMAIL"

# ==============================================================================
# Development aliases
# ==============================================================================

.PHONY: server-dev-init-env
server-dev-init-env:
	$(MAKE) server-init-env ENV=development

.PHONY: server-dev-pull
server-dev-pull:
	$(MAKE) server-pull ENV=development

.PHONY: server-dev-build
server-dev-build:
	$(MAKE) server-build ENV=development

.PHONY: server-dev-up
server-dev-up:
	$(MAKE) server-up ENV=development

.PHONY: server-dev-down
server-dev-down:
	$(MAKE) server-down ENV=development

.PHONY: server-dev-down-volumes
server-dev-down-volumes:
	$(MAKE) server-down-volumes ENV=development

.PHONY: server-dev-ps
server-dev-ps:
	$(MAKE) server-ps ENV=development

.PHONY: server-dev-logs
server-dev-logs:
	$(MAKE) server-logs ENV=development

.PHONY: server-dev-backend-logs
server-dev-backend-logs:
	$(MAKE) server-backend-logs ENV=development

.PHONY: server-dev-frontend-logs
server-dev-frontend-logs:
	$(MAKE) server-frontend-logs ENV=development

.PHONY: server-dev-caddy-logs
server-dev-caddy-logs:
	$(MAKE) server-caddy-logs ENV=development

.PHONY: server-dev-backend-health
server-dev-backend-health:
	$(MAKE) server-backend-health ENV=development

.PHONY: server-dev-env-caddy-health
server-dev-env-caddy-health:
	$(MAKE) server-env-caddy-health ENV=development

.PHONY: server-dev-smoke
server-dev-smoke:
	$(MAKE) server-smoke ENV=development

.PHONY: server-dev-admin-test
server-dev-admin-test:
	$(MAKE) server-admin-test ENV=development

.PHONY: server-dev-dns-check
server-dev-dns-check:
	$(MAKE) server-dns-check ENV=development

.PHONY: server-dev-cert-check
server-dev-cert-check:
	$(MAKE) server-cert-check ENV=development

.PHONY: server-dev-backup
server-dev-backup:
	$(MAKE) server-backup ENV=development

.PHONY: server-dev-reset-admin
server-dev-reset-admin:
	$(MAKE) server-reset-admin ENV=development

# ==============================================================================
# Test aliases
# ==============================================================================

.PHONY: server-test-init-env
server-test-init-env:
	$(MAKE) server-init-env ENV=test

.PHONY: server-test-pull
server-test-pull:
	$(MAKE) server-pull ENV=test

.PHONY: server-test-build
server-test-build:
	$(MAKE) server-build ENV=test

.PHONY: server-test-up
server-test-up:
	$(MAKE) server-up ENV=test

.PHONY: server-test-down
server-test-down:
	$(MAKE) server-down ENV=test

.PHONY: server-test-down-volumes
server-test-down-volumes:
	$(MAKE) server-down-volumes ENV=test

.PHONY: server-test-ps
server-test-ps:
	$(MAKE) server-ps ENV=test

.PHONY: server-test-logs
server-test-logs:
	$(MAKE) server-logs ENV=test

.PHONY: server-test-backend-logs
server-test-backend-logs:
	$(MAKE) server-backend-logs ENV=test

.PHONY: server-test-frontend-logs
server-test-frontend-logs:
	$(MAKE) server-frontend-logs ENV=test

.PHONY: server-test-caddy-logs
server-test-caddy-logs:
	$(MAKE) server-caddy-logs ENV=test

.PHONY: server-test-backend-health
server-test-backend-health:
	$(MAKE) server-backend-health ENV=test

.PHONY: server-test-env-caddy-health
server-test-env-caddy-health:
	$(MAKE) server-env-caddy-health ENV=test

.PHONY: server-test-smoke
server-test-smoke:
	$(MAKE) server-smoke ENV=test

.PHONY: server-test-admin-test
server-test-admin-test:
	$(MAKE) server-admin-test ENV=test

.PHONY: server-test-dns-check
server-test-dns-check:
	$(MAKE) server-dns-check ENV=test

.PHONY: server-test-cert-check
server-test-cert-check:
	$(MAKE) server-cert-check ENV=test

.PHONY: server-test-backup
server-test-backup:
	$(MAKE) server-backup ENV=test

.PHONY: server-test-reset-admin
server-test-reset-admin:
	$(MAKE) server-reset-admin ENV=test

# ==============================================================================
# Production aliases
# ==============================================================================

.PHONY: server-prod-init-env
server-prod-init-env:
	$(MAKE) server-init-env ENV=production

.PHONY: server-prod-pull
server-prod-pull:
	$(MAKE) server-pull ENV=production

.PHONY: server-prod-build
server-prod-build:
	$(MAKE) server-build ENV=production

.PHONY: server-prod-up
server-prod-up:
	$(MAKE) server-up ENV=production

.PHONY: server-prod-down
server-prod-down:
	$(MAKE) server-down ENV=production

.PHONY: server-prod-ps
server-prod-ps:
	$(MAKE) server-ps ENV=production

.PHONY: server-prod-logs
server-prod-logs:
	$(MAKE) server-logs ENV=production

.PHONY: server-prod-backend-logs
server-prod-backend-logs:
	$(MAKE) server-backend-logs ENV=production

.PHONY: server-prod-frontend-logs
server-prod-frontend-logs:
	$(MAKE) server-frontend-logs ENV=production

.PHONY: server-prod-caddy-logs
server-prod-caddy-logs:
	$(MAKE) server-caddy-logs ENV=production

.PHONY: server-prod-backend-health
server-prod-backend-health:
	$(MAKE) server-backend-health ENV=production

.PHONY: server-prod-env-caddy-health
server-prod-env-caddy-health:
	$(MAKE) server-env-caddy-health ENV=production

.PHONY: server-prod-smoke
server-prod-smoke:
	$(MAKE) server-smoke ENV=production

.PHONY: server-prod-admin-test
server-prod-admin-test:
	$(MAKE) server-admin-test ENV=production

.PHONY: server-prod-dns-check
server-prod-dns-check:
	$(MAKE) server-dns-check ENV=production

.PHONY: server-prod-cert-check
server-prod-cert-check:
	$(MAKE) server-cert-check ENV=production

.PHONY: server-prod-backup
server-prod-backup:
	$(MAKE) server-backup ENV=production

.PHONY: server-prod-reset-admin
server-prod-reset-admin:
	$(MAKE) server-reset-admin ENV=production

# ==============================================================================
# Edge proxy targets
# ==============================================================================

.PHONY: edge-init
edge-init:
	mkdir -p $(EDGE_DIR)
	cp -R edge/* $(EDGE_DIR)/
	@echo "Initialized edge proxy folder at $(EDGE_DIR)"

.PHONY: edge-sync
edge-sync:
	mkdir -p $(EDGE_DIR)
	rsync -av --delete edge/ $(EDGE_DIR)/
	@echo "Synced edge/ to $(EDGE_DIR)"

.PHONY: edge-diff
edge-diff:
	@echo "Comparing repo edge/ with live $(EDGE_DIR)"
	diff -ru edge $(EDGE_DIR) || true

.PHONY: edge-up
edge-up:
	cd $(EDGE_DIR) && docker compose -f docker-compose.edge.yml up -d

.PHONY: edge-down
edge-down:
	cd $(EDGE_DIR) && docker compose -f docker-compose.edge.yml down

.PHONY: edge-reload
edge-reload:
	docker exec callitcureit-edge-caddy caddy reload --config /etc/caddy/Caddyfile

.PHONY: edge-restart
edge-restart:
	cd $(EDGE_DIR) && docker compose -f docker-compose.edge.yml up -d --force-recreate

.PHONY: edge-logs
edge-logs:
	docker logs -f --tail=200 callitcureit-edge-caddy

.PHONY: edge-deploy
edge-deploy: edge-sync edge-up edge-reload
	@echo "Edge proxy deployed."

.PHONY: edge-cert-check-dev
edge-cert-check-dev:
	echo | openssl s_client -connect dev.callitcureit.com:443 -servername dev.callitcureit.com -showcerts 2>/dev/null \
		| openssl x509 -noout -subject -issuer -dates -ext subjectAltName

.PHONY: edge-cert-check-test
edge-cert-check-test:
	echo | openssl s_client -connect tst.callitcureit.com:443 -servername tst.callitcureit.com -showcerts 2>/dev/null \
		| openssl x509 -noout -subject -issuer -dates -ext subjectAltName

.PHONY: edge-cert-check-prod
edge-cert-check-prod:
	echo | openssl s_client -connect app.callitcureit.com:443 -servername app.callitcureit.com -showcerts 2>/dev/null \
		| openssl x509 -noout -subject -issuer -dates -ext subjectAltName

# ==============================================================================
# Docker maintenance
# ==============================================================================

.PHONY: docker-ps
docker-ps:
	docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

.PHONY: docker-ps-all
docker-ps-all:
	docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

.PHONY: docker-df
docker-df:
	docker system df

.PHONY: docker-networks
docker-networks:
	docker network ls | grep callitcureit || true

.PHONY: docker-prune-build-cache
docker-prune-build-cache:
	docker builder prune -f
	docker image prune -f
	docker container prune -f