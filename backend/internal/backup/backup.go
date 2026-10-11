package backup

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strings"
	"time"

	_ "github.com/ncruces/go-sqlite3/driver"
)

const (
	FormatVersion  = 1
	ManifestSuffix = ".manifest.json"
)

var RequiredTables = []string{
	"schema_migrations",
	"tenants",
	"global_people",
	"person_tenant_memberships",
	"auth_user_accounts",
	"authz_actors",
	"authz_actor_role_grants",
	"collaborator_journeys",
	"ledger_entries",
	"work_periods",
}

var CountTables = []string{
	"tenants",
	"global_people",
	"person_tenant_memberships",
	"auth_user_accounts",
	"authz_actors",
	"collaborator_journeys",
	"ledger_entries",
	"work_periods",
}

type Inspection struct {
	IntegrityCheck        string         `json:"integrity_check"`
	ForeignKeyCheck       string         `json:"foreign_key_check"`
	SchemaMigrationCount  int            `json:"schema_migration_count"`
	LatestSchemaMigration string         `json:"latest_schema_migration"`
	RecordCounts          map[string]int `json:"record_counts"`
}

type Source struct {
	Container    string `json:"container"`
	DatabasePath string `json:"database_path"`
}

type BackupMetadata struct {
	File      string `json:"file"`
	SizeBytes int64  `json:"size_bytes"`
	SHA256    string `json:"sha256"`
}

type Verification struct {
	VerifiedAt            string         `json:"verified_at"`
	IntegrityCheck        string         `json:"integrity_check"`
	ForeignKeyCheck       string         `json:"foreign_key_check"`
	RequiredTables        []string       `json:"required_tables"`
	SchemaMigrationCount  int            `json:"schema_migration_count"`
	LatestSchemaMigration string         `json:"latest_schema_migration"`
	RecordCounts          map[string]int `json:"record_counts"`
}

type Manifest struct {
	FormatVersion int            `json:"format_version"`
	Status        string         `json:"status"`
	CreatedAt     string         `json:"created_at"`
	Environment   string         `json:"environment"`
	Source        Source         `json:"source"`
	Backup        BackupMetadata `json:"backup"`
	Verification  Verification   `json:"verification"`
}

func NormalizeEnvironment(value string) (string, error) {
	normalized := strings.ToLower(strings.TrimSpace(value))
	switch normalized {
	case "dev", "local", "development":
		return "development", nil
	case "testing", "ci", "test":
		return "test", nil
	case "prod", "production":
		return "production", nil
	default:
		return "", errors.New("backup environment must explicitly identify development, test, or production")
	}
}

func ParseUTC(value string) (time.Time, error) {
	parsed, err := time.Parse(time.RFC3339, value)
	if err != nil {
		return time.Time{}, fmt.Errorf("invalid UTC timestamp %q: %w", value, err)
	}
	return parsed.UTC(), nil
}

func FormatUTC(value time.Time) string {
	return value.UTC().Truncate(time.Second).Format(time.RFC3339)
}

