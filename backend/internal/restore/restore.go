package restore

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"enterpriseremotesystems/backend/internal/backup"
)

const (
	ReportFormatVersion = 1
	ReportSuffix        = ".restore.json"
)

type SourceEvidence struct {
	BackupFile     string `json:"backup_file"`
	BackupSHA256   string `json:"backup_sha256"`
	ManifestFile   string `json:"manifest_file"`
	ManifestSHA256 string `json:"manifest_sha256"`
	Environment    string `json:"environment"`
}

type PreservedSidecar struct {
	Suffix string `json:"suffix"`
	Copy   string `json:"copy"`
	SHA256 string `json:"sha256"`
}

type PreviousTargetEvidence struct {
	Existed  bool               `json:"existed"`
	Copy     string             `json:"copy,omitempty"`
	SHA256   string             `json:"sha256,omitempty"`
	Sidecars []PreservedSidecar `json:"sidecars,omitempty"`
}

type RestoredTargetEvidence struct {
	Path                  string         `json:"path"`
	SHA256                string         `json:"sha256"`
	SizeBytes             int64          `json:"size_bytes"`
	IntegrityCheck        string         `json:"integrity_check"`
	ForeignKeyCheck       string         `json:"foreign_key_check"`
	SchemaMigrationCount  int            `json:"schema_migration_count"`
	LatestSchemaMigration string         `json:"latest_schema_migration"`
	RecordCounts          map[string]int `json:"record_counts"`
}

type Report struct {
	FormatVersion  int                    `json:"format_version"`
	Status         string                 `json:"status"`
	AppliedAt      string                 `json:"applied_at"`
	Environment    string                 `json:"environment"`
	Source         SourceEvidence         `json:"source"`
	PreviousTarget PreviousTargetEvidence `json:"previous_target"`
	RestoredTarget RestoredTargetEvidence `json:"restored_target"`
}

func ConfirmationForEnvironment(environment string) (string, error) {
	normalized, err := backup.NormalizeEnvironment(environment)
	if err != nil {
		return "", err
	}
	return "RESTORE-" + strings.ToUpper(normalized), nil
}

func VerifyCandidate(backupPath, manifestPath, expectedEnvironment string) (backup.Manifest, error) {
	absoluteBackup, err := filepath.Abs(backupPath)
	if err != nil {
		return backup.Manifest{}, err
	}
	if manifestPath == "" {
		manifestPath = backup.ManifestPathFor(absoluteBackup)
	}
	absoluteManifest, err := filepath.Abs(manifestPath)
	if err != nil {
		return backup.Manifest{}, err
	}
	return backup.VerifyPair(absoluteBackup, absoluteManifest, expectedEnvironment, "")
}

type StagedCandidate struct {
	BackupPath   string
	ManifestPath string
}

func StageCandidate(backupPath, manifestPath, expectedEnvironment, outputDirectory string) (StagedCandidate, error) {
	absoluteBackup, err := filepath.Abs(backupPath)
	if err != nil {
		return StagedCandidate{}, err
	}
	if manifestPath == "" {
		manifestPath = backup.ManifestPathFor(absoluteBackup)
	}
	absoluteManifest, err := filepath.Abs(manifestPath)
	if err != nil {
		return StagedCandidate{}, err
	}
	if _, err := backup.VerifyPair(absoluteBackup, absoluteManifest, expectedEnvironment, ""); err != nil {
		return StagedCandidate{}, err
	}
	absoluteOutput, err := filepath.Abs(outputDirectory)
	if err != nil {
		return StagedCandidate{}, err
	}
	if err := os.MkdirAll(absoluteOutput, 0o700); err != nil {
		return StagedCandidate{}, err
	}
	destinationBackup := filepath.Join(absoluteOutput, filepath.Base(absoluteBackup))
	destinationManifest := filepath.Join(absoluteOutput, filepath.Base(absoluteManifest))
	for _, path := range []string{destinationBackup, destinationManifest} {
		if _, err := os.Stat(path); err == nil {
			return StagedCandidate{}, fmt.Errorf("refusing to overwrite existing recovery artifact: %s", path)
		} else if !os.IsNotExist(err) {
			return StagedCandidate{}, err
		}
	}
	if err := copyFileDurable(absoluteBackup, destinationBackup, 0o600); err != nil {
		return StagedCandidate{}, err
	}
	if err := copyFileDurable(absoluteManifest, destinationManifest, 0o600); err != nil {
		_ = os.Remove(destinationBackup)
		return StagedCandidate{}, err
	}
	if _, err := backup.VerifyPair(destinationBackup, destinationManifest, expectedEnvironment, ""); err != nil {
		_ = os.Remove(destinationBackup)
		_ = os.Remove(destinationManifest)
		return StagedCandidate{}, fmt.Errorf("staged recovery candidate verification failed: %w", err)
	}
	return StagedCandidate{BackupPath: destinationBackup, ManifestPath: destinationManifest}, nil
}

