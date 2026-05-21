.PHONY: ddev bedev fedev dev backend frontend test build tidy migrate-up generate-backend-api openapi bundle generate-fe generate-be generate-api tidy test


getntw:
	./scripts/getntw.sh
dev:
	./scripts/dev.sh

bedev:
	./scripts/bedev.sh	

fedev:
	./scripts/fedev.sh	

ddev:
	./scripts/ddev.sh

backend:
	cd backend && go run ./cmd/server

frontend:
	cd frontend && npm install && npm run dev

tidy:
	cd backend && go mod tidy

test:
	cd backend && go test ./...
	cd frontend && npm test -- --run

build:
	cd backend && go build -o bin/enterpriseremotesystems ./cmd/server
	cd frontend && npm install && npm run build

migrate-up:
	cd backend && go run ./cmd/server --migrate-only

openapi: bundle generate-fe generate-be tidy

bundle:
	npx @redocly/cli bundle contracts/openapi.yaml -o contracts/openapi.bundle.yaml

generate-fe: bundle
	cd frontend && npx openapi-typescript ../contracts/openapi.bundle.yaml -o src/api/generated/schema.ts

generate-be: bundle
	cd backend && oapi-codegen -config ../contracts/oapi-codegen.yaml ../contracts/openapi.bundle.yaml

generate-api: openapi

generate-backend-api:
	cd backend && oapi-codegen -config ../contracts/oapi-codegen.yaml ../contracts/openapi.yaml
