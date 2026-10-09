package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"enterpriseremotesystems/backend/internal/backup"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintf(os.Stderr, "Backup verification error: %v\n", err)
		os.Exit(2)
	}
}

func run(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("command is required: create-manifest, verify, or prune")
	}
	switch args[0] {
	case "create-manifest":
		return createManifest(args[1:])
	case "verify":
		return verify(args[1:])
	case "prune":
		return prune(args[1:])
	default:
		return fmt.Errorf("unknown command %q", args[0])
	}
}

func createManifest(args []string) error {
	fs := flag.NewFlagSet("create-manifest", flag.ContinueOnError)
	backupPath := fs.String("backup", "", "backup database path")
	manifestPath := fs.String("manifest", "", "manifest path")
	environment := fs.String("environment", "", "environment")
	sourceContainer := fs.String("source-container", "", "source container")
	sourceDatabasePath := fs.String("source-database-path", "", "source database path")
	createdAtRaw := fs.String("created-at", "", "UTC creation timestamp")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if *backupPath == "" || *environment == "" || *sourceContainer == "" || *sourceDatabasePath == "" {
		return fmt.Errorf("--backup, --environment, --source-container, and --source-database-path are required")
	}
	absoluteBackup, err := filepath.Abs(*backupPath)
	if err != nil {
		return err
	}
	absoluteManifest := *manifestPath
	if absoluteManifest == "" {
		absoluteManifest = backup.ManifestPathFor(absoluteBackup)
	} else if absoluteManifest, err = filepath.Abs(absoluteManifest); err != nil {
		return err
	}
	createdAt := time.Now().UTC()
	if *createdAtRaw != "" {
		createdAt, err = backup.ParseUTC(*createdAtRaw)
		if err != nil {
			return err
		}
	}
	payload, err := backup.BuildManifest(absoluteBackup, *environment, *sourceContainer, *sourceDatabasePath, createdAt)
	if err != nil {
		return err
	}
	if err := backup.WriteJSONAtomic(absoluteManifest, payload); err != nil {
		return err
	}
	verified, err := backup.VerifyPair(absoluteBackup, absoluteManifest, *environment, *sourceDatabasePath)
	if err != nil {
		return err
	}
	fmt.Printf("Verified backup manifest written to %s\n", absoluteManifest)
	fmt.Printf("Backup SHA-256: %s\n", verified.Backup.SHA256)
	fmt.Printf("Latest schema migration: %s\n", verified.Verification.LatestSchemaMigration)
	return nil
}

func verify(args []string) error {
	fs := flag.NewFlagSet("verify", flag.ContinueOnError)
	backupPath := fs.String("backup", "", "backup database path")
	manifestPath := fs.String("manifest", "", "manifest path")
	expectedEnvironment := fs.String("expected-environment", "", "expected environment")
	expectedSourceDatabasePath := fs.String("expected-source-database-path", "", "expected source database path")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if *backupPath == "" {
		return fmt.Errorf("--backup is required")
	}
	absoluteBackup, err := filepath.Abs(*backupPath)
	if err != nil {
		return err
	}
	absoluteManifest := *manifestPath
	if absoluteManifest == "" {
		absoluteManifest = backup.ManifestPathFor(absoluteBackup)
	} else if absoluteManifest, err = filepath.Abs(absoluteManifest); err != nil {
		return err
	}
	payload, err := backup.VerifyPair(absoluteBackup, absoluteManifest, *expectedEnvironment, *expectedSourceDatabasePath)
	if err != nil {
		return err
	}
	fmt.Printf("Backup verification passed: %s\n", absoluteBackup)
	fmt.Printf("Manifest: %s\n", absoluteManifest)
	fmt.Printf("Environment: %s\n", payload.Environment)
	fmt.Printf("SHA-256: %s\n", payload.Backup.SHA256)
	fmt.Printf("Latest schema migration: %s\n", payload.Verification.LatestSchemaMigration)
	return nil
}

func prune(args []string) error {
	fs := flag.NewFlagSet("prune", flag.ContinueOnError)
	directory := fs.String("directory", "", "backup directory")
	retentionCountRaw := fs.String("retention-count", "", "minimum retained count")
	retentionDaysRaw := fs.String("retention-days", "", "retention age in days")
	nowRaw := fs.String("now", "", "UTC timestamp override")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if *directory == "" || *retentionCountRaw == "" || *retentionDaysRaw == "" {
		return fmt.Errorf("--directory, --retention-count, and --retention-days are required")
	}
	count, err := strconv.Atoi(*retentionCountRaw)
	if err != nil || count < 1 {
		return fmt.Errorf("retention count must be an integer >= 1")
	}
	days, err := strconv.Atoi(*retentionDaysRaw)
	if err != nil || days < 1 {
		return fmt.Errorf("retention days must be an integer >= 1")
	}
	now := time.Now().UTC()
	if *nowRaw != "" {
		now, err = backup.ParseUTC(*nowRaw)
		if err != nil {
			return err
		}
	}
	absoluteDirectory, err := filepath.Abs(*directory)
	if err != nil {
		return err
	}
	_, err = backup.Prune(absoluteDirectory, count, days, now)
	return err
}
