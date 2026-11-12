package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"enterpriseremotesystems/backend/internal/authentication"
	"enterpriseremotesystems/backend/internal/db"
)

type provisionInput struct {
	ActorKey    string `json:"actorKey"`
	DisplayName string `json:"displayName"`
	Login       string `json:"login"`
	Password    string `json:"password"`
}

func main() {
	localDeveloper := flag.Bool("local-developer-fixtures", false, "install complete LOCAL developer fixtures without database reset")
	byte352Only := flag.Bool("byte352-fixtures-only", false, "provision Byte 35.2 non-production fixture accounts; Tenant Administrator changes require explicit consent")
	flag.Parse()
	if *localDeveloper {
		runLocalDeveloperFixtures()
		return
	}
	if *byte352Only {
		runByte352Only()
		return
	}

	_, ok := normalizeProvisioningEnvironment(os.Getenv("APP_ENV"))
	if !ok {
		log.Fatalf("refusing E2E/test administrator provisioning for APP_ENV=%q; only local/development/test environments are permitted", strings.TrimSpace(os.Getenv("APP_ENV")))
	}

	input, err := readInput(os.Stdin)
	if err != nil {
		log.Fatalf("read provisioning input: %v", err)
	}
	if strings.ContainsAny(input.Password, "\r\n") {
		log.Fatal("provisioning password must not contain newline characters")
	}

	databasePath := firstNonEmpty(os.Getenv("DB_PATH"), os.Getenv("DATABASE_PATH"), "./data/app.db")
	database, err := db.Open(databasePath)
	if err != nil {
		log.Fatalf("open database: %v", err)
	}
	if sqlDB, sqlErr := database.DB(); sqlErr == nil {
		defer sqlDB.Close()
	}

	// The older general E2E seed rotates fixture Tenant Administrator passwords.
	// Once the LOCAL developer credential contract exists, it must not silently
	// overwrite those individually managed 1Password credentials.
	if localDeveloperEnvironmentAllowed(os.Getenv("APP_ENV")) {
		var managed authentication.Account
		if err := database.Where("id = ?", "e2e-byte352-shared-account").Limit(1).Find(&managed).Error; err != nil {
			log.Fatalf("check managed LOCAL fixture status: %v", err)
		}
		if managed.ID != "" {
			log.Fatal("managed LOCAL developer fixture credentials exist; refusing legacy E2E auto-provisioning because it can replace passwords. Restart with ERS_PROVISION_E2E_ADMIN=false")
		}
	}

	ctx := context.Background()
	result, err := authentication.ProvisionApplicationAdmin(ctx, database, authentication.ProvisionApplicationAdminConfig{
		ActorKey:         input.ActorKey,
		DisplayName:      input.DisplayName,
		Login:            input.Login,
		Password:         input.Password,
		PasswordHashCost: positiveInt(os.Getenv("AUTH_PASSWORD_HASH_COST"), 12),
	})
	if err != nil {
		log.Fatalf("provision application administrator: %v", err)
	}

	tenantAdminPassword := firstNonEmpty(os.Getenv("E2E_TENANT_ADMIN_PASSWORD"), input.Password)
	if err := ensureE2ETenantFixtures(ctx, database, tenantAdminPassword, positiveInt(os.Getenv("AUTH_PASSWORD_HASH_COST"), 12)); err != nil {
		log.Fatalf("provision E2E Tenant fixtures: %v", err)
	}

	fmt.Printf(
		"provisioned application administrator actor_key=%s login=%s actor_created=%t grant_created=%t account_created=%t account_reactivated=%t authorization_reactivated=%t login_updated=%t password_updated=%t\n",
		result.ActorKey,
		result.Login,
		result.ActorCreated,
		result.GrantCreated,
		result.AccountCreated,
		result.AccountReactivated,
		result.AuthorizationReactivated,
		result.LoginUpdated,
		result.PasswordUpdated,
	)
}

func normalizeProvisioningEnvironment(value string) (string, bool) {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "local", "dev", "development":
		return "development", true
	case "test", "testing", "ci":
		return "test", true
	default:
		return "", false
	}
}

func readInput(reader io.Reader) (provisionInput, error) {
	decoder := json.NewDecoder(io.LimitReader(reader, 32*1024))
	decoder.DisallowUnknownFields()

	var input provisionInput
	if err := decoder.Decode(&input); err != nil {
		return provisionInput{}, err
	}
	var trailing any
	if err := decoder.Decode(&trailing); err == nil {
		return provisionInput{}, errors.New("provisioning input must contain exactly one JSON object")
	} else if !errors.Is(err, io.EOF) {
		return provisionInput{}, err
	}

	input.ActorKey = strings.TrimSpace(input.ActorKey)
	input.DisplayName = strings.TrimSpace(input.DisplayName)
	input.Login = strings.TrimSpace(input.Login)
	return input, nil
}

func positiveInt(value string, fallback int) int {
	parsed, err := strconv.Atoi(strings.TrimSpace(value))
	if err != nil || parsed <= 0 {
		return fallback
	}
	return parsed
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

// Byte 35.2 has an isolated explicit mode: stdin JSON never contains an admin
// password. No migration, default DB fallback, or general E2E fixture call.
func runByte352Only() {
	if _, ok := normalizeProvisioningEnvironment(os.Getenv("APP_ENV")); !ok {
		log.Fatal("Byte 35.2 fixtures forbidden outside LOCAL/Development/Test")
	}
	var input byte352FixtureInput
	decoder := json.NewDecoder(io.LimitReader(os.Stdin, 65536))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil {
		log.Fatalf("read Byte 35.2 fixture input: %v", err)
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		log.Fatal("Byte 35.2 input must contain exactly one JSON object")
	}
	if err := validateByte352Input(input); err != nil {
		log.Fatalf("invalid Byte 35.2 fixture input: %v", err)
	}
	dbPath := os.Getenv("DB_PATH")
	if !filepath.IsAbs(input.DatabasePath) || !filepath.IsAbs(dbPath) || filepath.Clean(dbPath) != filepath.Clean(input.DatabasePath) {
		log.Fatal("DB_PATH and input databasePath must be identical absolute paths")
	}
	info, err := os.Stat(dbPath)
	if err != nil || !info.Mode().IsRegular() {
		log.Fatal("existing regular database file required; refusing to create database")
	}
	database, err := db.Open(dbPath)
	if err != nil {
		log.Fatalf("open existing fixture database: %v", err)
	}
	if sqlDB, err := database.DB(); err == nil {
		defer sqlDB.Close()
	}
	if err := ensureByte352Fixtures(context.Background(), database, input, positiveInt(os.Getenv("AUTH_PASSWORD_HASH_COST"), 12)); err != nil {
		log.Fatalf("Byte 35.2 fixture transaction rolled back: %v", err)
	}
	fmt.Println("Byte 35.2 non-Production fixture provisioning complete; Application Administrator untouched; Tenant Administrator password changes only with explicit consent")
}