func copyFileDurable(source, destination string, mode os.FileMode) error {
	in, err := os.Open(source)
	if err != nil {
		return err
	}
	defer in.Close()
	if err := os.MkdirAll(filepath.Dir(destination), 0o755); err != nil {
		return err
	}
	out, err := os.OpenFile(destination, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, mode)
	if err != nil {
		return err
	}
	cleanup := func() { _ = os.Remove(destination) }
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		cleanup()
		return err
	}
	if err := out.Sync(); err != nil {
		out.Close()
		cleanup()
		return err
	}
	if err := out.Close(); err != nil {
		cleanup()
		return err
	}
	return nil
}

func fsyncDirectory(path string) error {
	dir, err := os.Open(path)
	if err != nil {
		return err
	}
	defer dir.Close()
	return dir.Sync()
}

func fileSHA256(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

func preservePreviousTarget(targetPath, copyPath string) (PreviousTargetEvidence, error) {
	info, err := os.Stat(targetPath)
	if err != nil {
		if os.IsNotExist(err) {
			return PreviousTargetEvidence{Existed: false}, nil
		}
		return PreviousTargetEvidence{}, err
	}
	if !info.Mode().IsRegular() {
		return PreviousTargetEvidence{}, fmt.Errorf("restore target is not a regular file: %s", targetPath)
	}
	if strings.TrimSpace(copyPath) == "" {
		return PreviousTargetEvidence{}, errors.New("--pre-restore-copy is required when the restore target already exists")
	}
	absoluteCopy, err := filepath.Abs(copyPath)
	if err != nil {
		return PreviousTargetEvidence{}, err
	}
	absoluteTarget, err := filepath.Abs(targetPath)
	if err != nil {
		return PreviousTargetEvidence{}, err
	}
	if absoluteCopy == absoluteTarget {
		return PreviousTargetEvidence{}, errors.New("pre-restore copy path must differ from the restore target")
	}
	if _, err := os.Stat(absoluteCopy); err == nil {
		return PreviousTargetEvidence{}, fmt.Errorf("refusing to overwrite existing pre-restore copy: %s", absoluteCopy)
	} else if !os.IsNotExist(err) {
		return PreviousTargetEvidence{}, err
	}
	if err := copyFileDurable(absoluteTarget, absoluteCopy, 0o600); err != nil {
		return PreviousTargetEvidence{}, fmt.Errorf("cannot preserve current restore target: %w", err)
	}
	sha, err := fileSHA256(absoluteCopy)
	if err != nil {
		return PreviousTargetEvidence{}, err
	}
	evidence := PreviousTargetEvidence{Existed: true, Copy: absoluteCopy, SHA256: sha}
	for _, suffix := range []string{"-wal", "-shm", "-journal"} {
		sourceSidecar := absoluteTarget + suffix
		info, err := os.Stat(sourceSidecar)
		if err != nil {
			if os.IsNotExist(err) {
				continue
			}
			return PreviousTargetEvidence{}, err
		}
		if !info.Mode().IsRegular() {
			return PreviousTargetEvidence{}, fmt.Errorf("SQLite sidecar is not a regular file: %s", sourceSidecar)
		}
		destinationSidecar := absoluteCopy + suffix
		if _, err := os.Stat(destinationSidecar); err == nil {
			return PreviousTargetEvidence{}, fmt.Errorf("refusing to overwrite existing pre-restore sidecar copy: %s", destinationSidecar)
		} else if !os.IsNotExist(err) {
			return PreviousTargetEvidence{}, err
		}
		if err := copyFileDurable(sourceSidecar, destinationSidecar, 0o600); err != nil {
			return PreviousTargetEvidence{}, fmt.Errorf("cannot preserve SQLite sidecar %s: %w", suffix, err)
		}
		sidecarSHA, err := fileSHA256(destinationSidecar)
		if err != nil {
			return PreviousTargetEvidence{}, err
		}
		evidence.Sidecars = append(evidence.Sidecars, PreservedSidecar{Suffix: suffix, Copy: destinationSidecar, SHA256: sidecarSHA})
	}
	return evidence, nil
}

func removeSQLiteSidecars(targetPath string) error {
	for _, suffix := range []string{"-wal", "-shm", "-journal"} {
		path := targetPath + suffix
		if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
			return fmt.Errorf("cannot remove stale SQLite sidecar %s: %w", path, err)
		}
	}
	return nil
}

