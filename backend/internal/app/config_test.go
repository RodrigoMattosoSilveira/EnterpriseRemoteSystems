package app

import "testing"

func TestLoadConfigReadsAuthzBootstrapSettings(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-secret")
	t.Setenv("AUTHZ_BOOTSTRAP_ENABLED", "true")
	t.Setenv("AUTHZ_BOOTSTRAP_ACTOR_KEY", "bootstrap-admin")
	t.Setenv("AUTHZ_BOOTSTRAP_DISPLAY_NAME", "Bootstrap Admin")
	t.Setenv("AUTHZ_BOOTSTRAP_ROLE_CODE", "TENANT_ADMIN")
	t.Setenv("AUTHZ_BOOTSTRAP_TENANT_ID", "tenant-a")
	t.Setenv("AUTHZ_BOOTSTRAP_REQUIRE_EMPTY_ACTOR_TABLE", "true")

	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("load config: %v", err)
	}
	if !cfg.AuthzBootstrapEnabled {
		t.Fatalf("expected authz bootstrap enabled")
	}
	if cfg.AuthzBootstrapActorKey != "bootstrap-admin" || cfg.AuthzBootstrapDisplayName != "Bootstrap Admin" {
		t.Fatalf("unexpected bootstrap actor config: %#v", cfg)
	}
	if cfg.AuthzBootstrapRoleCode != "TENANT_ADMIN" || cfg.AuthzBootstrapTenantID != "tenant-a" {
		t.Fatalf("unexpected bootstrap role config: %#v", cfg)
	}
	if !cfg.AuthzBootstrapRequireEmptyActors {
		t.Fatalf("expected require-empty-actor-table flag")
	}
}

func TestLoadConfigDefaultsAuthzBootstrapEnabledForLocalDevelopment(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-secret")
	t.Setenv("APP_ENV", "local")

	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("load config: %v", err)
	}
	if !cfg.AuthzBootstrapEnabled {
		t.Fatalf("expected authz bootstrap enabled for local development")
	}
	if cfg.AuthzBootstrapActorKey != "bootstrap-admin" || cfg.AuthzBootstrapDisplayName != "Bootstrap Admin" {
		t.Fatalf("unexpected local bootstrap defaults: %#v", cfg)
	}
	if cfg.AuthzBootstrapRoleCode != "APPLICATION_ADMIN" || cfg.AuthzBootstrapTenantID != "*" {
		t.Fatalf("unexpected bootstrap role defaults: %#v", cfg)
	}
}

func TestLoadConfigDefaultsAuthzBootstrapDisabledOutsideLocalDevelopment(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-secret")
	t.Setenv("APP_ENV", "production")

	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("load config: %v", err)
	}
	if cfg.AuthzBootstrapEnabled {
		t.Fatalf("expected authz bootstrap disabled outside local development by default")
	}
	if cfg.AuthzBootstrapRoleCode != "APPLICATION_ADMIN" || cfg.AuthzBootstrapTenantID != "*" {
		t.Fatalf("unexpected bootstrap defaults: %#v", cfg)
	}
}

func TestLoadConfigDoesNotDisableRouteAuthorizationForServerTestEnvironment(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-secret")
	t.Setenv("APP_ENV", "test")

	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("load config: %v", err)
	}
	if cfg.DisableRouteAuthorization {
		t.Fatalf("expected route authorization enabled by default for deployed test environment")
	}
}

func TestLoadConfigReadsExplicitRouteAuthorizationDisableFlag(t *testing.T) {
	t.Setenv("JWT_SECRET", "test-secret")
	t.Setenv("AUTHZ_DISABLE_ROUTE_AUTHORIZATION", "true")

	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("load config: %v", err)
	}
	if !cfg.DisableRouteAuthorization {
		t.Fatalf("expected explicit route authorization disable flag")
	}
}
