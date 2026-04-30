# Introduction
OpenAPI YAML and what it enables
- Single source of truth (contract)
  - The YAML defines the canonical API contract (paths, request/response shapes, enums, examples). All teams (frontend, backend, QA, infra) rely on it to avoid mismatches.
- Generate code and clients\
  - Use openapi-generator (or similar) to produce:
    - Go server stubs (models, request binding) to speed backend implementation.
    - TypeScript/React client (strongly typed API calls) so frontend calls match API exactly.
  - Ensure generation settings preserve decimal-as-string types.
- API docs & exploration
  - Serve interactive docs with Swagger UI or Redoc for developers and product reviewers.
  - Use examples in the YAML to clarify payload expectations (dates, decimal strings, enums).
- Runtime validation & safety
  - Use generated request/response schemas (or middleware) to validate incoming requests in the Go API and outgoing responses in tests — reduces runtime bugs and security issues.
  - Validate decimal strings server-side to match NUMERIC constraints.
- Mock servers for parallel development
  - Spin up a mock server from the YAML (e.g., prism, mockoon, or openapi-generator mock) so frontend can develop and QA can test before backend is implemented.
- Contract tests & CI gating
  - Add contract tests: CI job that validates server responses against the OpenAPI spec (and client codegen).
  - Use YAML changes as a PR gate: require API reviewers and bump of spec version for breaking changes.
- Client-side typing & UX correctness
  - Generate TypeScript types to:
    - Enforce decimal-as-string usage in UI models.
    - Provide auto-complete and prevent field-name/enum mismatches.
  - Use the generated client in React to reduce hand-written HTTP glue.
- Idempotency, errors & auditability
  - Document idempotencyKey usage and error response shapes in the spec so clients can safely retry create endpoints (transactions, production posts).
- Security & multi-tenancy mapping
  - The spec documents bearer auth and required roles; backend uses it to enforce auth.
  - Do NOT accept tenant_id from clients in tenant-scoped endpoints — document that tenant is derived from token (add note in operation descriptions).
  - Document that server must set SET LOCAL app.current_tenant before DB ops (implementation note, not part of YAML but add as x- or description).

# Tooling & automation flow (recommended)
- Step A: Commit YAML to repo (infra/api/spec).
- Step B: CI job generates server stubs and client SDKs; failures if generation breaks.
- Step C: Publish generated TypeScript client package to monorepo frontend/ libs; backend imports generated models where useful.
- Step D: Use mock server for frontend until backend endpoints implemented.
- Step E: Add contract tests: run mock + backend; verify conformance.
- Step F: Update YAML for changes; require compatibility review for breaking edits.

# Mapping YAML → DB & implementation
- Use schema definitions to map types to DB:
  - DecimalString → NUMERIC columns
  - UUID → UUID PKs/FKs
  - Enums → DB check constraints or reference tables
- Use the YAML examples to write integration tests that seed DB and assert responses.
