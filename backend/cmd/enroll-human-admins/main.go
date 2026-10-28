// enroll-human-admins creates exactly two new human GLOBAL Application Administrators.
// It is an OFFLINE production operation, not a server endpoint or E2E provisioner.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"enterpriseremotesystems/backend/internal/authentication"
	"enterpriseremotesystems/backend/internal/db"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

const productionConfirmation = "ENROLL_TWO_HUMAN_ADMINS"

func readEnrollment(r io.Reader) (authentication.HumanAdministratorEnrollment, error) {
	var input authentication.HumanAdministratorEnrollment
	decoder := json.NewDecoder(io.LimitReader(r, 16385))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&input); err != nil {
		return input, fmt.Errorf("invalid administrator input document: %w", err)
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		if err == nil {
			return input, errors.New("administrator input must contain exactly one JSON object")
		}
		return input, fmt.Errorf("invalid trailing administrator input: %w", err)
	}
	return input, nil
}

func verifyDatabaseFile(path string) error {
	if strings.TrimSpace(path) == "" {
		return errors.New("explicit --db path is required")
	}
	absolute, err := filepath.Abs(path)
	if err != nil {
		return err
	}
	info, err := os.Lstat(absolute)
	if err != nil {
		return fmt.Errorf("existing migrated database is required: %w", err)
	}
	if !info.Mode().IsRegular() {
		return errors.New("database must be an existing regular file, not a symlink or device")
	}
	if info.Size() == 0 {
		return errors.New("database must not be empty")
	}
	return nil
}

func verifyPreconditions(env, desired, confirm, approval, operator, backup string, offline bool) error {
	actual := strings.ToLower(strings.TrimSpace(env))
	desired = strings.ToLower(strings.TrimSpace(desired))
	if desired != "local" && desired != "test" && desired != "production" {
		return errors.New("--environment must be local, test, or production")
	}
	if actual != desired {
		return errors.New("APP_ENV must exactly match --environment (no aliases)")
	}
	if !offline {
		return errors.New("--offline-confirmed is required; stop the backend and verify no DB writers first")
	}
	if approval == "" || operator == "" || backup == "" {
		return errors.New("approval, operator, and backup evidence references are required")
	}
	if desired == "production" && confirm != productionConfirmation {
		return errors.New("Production enrollment requires --confirm-production ENROLL_TWO_HUMAN_ADMINS")
	}
	if desired != "production" && confirm != "" {
		return errors.New("--confirm-production is only valid for production")
	}
	return nil
}

func run(args []string, stdin io.Reader, stdout io.Writer) error {
	flags := flag.NewFlagSet("enroll-human-admins", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	path := flags.String("db", "", "existing migrated SQLite database")
	environment := flags.String("environment", "", "local | test | production")
	approval := flags.String("approval-reference", "", "approved change reference (no secrets)")
	operator := flags.String("operator-reference", "", "enrolling operator reference (no secrets)")
	backup := flags.String("backup-evidence-reference", "", "verified off-host backup evidence identifier")
	offline := flags.Bool("offline-confirmed", false, "confirm backend stopped and database isolated")
	confirm := flags.String("confirm-production", "", "literal production enrollment confirmation")
	if err := flags.Parse(args); err != nil {
		return fmt.Errorf("invalid flags (see --help): %w", err)
	}
	if flags.NArg() != 0 {
		return errors.New("unexpected positional arguments")
	}
	if err := verifyPreconditions(os.Getenv("APP_ENV"), *environment, *confirm, *approval, *operator, *backup, *offline); err != nil {
		return err
	}
	if err := verifyDatabaseFile(*path); err != nil {
		return err
	}
	request, err := readEnrollment(stdin)
	if err != nil {
		return err
	}
	database, err := db.Open(*path)
	if err != nil {
		return fmt.Errorf("open existing database: %w", err)
	}
	sqlDB, err := database.DB()
	if err != nil {
		return err
	}
	defer sqlDB.Close()
	// Suppress GORM SQL logging for credential-bearing INSERTs even on failure.
	guardedDatabase := database.Session(&gorm.Session{Logger: logger.Default.LogMode(logger.Silent)})
	result, err := authentication.EnrollTwoHumanApplicationAdministrators(context.Background(), guardedDatabase, request, authentication.HumanAdministratorEnrollmentEvidence{
		ApprovalReference: *approval, OperatorReference: *operator, BackupEvidenceReference: *backup, PasswordHashCost: 12,
	})
	if err != nil {
		return err
	}
	for _, row := range result {
		fmt.Fprintf(stdout, "enrolled login=%s actor_key=%s account_id=%s actor_id=%s must_change_password=true\n", row.Login, row.ActorKey, row.AccountID, row.ActorID)
	}
	return nil
}

func main() {
	if err := run(os.Args[1:], os.Stdin, os.Stdout); err != nil {
		// Never log raw requests, credentials, password hashes, or flags containing secrets.
		fmt.Fprintf(os.Stderr, "human administrator enrollment refused: %v\n", err)
		os.Exit(1)
	}
}