func Apply(backupPath, manifestPath, targetPath, expectedEnvironment, confirmation, reportPath, preRestoreCopy string, now time.Time) (Report, error) {
	if strings.TrimSpace(targetPath) == "" {
		return Report{}, errors.New("restore target path is required")
	}
	normalizedEnvironment, err := backup.NormalizeEnvironment(expectedEnvironment)
	if err != nil {
		return Report{}, err
	}
	requiredConfirmation, err := ConfirmationForEnvironment(normalizedEnvironment)
	if err != nil {
		return Report{}, err
	}
	if confirmation != requiredConfirmation {
		return Report{}, fmt.Errorf("restore confirmation mismatch: expected %s", requiredConfirmation)
	}

	absoluteBackup, err := filepath.Abs(backupPath)
	if err != nil {
		return Report{}, err
	}
	if manifestPath == "" {
		manifestPath = backup.ManifestPathFor(absoluteBackup)
	}
	absoluteManifest, err := filepath.Abs(manifestPath)
	if err != nil {
		return Report{}, err
	}
	absoluteTarget, err := filepath.Abs(targetPath)
	if err != nil {
		return Report{}, err
	}
	if absoluteBackup == absoluteTarget {
		return Report{}, errors.New("restore source and target must be different files")
	}

	manifest, err := backup.VerifyPair(absoluteBackup, absoluteManifest, normalizedEnvironment, "")
	if err != nil {
		return Report{}, err
	}
	manifestSHA, err := backup.SHA256File(absoluteManifest)
	if err != nil {
		return Report{}, err
	}
	sourceEvidence := SourceEvidence{
		BackupFile:     manifest.Backup.File,
		BackupSHA256:   manifest.Backup.SHA256,
		ManifestFile:   filepath.Base(absoluteManifest),
		ManifestSHA256: manifestSHA,
		Environment:    manifest.Environment,
	}
	absoluteReport := ""
	if reportPath != "" {
		absoluteReport, err = filepath.Abs(reportPath)
		if err != nil {
			return Report{}, err
		}
		if _, err := os.Stat(absoluteReport); err == nil {
			return Report{}, fmt.Errorf("refusing to overwrite existing restore report: %s", absoluteReport)
		} else if !os.IsNotExist(err) {
			return Report{}, err
		}
		if err := os.MkdirAll(filepath.Dir(absoluteReport), 0o755); err != nil {
			return Report{}, err
		}
		probe, err := os.CreateTemp(filepath.Dir(absoluteReport), ".ers-restore-report-probe-*")
		if err != nil {
			return Report{}, fmt.Errorf("restore report directory is not writable: %w", err)
		}
		probePath := probe.Name()
		if err := probe.Close(); err != nil {
			os.Remove(probePath)
			return Report{}, err
		}
		_ = os.Remove(probePath)
	}

	if err := os.MkdirAll(filepath.Dir(absoluteTarget), 0o755); err != nil {
		return Report{}, err
	}
	stage, err := os.CreateTemp(filepath.Dir(absoluteTarget), ".ers-restore-stage-*.db")
	if err != nil {
		return Report{}, err
	}
	stagePath := stage.Name()
	if err := stage.Close(); err != nil {
		os.Remove(stagePath)
		return Report{}, err
	}
	defer os.Remove(stagePath)
	if err := copyFileDurable(absoluteBackup, stagePath, 0o600); err != nil {
		return Report{}, err
	}
	if err := backup.VerifyDatabaseAgainstManifest(stagePath, manifest, normalizedEnvironment); err != nil {
		return Report{}, fmt.Errorf("staged restore verification failed: %w", err)
	}
	previous, err := preservePreviousTarget(absoluteTarget, preRestoreCopy)
	if err != nil {
		return Report{}, err
	}
	if absoluteReport != "" {
		pending := Report{
			FormatVersion:  ReportFormatVersion,
			Status:         "applying",
			AppliedAt:      backup.FormatUTC(now),
			Environment:    normalizedEnvironment,
			Source:         sourceEvidence,
			PreviousTarget: previous,
		}
		if err := backup.WriteJSONAtomic(absoluteReport, pending); err != nil {
			return Report{}, err
		}
		if err := os.Chmod(absoluteReport, 0o600); err != nil {
			return Report{}, err
		}
	}
	if err := removeSQLiteSidecars(absoluteTarget); err != nil {
		return Report{}, err
	}
	if err := os.Rename(stagePath, absoluteTarget); err != nil {
		return Report{}, fmt.Errorf("cannot atomically install restored database: %w", err)
	}
	if err := fsyncDirectory(filepath.Dir(absoluteTarget)); err != nil {
		return Report{}, fmt.Errorf("cannot fsync restore target directory: %w", err)
	}
	if err := backup.VerifyDatabaseAgainstManifest(absoluteTarget, manifest, normalizedEnvironment); err != nil {
		return Report{}, fmt.Errorf("installed restore verification failed: %w", err)
	}
	inspection, err := backup.Inspect(absoluteTarget)
	if err != nil {
		return Report{}, err
	}
	info, err := os.Stat(absoluteTarget)
	if err != nil {
		return Report{}, err
	}
	targetSHA, err := backup.SHA256File(absoluteTarget)
	if err != nil {
		return Report{}, err
	}
	report := Report{
		FormatVersion:  ReportFormatVersion,
		Status:         "verified",
		AppliedAt:      backup.FormatUTC(now),
		Environment:    normalizedEnvironment,
		Source:         sourceEvidence,
		PreviousTarget: previous,
		RestoredTarget: RestoredTargetEvidence{
			Path:                  absoluteTarget,
			SHA256:                targetSHA,
			SizeBytes:             info.Size(),
			IntegrityCheck:        inspection.IntegrityCheck,
			ForeignKeyCheck:       inspection.ForeignKeyCheck,
			SchemaMigrationCount:  inspection.SchemaMigrationCount,
			LatestSchemaMigration: inspection.LatestSchemaMigration,
			RecordCounts:          inspection.RecordCounts,
		},
	}
	if absoluteReport != "" {
		if err := backup.WriteJSONAtomic(absoluteReport, report); err != nil {
			return Report{}, err
		}
		if err := os.Chmod(absoluteReport, 0o600); err != nil {
			return Report{}, err
		}
	}
	return report, nil
}
