package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"

	"enterpriseremotesystems/backend/internal/db"
	"enterpriseremotesystems/backend/internal/people/importer"
)

func main() {
	dbPath := flag.String("db", "data/app.db", "path to the SQLite database file")
	filePath := flag.String("file", "", "path to the People CSV file")
	dryRun := flag.Bool("dry-run", false, "validate the CSV using a transaction and roll back without inserting rows")
	actorUserID := flag.String("actor", "people-csv-import", "actor user ID recorded by the people service")
	defaultStatusID := flag.String("default-status-id", "", "status ID to use when a CSV row has an empty statusId")
	flag.Parse()

	if *filePath == "" {
		fmt.Fprintln(os.Stderr, "missing required -file argument")
		os.Exit(2)
	}

	database, err := db.Open(*dbPath)
	if err != nil {
		log.Fatalf("open database: %v", err)
	}

	if err := db.AutoMigrate(database); err != nil {
		log.Fatalf("auto migrate database: %v", err)
	}
	if err := db.SeedReferenceData(database); err != nil {
		log.Fatalf("seed reference data: %v", err)
	}

	report, err := importer.RunFile(context.Background(), database, importer.Options{
		FilePath:        *filePath,
		DryRun:          *dryRun,
		ActorUserID:     *actorUserID,
		DefaultStatusID: *defaultStatusID,
	})
	printReport(report)
	if err != nil {
		os.Exit(1)
	}
}

func printReport(report importer.Report) {
	mode := "import"
	if report.DryRun {
		mode = "dry-run"
	}

	fmt.Printf("People CSV %s report\n", mode)
	fmt.Printf("Rows read:      %d\n", report.RowsRead)
	fmt.Printf("Rows validated: %d\n", report.RowsValidated)
	fmt.Printf("Rows inserted:  %d\n", report.RowsInserted)

	if !report.HasErrors() {
		fmt.Println("Errors:         0")
		return
	}

	fmt.Printf("Errors:         %d\n", len(report.Errors))
	for _, rowErr := range report.Errors {
		if rowErr.Field == "" {
			fmt.Printf("  row %d: %s\n", rowErr.Row, rowErr.Message)
			continue
		}
		fmt.Printf("  row %d, %s: %s\n", rowErr.Row, rowErr.Field, rowErr.Message)
	}
}
