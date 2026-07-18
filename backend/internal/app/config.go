package app

import (
	"fmt"
	"os"
	"strings"

	"github.com/joho/godotenv"
)

type Config struct {
	Env                              string
	HTTPAddr                         string
	DBPath                           string
	JWTSecret                        string
	AutoMigrate                      bool
	AutoMigrateConfigured            bool
	LedgerCorrectionKey              string
	LedgerSettlementKey              string
	AuthzBootstrapEnabled            bool
	AuthzBootstrapActorKey           string
	AuthzBootstrapDisplayName        string
	AuthzBootstrapRoleCode           string
	AuthzBootstrapTenantID           string
	AuthzBootstrapRequireEmptyActors bool
	DisableRouteAuthorization        bool
}

func LoadConfig() (Config, error) {
	_ = godotenv.Load()
	env := getEnv("APP_ENV", "development")
	authzBootstrapDefault := localAuthzBootstrapDefault(env)
	cfg := Config{
		Env:                              env,
		HTTPAddr:                         getEnv("HTTP_ADDR", ":8080"),
		DBPath:                           getEnv("DB_PATH", getEnv("DATABASE_PATH", "./data/app.db")),
		JWTSecret:                        getEnv("JWT_SECRET", "dev-only-change-me"),
		AutoMigrate:                      getEnvBool("APP_AUTO_MIGRATE", false),
		AutoMigrateConfigured:            hasEnv("APP_AUTO_MIGRATE"),
		LedgerCorrectionKey:              getEnv("LEDGER_CORRECTION_KEY", ""),
		LedgerSettlementKey:              getEnv("LEDGER_SETTLEMENT_KEY", ""),
		AuthzBootstrapEnabled:            getEnvBool("AUTHZ_BOOTSTRAP_ENABLED", authzBootstrapDefault.Enabled),
		AuthzBootstrapActorKey:           getEnv("AUTHZ_BOOTSTRAP_ACTOR_KEY", authzBootstrapDefault.ActorKey),
		AuthzBootstrapDisplayName:        getEnv("AUTHZ_BOOTSTRAP_DISPLAY_NAME", authzBootstrapDefault.DisplayName),
		AuthzBootstrapRoleCode:           getEnv("AUTHZ_BOOTSTRAP_ROLE_CODE", "APPLICATION_ADMIN"),
		AuthzBootstrapTenantID:           getEnv("AUTHZ_BOOTSTRAP_TENANT_ID", "*"),
		AuthzBootstrapRequireEmptyActors: getEnvBool("AUTHZ_BOOTSTRAP_REQUIRE_EMPTY_ACTOR_TABLE", false),
		DisableRouteAuthorization:        getEnvBool("AUTHZ_DISABLE_ROUTE_AUTHORIZATION", false),
	}
	if cfg.JWTSecret == "" {
		return Config{}, fmt.Errorf("JWT_SECRET is required")
	}
	return cfg, nil
}

type localBootstrapDefaults struct {
	Enabled     bool
	ActorKey    string
	DisplayName string
}

func localAuthzBootstrapDefault(env string) localBootstrapDefaults {
	switch strings.ToLower(strings.TrimSpace(env)) {
	case "local", "dev", "development":
		return localBootstrapDefaults{Enabled: true, ActorKey: "bootstrap-admin", DisplayName: "Bootstrap Admin"}
	default:
		return localBootstrapDefaults{}
	}
}

func getEnv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func hasEnv(key string) bool {
	_, ok := os.LookupEnv(key)
	return ok
}

func getEnvBool(key string, fallback bool) bool {
	value := strings.TrimSpace(strings.ToLower(os.Getenv(key)))
	if value == "" {
		return fallback
	}
	switch value {
	case "1", "true", "t", "yes", "y", "on":
		return true
	case "0", "false", "f", "no", "n", "off":
		return false
	default:
		return fallback
	}
}
