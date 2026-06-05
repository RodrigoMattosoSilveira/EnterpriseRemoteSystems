package app

import (
	"fmt"
	"os"
	"strings"

	"github.com/joho/godotenv"
)

type Config struct {
	Env                   string
	HTTPAddr              string
	DBPath                string
	JWTSecret             string
	AutoMigrate           bool
	AutoMigrateConfigured bool
}

func LoadConfig() (Config, error) {
	_ = godotenv.Load()
	cfg := Config{
		Env:                   getEnv("APP_ENV", "development"),
		HTTPAddr:              getEnv("HTTP_ADDR", ":8080"),
		DBPath:                getEnv("DB_PATH", getEnv("DATABASE_PATH", "./data/app.db")),
		JWTSecret:             getEnv("JWT_SECRET", "dev-only-change-me"),
		AutoMigrate:           getEnvBool("APP_AUTO_MIGRATE", false),
		AutoMigrateConfigured: hasEnv("APP_AUTO_MIGRATE"),
	}
	if cfg.JWTSecret == "" {
		return Config{}, fmt.Errorf("JWT_SECRET is required")
	}
	return cfg, nil
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
