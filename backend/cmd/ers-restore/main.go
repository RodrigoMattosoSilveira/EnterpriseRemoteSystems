package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"time"

	restoretool "enterpriseremotesystems/backend/internal/restore"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintf(os.Stderr, "Restore error: %v\n", err)
		os.Exit(2)
	}
}

func run(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("command is required: verify, stage, or apply")
	}
	switch args[0] {
	case "verify":
		return verify(args[1:])
	case "stage":
		return stage(args[1:])
	case "apply":
		return apply(args[1:])
	default:
		return fmt.Errorf("unknown command %q", args[0])
	}
}

func verify(args []string) error {
	fs := flag.NewFlagSet("verify", flag.ContinueOnError)
	backupPath := fs.String("backup", "", "verified backup database path")
	manifestPath := fs.String("manifest", "", "backup manifest path")
	environment := fs.String("expected-environment", "", "expected environment")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if *backupPath == "" || *environment == "" {
		return fmt.Errorf("--backup and --expected-environment are required")
	}
	manifest, err := restoretool.VerifyCandidate(*backupPath, *manifestPath, *environment)
	if err != nil {
		return err
	}
	absolute, _ := filepath.Abs(*backupPath)
	fmt.Printf("Restore candidate verification passed: %s\n", absolute)
	fmt.Printf("Environment: %s\n", manifest.Environment)
	fmt.Printf("SHA-256: %s\n", manifest.Backup.SHA256)
	fmt.Printf("Latest schema migration: %s\n", manifest.Verification.LatestSchemaMigration)
	return nil
}

func stage(args []string) error {
	fs := flag.NewFlagSet("stage", flag.ContinueOnError)
	backupPath := fs.String("backup", "", "verified backup database path")
	manifestPath := fs.String("manifest", "", "backup manifest path")
	environment := fs.String("expected-environment", "", "expected environment")
	outputDirectory := fs.String("output-dir", "", "recovery staging directory")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if *backupPath == "" || *environment == "" || *outputDirectory == "" {
		return fmt.Errorf("--backup, --expected-environment, and --output-dir are required")
	}
	payload, err := restoretool.StageCandidate(*backupPath, *manifestPath, *environment, *outputDirectory)
	if err != nil {
		return err
	}
	fmt.Printf("Local recovery candidate staged and verified.\n")
	fmt.Printf("Backup: %s\n", payload.BackupPath)
	fmt.Printf("Manifest: %s\n", payload.ManifestPath)
	return nil
}

func apply(args []string) error {
	fs := flag.NewFlagSet("apply", flag.ContinueOnError)
	backupPath := fs.String("backup", "", "verified backup database path")
	manifestPath := fs.String("manifest", "", "backup manifest path")
	targetPath := fs.String("target", "", "SQLite restore target path")
	environment := fs.String("environment", "", "target environment")
	confirmation := fs.String("confirm", "", "environment-specific restore confirmation")
	reportPath := fs.String("report", "", "restore verification report path")
	preRestoreCopy := fs.String("pre-restore-copy", "", "path used to preserve an existing target before replacement")
	nowRaw := fs.String("now", "", "UTC timestamp override")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if *backupPath == "" || *targetPath == "" || *environment == "" || *confirmation == "" {
		return fmt.Errorf("--backup, --target, --environment, and --confirm are required")
	}
	now := time.Now().UTC()
	if *nowRaw != "" {
		parsed, err := time.Parse(time.RFC3339, *nowRaw)
		if err != nil {
			return fmt.Errorf("invalid --now timestamp: %w", err)
		}
		now = parsed.UTC()
	}
	report, err := restoretool.Apply(*backupPath, *manifestPath, *targetPath, *environment, *confirmation, *reportPath, *preRestoreCopy, now)
	if err != nil {
		return err
	}
	fmt.Printf("Restore applied and verified: %s\n", report.RestoredTarget.Path)
	fmt.Printf("Environment: %s\n", report.Environment)
	fmt.Printf("SHA-256: %s\n", report.RestoredTarget.SHA256)
	if report.PreviousTarget.Existed {
		fmt.Printf("Pre-restore copy: %s\n", report.PreviousTarget.Copy)
	}
	if *reportPath != "" {
		absolute, _ := filepath.Abs(*reportPath)
		fmt.Printf("Restore report: %s\n", absolute)
	}
	return nil
}
