package app

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

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
	AuthzActorHeaderMode             string
	AuthSessionTTL                   time.Duration
	AuthPasswordResetTTL             time.Duration
	AuthPasswordHashCost             int
	AuthSessionCookieName            string
	AuthSessionCookieSecure          bool
	AuthSessionCookieSameSite        string
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
		AuthzActorHeaderMode:             getEnv("AUTHZ_ACTOR_HEADER_MODE", defaultActorHeaderMode(env)),
		AuthSessionTTL:                   time.Duration(getEnvInt("AUTH_SESSION_TTL_MINUTES", 720)) * time.Minute,
		AuthPasswordResetTTL:             time.Duration(getEnvInt("AUTH_PASSWORD_RESET_TTL_MINUTES", 30)) * time.Minute,
		AuthPasswordHashCost:             getEnvInt("AUTH_PASSWORD_HASH_COST", 12),
		AuthSessionCookieName:            getEnv("AUTH_SESSION_COOKIE_NAME", "ers_session"),
		AuthSessionCookieSecure:          getEnvBool("AUTH_SESSION_COOKIE_SECURE", authenticationCookieSecureDefault(env)),
		AuthSessionCookieSameSite:        getEnv("AUTH_SESSION_COOKIE_SAME_SITE", "Lax"),
	}
	if cfg.JWTSecret == "" {
		return Config{}, fmt.Errorf("JWT_SECRET is required")
	}
	mode, err := normalizeActorHeaderMode(cfg.Env, cfg.AuthzActorHeaderMode)
	if err != nil {
		return Config{}, err
	}
	cfg.AuthzActorHeaderMode = mode
	return cfg, nil
}

func defaultActorHeaderMode(env string) string {
	switch strings.ToLower(strings.TrimSpace(env)) {
	case "local", "dev", "development":
		return "bootstrap"
	case "test", "testing", "ci":
		return "test"
	default:
		return "disabled"
	}
}

func normalizeActorHeaderMode(env string, mode string) (string, error) {
	normalized := strings.ToLower(strings.TrimSpace(mode))
	switch normalized {
	case "disabled", "bootstrap":
		return normalized, nil
	case "test":
		switch strings.ToLower(strings.TrimSpace(env)) {
		case "test", "testing", "ci":
			return normalized, nil
		default:
			return "", fmt.Errorf("AUTHZ_ACTOR_HEADER_MODE=test is permitted only when APP_ENV is test, testing, or ci")
		}
	default:
		return "", fmt.Errorf("AUTHZ_ACTOR_HEADER_MODE must be disabled, bootstrap, or test")
	}
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

func getEnvInt(key string, fallback int) int {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed <= 0 {
		return fallback
	}
	return parsed
}

func authenticationCookieSecureDefault(env string) bool {
	switch strings.ToLower(strings.TrimSpace(env)) {
	case "production", "prod", "test", "testing":
		return true
	default:
		return false
	}
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