func SHA256File(path string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()

	h := sha256.New()
	if _, err := io.Copy(h, file); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

func ManifestPathFor(backupPath string) string {
	return backupPath + ManifestSuffix
}

func sqliteReadOnlyDSN(path string) (string, error) {
	absolute, err := filepath.Abs(path)
	if err != nil {
		return "", err
	}
	u := &url.URL{Scheme: "file", Path: filepath.ToSlash(absolute)}
	query := u.Query()
	query.Set("mode", "ro")
	query.Set("immutable", "1")
	u.RawQuery = query.Encode()
	return u.String(), nil
}

func Inspect(path string) (Inspection, error) {
	info, err := os.Stat(path)
	if err != nil {
		if os.IsNotExist(err) {
			return Inspection{}, fmt.Errorf("backup file does not exist: %s", path)
		}
		return Inspection{}, err
	}
	if !info.Mode().IsRegular() {
		return Inspection{}, fmt.Errorf("backup file does not exist: %s", path)
	}
	if info.Size() <= 0 {
		return Inspection{}, fmt.Errorf("backup file is empty: %s", path)
	}

	dsn, err := sqliteReadOnlyDSN(path)
	if err != nil {
		return Inspection{}, err
	}
	db, err := sql.Open("sqlite3", dsn)
	if err != nil {
		return Inspection{}, fmt.Errorf("cannot open SQLite backup %s: %w", path, err)
	}
	defer db.Close()

	integrityRows, err := db.Query("PRAGMA integrity_check")
	if err != nil {
		return Inspection{}, fmt.Errorf("SQLite verification failed for %s: %w", path, err)
	}
	var integrity []string
	for integrityRows.Next() {
		var value string
		if err := integrityRows.Scan(&value); err != nil {
			integrityRows.Close()
			return Inspection{}, fmt.Errorf("SQLite verification failed for %s: %w", path, err)
		}
		integrity = append(integrity, value)
	}
	if err := integrityRows.Err(); err != nil {
		integrityRows.Close()
		return Inspection{}, fmt.Errorf("SQLite verification failed for %s: %w", path, err)
	}
	integrityRows.Close()
	if len(integrity) != 1 || integrity[0] != "ok" {
		detail := "no result"
		if len(integrity) > 0 {
			if len(integrity) > 10 {
				integrity = integrity[:10]
			}
			detail = strings.Join(integrity, "; ")
		}
		return Inspection{}, fmt.Errorf("PRAGMA integrity_check failed for %s: %s", path, detail)
	}

	fkRows, err := db.Query("PRAGMA foreign_key_check")
	if err != nil {
		return Inspection{}, fmt.Errorf("SQLite verification failed for %s: %w", path, err)
	}
	if fkRows.Next() {
		fkRows.Close()
		return Inspection{}, fmt.Errorf("PRAGMA foreign_key_check failed for %s: violation(s) returned", path)
	}
	if err := fkRows.Err(); err != nil {
		fkRows.Close()
		return Inspection{}, fmt.Errorf("SQLite verification failed for %s: %w", path, err)
	}
	fkRows.Close()

	tableRows, err := db.Query("SELECT name FROM sqlite_master WHERE type='table'")
	if err != nil {
		return Inspection{}, fmt.Errorf("SQLite verification failed for %s: %w", path, err)
	}
	tables := map[string]bool{}
	for tableRows.Next() {
		var name string
		if err := tableRows.Scan(&name); err != nil {
			tableRows.Close()
			return Inspection{}, fmt.Errorf("SQLite verification failed for %s: %w", path, err)
		}
		tables[name] = true
	}
	tableRows.Close()
	var missing []string
	for _, table := range RequiredTables {
		if !tables[table] {
			missing = append(missing, table)
		}
	}
	if len(missing) > 0 {
		return Inspection{}, fmt.Errorf("backup is missing required ERS table(s): %s", strings.Join(missing, ", "))
	}

	var migrationCount int
	if err := db.QueryRow("SELECT COUNT(*) FROM schema_migrations").Scan(&migrationCount); err != nil {
		return Inspection{}, fmt.Errorf("SQLite verification failed for %s: %w", path, err)
	}
	if migrationCount <= 0 {
		return Inspection{}, errors.New("backup schema_migrations is empty")
	}
	var latest string
	if err := db.QueryRow("SELECT filename FROM schema_migrations ORDER BY filename DESC LIMIT 1").Scan(&latest); err != nil {
		return Inspection{}, fmt.Errorf("SQLite verification failed for %s: %w", path, err)
	}
	if latest == "" {
		return Inspection{}, errors.New("backup has no latest schema migration marker")
	}

	counts := make(map[string]int, len(CountTables))
	for _, table := range CountTables {
		var count int
		query := fmt.Sprintf(`SELECT COUNT(*) FROM "%s"`, table)
		if err := db.QueryRow(query).Scan(&count); err != nil {
			return Inspection{}, fmt.Errorf("SQLite verification failed for %s: %w", path, err)
		}
		counts[table] = count
	}

	return Inspection{
		IntegrityCheck:        "ok",
		ForeignKeyCheck:       "ok",
		SchemaMigrationCount:  migrationCount,
		LatestSchemaMigration: latest,
		RecordCounts:          counts,
	}, nil
}

func BuildManifest(backupPath, environment, sourceContainer, sourceDatabasePath string, createdAt time.Time) (Manifest, error) {
	environment, err := NormalizeEnvironment(environment)
	if err != nil {
		return Manifest{}, err
	}
	if strings.TrimSpace(sourceContainer) == "" {
		return Manifest{}, errors.New("source container is required")
	}
	if strings.TrimSpace(sourceDatabasePath) == "" {
		return Manifest{}, errors.New("source database path is required")
	}
	inspection, err := Inspect(backupPath)
	if err != nil {
		return Manifest{}, err
	}
	info, err := os.Stat(backupPath)
	if err != nil {
		return Manifest{}, err
	}
	sha, err := SHA256File(backupPath)
	if err != nil {
		return Manifest{}, err
	}
	return Manifest{
		FormatVersion: FormatVersion,
		Status:        "verified",
		CreatedAt:     FormatUTC(createdAt),
		Environment:   environment,
		Source: Source{
			Container:    sourceContainer,
			DatabasePath: sourceDatabasePath,
		},
		Backup: BackupMetadata{
			File:      filepath.Base(backupPath),
			SizeBytes: info.Size(),
			SHA256:    sha,
		},
		Verification: Verification{
			VerifiedAt:            FormatUTC(time.Now().UTC()),
			IntegrityCheck:        inspection.IntegrityCheck,
			ForeignKeyCheck:       inspection.ForeignKeyCheck,
			RequiredTables:        append([]string(nil), RequiredTables...),
			SchemaMigrationCount:  inspection.SchemaMigrationCount,
			LatestSchemaMigration: inspection.LatestSchemaMigration,
			RecordCounts:          inspection.RecordCounts,
		},
	}, nil
}

func WriteJSONAtomic(path string, payload any) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	temp := fmt.Sprintf("%s.tmp-%d", path, os.Getpid())
	file, err := os.OpenFile(temp, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	cleanup := func() { _ = os.Remove(temp) }
	encoder := json.NewEncoder(file)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(payload); err != nil {
		file.Close()
		cleanup()
		return err
	}
	if err := file.Sync(); err != nil {
		file.Close()
		cleanup()
		return err
	}
	if err := file.Close(); err != nil {
		cleanup()
		return err
	}
	if err := os.Rename(temp, path); err != nil {
		cleanup()
		return err
	}
	return nil
}

func LoadManifest(path string) (Manifest, error) {
	file, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			return Manifest{}, fmt.Errorf("backup manifest does not exist: %s", path)
		}
		return Manifest{}, fmt.Errorf("cannot read backup manifest %s: %w", path, err)
	}
	defer file.Close()
	var manifest Manifest
	decoder := json.NewDecoder(file)
	if err := decoder.Decode(&manifest); err != nil {
		return Manifest{}, fmt.Errorf("cannot read backup manifest %s: %w", path, err)
	}
	return manifest, nil
}

