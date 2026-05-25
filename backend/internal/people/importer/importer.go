package importer

import (
	"context"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"os"
	"sort"
	"strings"

	"enterpriseremotesystems/backend/internal/people"
	"gorm.io/gorm"
)

const defaultActorUserID = "people-csv-import"

var requiredHeaders = []string{
	"firstName",
	"lastName",
	"nickname",
	"cpf",
	"rg",
	"cellular",
	"email",
	"statusId",
}

var optionalHeaders = []string{
	"notes",
}

var allowedHeaders = buildAllowedHeaders()

// Options controls a People CSV import run.
type Options struct {
	FilePath        string
	DryRun          bool
	ActorUserID     string
	DefaultStatusID string
}

// Report describes the outcome of an import attempt.
type Report struct {
	DryRun        bool
	RowsRead      int
	RowsValidated int
	RowsInserted  int
	Errors        []RowError
}

// HasErrors reports whether the import found any row-level or file-level errors.
func (r Report) HasErrors() bool {
	return len(r.Errors) > 0
}

// RowError describes one import failure. Row 0 is used for file/header errors.
type RowError struct {
	Row     int
	Field   string
	Message string
}

// Error implements error for failed imports.
type Error struct {
	Report Report
}

func (e Error) Error() string {
	return fmt.Sprintf("people import failed with %d error(s)", len(e.Report.Errors))
}

// RunFile imports People from a CSV file. It validates and inserts all rows inside a
// single transaction. If any row fails, the entire transaction is rolled back. Dry-run
// mode also rolls back after exercising the same service/repository path.
func RunFile(ctx context.Context, database *gorm.DB, opts Options) (Report, error) {
	file, err := os.Open(opts.FilePath)
	if err != nil {
		return Report{}, fmt.Errorf("open CSV file: %w", err)
	}
	defer file.Close()

	return Run(ctx, database, file, opts)
}

// Run imports People from CSV data read from reader.
func Run(ctx context.Context, database *gorm.DB, reader io.Reader, opts Options) (Report, error) {
	report := Report{DryRun: opts.DryRun}

	records, err := readCSV(reader)
	if err != nil {
		report.Errors = append(report.Errors, RowError{Row: 0, Field: "csv", Message: err.Error()})
		return report, Error{Report: report}
	}

	if len(records) == 0 {
		report.Errors = append(report.Errors, RowError{Row: 0, Field: "csv", Message: "CSV file is empty"})
		return report, Error{Report: report}
	}

	headers := normalizeHeaders(records[0])
	indexes, headerErrors := validateHeaders(headers)
	if len(headerErrors) > 0 {
		report.Errors = append(report.Errors, headerErrors...)
		return report, Error{Report: report}
	}

	rows := records[1:]
	report.RowsRead = len(rows)

	actorUserID := strings.TrimSpace(opts.ActorUserID)
	if actorUserID == "" {
		actorUserID = defaultActorUserID
	}

	txErr := database.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		svc := people.NewService(people.NewRepository(tx))

		for i, record := range rows {
			rowNumber := i + 2

			if isBlankRecord(record) {
				report.RowsRead--
				continue
			}

			req := requestFromRecord(record, indexes, opts.DefaultStatusID)
			_, err := svc.Create(ctx, req, actorUserID)
			if err != nil {
				report.Errors = append(report.Errors, rowErrorsFromError(rowNumber, err)...)
				continue
			}

			report.RowsValidated++
			if !opts.DryRun {
				report.RowsInserted++
			}
		}

		if len(report.Errors) > 0 || opts.DryRun {
			return errRollbackImport
		}

		return nil
	})

	if txErr != nil && !errors.Is(txErr, errRollbackImport) {
		return report, fmt.Errorf("run people import transaction: %w", txErr)
	}

	if report.DryRun {
		report.RowsInserted = 0
	}

	if len(report.Errors) > 0 {
		return report, Error{Report: report}
	}

	return report, nil
}

var errRollbackImport = errors.New("rollback people import transaction")

func readCSV(reader io.Reader) ([][]string, error) {
	r := csv.NewReader(reader)
	r.TrimLeadingSpace = true
	r.FieldsPerRecord = -1

	records, err := r.ReadAll()
	if err != nil {
		return nil, err
	}
	return records, nil
}

func normalizeHeaders(headers []string) []string {
	normalized := make([]string, len(headers))
	for i, header := range headers {
		normalized[i] = strings.TrimSpace(header)
	}
	return normalized
}

func validateHeaders(headers []string) (map[string]int, []RowError) {
	indexes := map[string]int{}
	var errs []RowError

	for i, header := range headers {
		if header == "" {
			errs = append(errs, RowError{Row: 1, Field: "header", Message: fmt.Sprintf("column %d has an empty header", i+1)})
			continue
		}
		if _, exists := allowedHeaders[header]; !exists {
			errs = append(errs, RowError{Row: 1, Field: header, Message: "unknown CSV header"})
			continue
		}
		if _, exists := indexes[header]; exists {
			errs = append(errs, RowError{Row: 1, Field: header, Message: "duplicate CSV header"})
			continue
		}
		indexes[header] = i
	}

	for _, required := range requiredHeaders {
		if _, exists := indexes[required]; !exists {
			errs = append(errs, RowError{Row: 1, Field: required, Message: "missing required CSV header"})
		}
	}

	return indexes, errs
}

func requestFromRecord(record []string, indexes map[string]int, defaultStatusID string) people.CreatePersonRequest {
	statusID := csvValue(record, indexes, "statusId")
	if strings.TrimSpace(statusID) == "" {
		statusID = defaultStatusID
	}

	return people.CreatePersonRequest{
		FirstName: csvValue(record, indexes, "firstName"),
		LastName:  csvValue(record, indexes, "lastName"),
		Nickname:  csvValue(record, indexes, "nickname"),
		CPF:       csvValue(record, indexes, "cpf"),
		RG:        csvValue(record, indexes, "rg"),
		Cellular:  csvValue(record, indexes, "cellular"),
		Email:     csvValue(record, indexes, "email"),
		StatusID:  statusID,
		Notes:     csvValue(record, indexes, "notes"),
	}
}

func csvValue(record []string, indexes map[string]int, key string) string {
	idx, exists := indexes[key]
	if !exists || idx >= len(record) {
		return ""
	}
	return strings.TrimSpace(record[idx])
}

func isBlankRecord(record []string) bool {
	for _, value := range record {
		if strings.TrimSpace(value) != "" {
			return false
		}
	}
	return true
}

func rowErrorsFromError(row int, err error) []RowError {
	if validationErr, ok := people.IsValidationError(err); ok {
		fields := validationErr.ValidationFields()
		keys := make([]string, 0, len(fields))
		for key := range fields {
			keys = append(keys, key)
		}
		sort.Strings(keys)

		errs := make([]RowError, 0, len(keys))
		for _, key := range keys {
			errs = append(errs, RowError{Row: row, Field: key, Message: fields[key]})
		}
		return errs
	}

	return []RowError{{Row: row, Field: "", Message: err.Error()}}
}

func buildAllowedHeaders() map[string]struct{} {
	allowed := map[string]struct{}{}
	for _, header := range requiredHeaders {
		allowed[header] = struct{}{}
	}
	for _, header := range optionalHeaders {
		allowed[header] = struct{}{}
	}
	return allowed
}
