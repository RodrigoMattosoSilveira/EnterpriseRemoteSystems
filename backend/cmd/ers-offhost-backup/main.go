package main

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"

	"enterpriseremotesystems/backend/internal/offhost"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintf(os.Stderr, "Off-host backup error: %v\n", err)
		os.Exit(2)
	}
}

func run(args []string) error {
	if len(args) == 0 {
		return fmt.Errorf("command is required: status, check-config, replicate, verify-replica, or materialize")
	}
	switch args[0] {
	case "status":
		return status(args[1:])
	case "check-config":
		return checkConfig(args[1:])
	case "replicate":
		return replicate(args[1:])
	case "verify-replica":
		return verifyReplica(args[1:])
	case "materialize":
		return materialize(args[1:])
	default:
		return fmt.Errorf("unknown command %q", args[0])
	}
}

func commonConfigFlags(name string, args []string) (*flag.FlagSet, *string, *string, error) {
	fs := flag.NewFlagSet(name, flag.ContinueOnError)
	environment := fs.String("environment", "", "environment")
	envFile := fs.String("env-file", "", "environment file")
	if err := fs.Parse(args); err != nil {
		return nil, nil, nil, err
	}
	return fs, environment, envFile, nil
}

func status(args []string) error {
	_, environment, envFile, err := commonConfigFlags("status", args)
	if err != nil {
		return err
	}
	if *environment == "" || *envFile == "" {
		return fmt.Errorf("--environment and --env-file are required")
	}
	absoluteEnv, err := filepath.Abs(*envFile)
	if err != nil {
		return err
	}
	config, err := offhost.LoadConfig(*environment, absoluteEnv, false)
	if err != nil {
		return err
	}
	if config.Enabled {
		fmt.Println("enabled")
	} else {
		fmt.Println("disabled")
	}
	return nil
}

func checkConfig(args []string) error {
	fs := flag.NewFlagSet("check-config", flag.ContinueOnError)
	environment := fs.String("environment", "", "environment")
	envFile := fs.String("env-file", "", "environment file")
	runtimeFiles := fs.Bool("runtime-files", false, "also require transport credential/config files to exist")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if *environment == "" || *envFile == "" {
		return fmt.Errorf("--environment and --env-file are required")
	}
	absoluteEnv, err := filepath.Abs(*envFile)
	if err != nil {
		return err
	}
	config, err := offhost.LoadConfig(*environment, absoluteEnv, *runtimeFiles)
	if err != nil {
		return err
	}
	state := "disabled"
	if config.Enabled {
		state = "enabled"
	}
	fmt.Printf("Off-host backup configuration valid for %s: %s\n", config.Environment, state)
	return nil
}

func replicate(args []string) error {
	fs := flag.NewFlagSet("replicate", flag.ContinueOnError)
	environment := fs.String("environment", "", "environment")
	envFile := fs.String("env-file", "", "environment file")
	backupPath := fs.String("backup", "", "backup database path")
	manifestPath := fs.String("manifest", "", "manifest path")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if *environment == "" || *envFile == "" || *backupPath == "" {
		return fmt.Errorf("--environment, --env-file, and --backup are required")
	}
	return offhost.Replicate(*environment, *envFile, *backupPath, *manifestPath)
}

func verifyReplica(args []string) error {
	fs := flag.NewFlagSet("verify-replica", flag.ContinueOnError)
	environment := fs.String("environment", "", "environment")
	envFile := fs.String("env-file", "", "environment file")
	receipt := fs.String("receipt", "", "off-host receipt path")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if *environment == "" || *envFile == "" || *receipt == "" {
		return fmt.Errorf("--environment, --env-file, and --receipt are required")
	}
	return offhost.VerifyReplica(*environment, *envFile, *receipt)
}

func materialize(args []string) error {
	fs := flag.NewFlagSet("materialize", flag.ContinueOnError)
	environment := fs.String("environment", "", "environment")
	envFile := fs.String("env-file", "", "environment file")
	receipt := fs.String("receipt", "", "local off-host receipt path")
	backupName := fs.String("backup-name", "", "managed backup filename used to bootstrap the protected S3 receipt when the local receipt is unavailable")
	outputDirectory := fs.String("output-dir", "", "directory for verified recovery artifacts")
	if err := fs.Parse(args); err != nil {
		return err
	}
	if *environment == "" || *envFile == "" || *outputDirectory == "" {
		return fmt.Errorf("--environment, --env-file, and --output-dir are required")
	}
	if (*receipt == "") == (*backupName == "") {
		return fmt.Errorf("exactly one of --receipt or --backup-name is required")
	}

	var (
		payload offhost.MaterializedReplica
		err     error
	)
	if *receipt != "" {
		payload, err = offhost.MaterializeReplica(*environment, *envFile, *receipt, *outputDirectory)
	} else {
		payload, err = offhost.MaterializeS3ReplicaByBackupName(*environment, *envFile, *backupName, *outputDirectory)
	}
	if err != nil {
		return err
	}
	fmt.Printf("Off-host recovery candidate materialized and verified.\n")
	fmt.Printf("Backup: %s\n", payload.BackupPath)
	fmt.Printf("Manifest: %s\n", payload.ManifestPath)
	fmt.Printf("Receipt: %s\n", payload.ReceiptPath)
	if payload.ReceiptVersionID != "" {
		fmt.Printf("Receipt VersionId: %s\n", payload.ReceiptVersionID)
	}
	return nil
}