func VerifyDatabaseAgainstManifest(databasePath string, manifest Manifest, expectedEnvironment string) error {
	if manifest.FormatVersion != FormatVersion {
		return fmt.Errorf("unsupported backup manifest format_version: %d", manifest.FormatVersion)
	}
	if manifest.Status != "verified" {
		return fmt.Errorf("backup manifest status is not verified: %q", manifest.Status)
	}
	environment, err := NormalizeEnvironment(manifest.Environment)
	if err != nil {
		return err
	}
	if expectedEnvironment != "" {
		expected, err := NormalizeEnvironment(expectedEnvironment)
		if err != nil {
			return err
		}
		if environment != expected {
			return fmt.Errorf("backup environment mismatch: expected %s, manifest declares %s", expected, environment)
		}
	}
	info, err := os.Stat(databasePath)
	actualSize := int64(-1)
	if err == nil {
		actualSize = info.Size()
	}
	if manifest.Backup.SizeBytes != actualSize {
		return fmt.Errorf("backup size mismatch: manifest=%d actual=%d", manifest.Backup.SizeBytes, actualSize)
	}
	actualSHA, err := SHA256File(databasePath)
	if err != nil {
		return err
	}
	if manifest.Backup.SHA256 != actualSHA {
		return fmt.Errorf("backup SHA-256 mismatch: manifest=%q actual=%s", manifest.Backup.SHA256, actualSHA)
	}
	inspection, err := Inspect(databasePath)
	if err != nil {
		return err
	}
	if !reflect.DeepEqual(manifest.Verification.RequiredTables, RequiredTables) {
		return errors.New("backup manifest required_tables does not match the current 33.2 contract")
	}
	if manifest.Verification.IntegrityCheck != inspection.IntegrityCheck {
		return errors.New("backup manifest integrity_check evidence does not match re-verification")
	}
	if manifest.Verification.ForeignKeyCheck != inspection.ForeignKeyCheck {
		return errors.New("backup manifest foreign_key_check evidence does not match re-verification")
	}
	if manifest.Verification.SchemaMigrationCount != inspection.SchemaMigrationCount {
		return errors.New("backup schema migration count changed since manifest creation")
	}
	if manifest.Verification.LatestSchemaMigration != inspection.LatestSchemaMigration {
		return errors.New("backup latest schema migration changed since manifest creation")
	}
	if !reflect.DeepEqual(manifest.Verification.RecordCounts, inspection.RecordCounts) {
		return errors.New("backup core record counts changed since manifest creation")
	}
	if _, err := ParseUTC(manifest.CreatedAt); err != nil {
		return err
	}
	if _, err := ParseUTC(manifest.Verification.VerifiedAt); err != nil {
		return err
	}
	return nil
}

