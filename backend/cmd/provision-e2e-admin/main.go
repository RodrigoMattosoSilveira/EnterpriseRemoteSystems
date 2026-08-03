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
	allowProduction := flag.Bool("allow-production", false, "allow provisioning when APP_ENV is production")
	flag.Parse()

	if flag.NArg() != 0 {
		log.Fatalf("unexpected arguments: %s", strings.Join(flag.Args(), " "))
	}

	appEnv := strings.ToLower(strings.TrimSpace(os.Getenv("APP_ENV")))
	if appEnv == "" {
		appEnv = "development"
	}
	if (appEnv == "production" || appEnv == "prod") && !*allowProduction {
		log.Fatal("refusing to provision an application administrator in production without --allow-production")
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

	result, err := authentication.ProvisionApplicationAdmin(context.Background(), database, authentication.ProvisionApplicationAdminConfig{
		ActorKey:         input.ActorKey,
		DisplayName:      input.DisplayName,
		Login:            input.Login,
		Password:         input.Password,
		PasswordHashCost: positiveInt(os.Getenv("AUTH_PASSWORD_HASH_COST"), 12),
	})
	if err != nil {
		log.Fatalf("provision application administrator: %v", err)
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