func VerifyPair(backupPath, manifestPath, expectedEnvironment, expectedSourceDatabasePath string) (Manifest, error) {
	manifest, err := LoadManifest(manifestPath)
	if err != nil {
		return Manifest{}, err
	}
	if manifest.Backup.File != filepath.Base(backupPath) {
		return Manifest{}, fmt.Errorf("backup filename mismatch: manifest declares %q, actual file is %q", manifest.Backup.File, filepath.Base(backupPath))
	}
	if expectedSourceDatabasePath != "" && manifest.Source.DatabasePath != expectedSourceDatabasePath {
		return Manifest{}, fmt.Errorf("backup source database mismatch: expected %q, manifest declares %q", expectedSourceDatabasePath, manifest.Source.DatabasePath)
	}
	if err := VerifyDatabaseAgainstManifest(backupPath, manifest, expectedEnvironment); err != nil {
		return Manifest{}, err
	}
	return manifest, nil
}

type retainedPair struct {
	CreatedAt time.Time
	Backup    string
	Manifest  string
}

func Prune(directory string, retentionCount, retentionDays int, now time.Time) ([]string, error) {
	if retentionCount < 1 {
		return nil, errors.New("retention count must be an integer >= 1")
	}
	if retentionDays < 1 {
		return nil, errors.New("retention days must be an integer >= 1")
	}
	info, err := os.Stat(directory)
	if err != nil || !info.IsDir() {
		return nil, fmt.Errorf("backup directory does not exist: %s", directory)
	}
	matches, err := filepath.Glob(filepath.Join(directory, "app-*.db"+ManifestSuffix))
	if err != nil {
		return nil, err
	}
	sort.Strings(matches)
	pairs := make([]retainedPair, 0, len(matches))
	for _, manifestPath := range matches {
		backupPath := strings.TrimSuffix(manifestPath, ManifestSuffix)
		manifest, err := VerifyPair(backupPath, manifestPath, "", "")
		if err != nil {
			return nil, err
		}
		createdAt, err := ParseUTC(manifest.CreatedAt)
		if err != nil {
			return nil, err
		}
		pairs = append(pairs, retainedPair{CreatedAt: createdAt, Backup: backupPath, Manifest: manifestPath})
	}
	if len(pairs) == 0 {
		fmt.Printf("Retention: no verified managed backups found in %s; nothing to prune.\n", directory)
		return nil, nil
	}
	sort.Slice(pairs, func(i, j int) bool { return pairs[i].CreatedAt.After(pairs[j].CreatedAt) })
	cutoff := now.UTC().AddDate(0, 0, -retentionDays)
	keep := map[string]bool{}
	for i := 0; i < len(pairs) && i < retentionCount; i++ {
		keep[pairs[i].Backup] = true
	}
	for _, pair := range pairs {
		if !pair.CreatedAt.Before(cutoff) {
			keep[pair.Backup] = true
		}
	}
	if len(keep) == 0 {
		return nil, errors.New("retention policy would remove all verified backups; refusing")
	}
	var deletions []retainedPair
	for _, pair := range pairs {
		if !keep[pair.Backup] {
			deletions = append(deletions, pair)
		}
	}
	if len(deletions) >= len(pairs) {
		return nil, errors.New("retention policy would remove all verified backups; refusing")
	}
	removed := make([]string, 0, len(deletions))
	for _, pair := range deletions {
		fmt.Printf("Retention: removing verified backup %s\n", filepath.Base(pair.Backup))
		if err := os.Remove(pair.Backup); err != nil {
			return removed, err
		}
		if err := os.Remove(pair.Manifest); err != nil {
			return removed, err
		}
		removed = append(removed, pair.Backup)
	}
	fmt.Printf("Retention: kept %d verified backup(s); removed %d; minimum-count=%d; max-age-days=%d.\n", len(pairs)-len(deletions), len(deletions), retentionCount, retentionDays)
	return removed, nil
}
