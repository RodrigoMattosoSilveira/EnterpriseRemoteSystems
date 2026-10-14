package offhost

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"enterpriseremotesystems/backend/internal/backup"
)

func sshBase(config Config) []string {
	return []string{"-i", config.IdentityFile, "-p", strconv.Itoa(config.Port), "-o", "BatchMode=yes", "-o", "IdentitiesOnly=yes", "-o", "StrictHostKeyChecking=yes", "-o", "UserKnownHostsFile=" + config.KnownHostsFile, config.SSHTarget()}
}

func runSSH(config Config, command string, stdin io.Reader, stdout io.Writer, check bool) ([]byte, error) {
	args := append(sshBase(config), command)
	cmd := exec.Command("ssh", args...)
	if stdin != nil {
		cmd.Stdin = stdin
	}
	var captured strings.Builder
	if stdout != nil {
		cmd.Stdout = stdout
	} else {
		cmd.Stdout = &captured
	}
	var stderr strings.Builder
	cmd.Stderr = &stderr
	err := cmd.Run()
	if check && err != nil {
		exitCode := 1
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		}
		detail := strings.TrimSpace(stderr.String())
		if detail == "" {
			detail = "no stderr"
		}
		return nil, fmt.Errorf("SSH transport failed with exit %d while running %q: %s", exitCode, command, detail)
	}
	if err != nil && !check {
		return []byte(captured.String()), nil
	}
	return []byte(captured.String()), nil
}

func shellQuote(value string) string {
	if value == "" {
		return "''"
	}
	return "'" + strings.ReplaceAll(value, "'", "'\"'\"'") + "'"
}

func remotePaths(config Config, backupName string) (string, string, string, string, error) {
	if filepath.Base(backupName) != backupName || !strings.HasPrefix(backupName, "app-") || !strings.HasSuffix(backupName, ".db") {
		return "", "", "", "", fmt.Errorf("invalid managed backup filename for off-host storage: %q", backupName)
	}
	remoteDir := config.EnvironmentDirectory() + "/" + backupName
	return remoteDir, remoteDir + "/" + backupName, remoteDir + "/" + backupName + backup.ManifestSuffix, remoteDir + "/" + backupName + ReceiptSuffix, nil
}

func remoteDirectoryState(config Config, remoteDir string) (string, error) {
	command := fmt.Sprintf("if [ -d %s ]; then printf directory; elif [ -e %s ]; then printf collision; else printf missing; fi", shellQuote(remoteDir), shellQuote(remoteDir))
	out, err := runSSH(config, command, nil, nil, true)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(out)), nil
}

func uploadFile(config Config, localPath, remotePath string) error {
	file, err := os.Open(localPath)
	if err != nil {
		return err
	}
	defer file.Close()
	_, err = runSSH(config, "umask 077; cat > "+shellQuote(remotePath), file, nil, true)
	return err
}

func downloadFile(config Config, remotePath, localPath string) error {
	file, err := os.Create(localPath)
	if err != nil {
		return err
	}
	_, runErr := runSSH(config, "cat -- "+shellQuote(remotePath), nil, file, true)
	closeErr := file.Close()
	if runErr != nil {
		return runErr
	}
	return closeErr
}

func fetchAndVerifyRemoteSSH(config Config, backupName, expectedBackupSHA, expectedManifestSHA string) (backup.Manifest, error) {
	remoteDir, remoteBackup, remoteManifest, _, err := remotePaths(config, backupName)
	if err != nil {
		return backup.Manifest{}, err
	}
	tempDir, err := os.MkdirTemp("", "ers-offhost-verify-")
	if err != nil {
		return backup.Manifest{}, err
	}
	defer os.RemoveAll(tempDir)
	localBackup := filepath.Join(tempDir, backupName)
	localManifest := filepath.Join(tempDir, backupName+backup.ManifestSuffix)
	if err := downloadFile(config, remoteBackup, localBackup); err != nil {
		return backup.Manifest{}, fmt.Errorf("cannot retrieve off-host backup pair from %s: %w", remoteDir, err)
	}
	if err := downloadFile(config, remoteManifest, localManifest); err != nil {
		return backup.Manifest{}, fmt.Errorf("cannot retrieve off-host backup pair from %s: %w", remoteDir, err)
	}
	return verifyDownloadedPair(localBackup, localManifest, config.Environment, expectedBackupSHA, expectedManifestSHA)
}

func randomToken() (string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

func buildSSHReceipt(config Config, localBackup, localManifest string, payload backup.Manifest, remoteDir string) (Receipt, error) {
	manifestSHA, err := backup.SHA256File(localManifest)
	if err != nil {
		return Receipt{}, err
	}
	return Receipt{FormatVersion: ReceiptFormatVersion, Status: "verified", ReplicatedAt: time.Now().UTC().Format(time.RFC3339Nano), Environment: config.Environment, Transport: TransportSSH,
		Source:       ReceiptSource{BackupFile: filepath.Base(localBackup), BackupSHA256: payload.Backup.SHA256, BackupSize: payload.Backup.SizeBytes, ManifestFile: filepath.Base(localManifest), ManifestSHA256: manifestSHA},
		Remote:       ReceiptRemote{Host: config.Host, User: config.User, Port: config.Port, Directory: remoteDir},
		Verification: ReceiptVerification{Method: "round-trip-download-plus-bite-33.2-full-verification", IntegrityCheck: "ok", ForeignKeyCheck: []string{}},
	}, nil
}

func replicateSSH(config Config, backupPath, manifestPath string) error {
	absoluteBackup, err := filepath.Abs(backupPath)
	if err != nil {
		return err
	}
	absoluteManifest := manifestPath
	if absoluteManifest == "" {
		absoluteManifest = backup.ManifestPathFor(absoluteBackup)
	} else if absoluteManifest, err = filepath.Abs(absoluteManifest); err != nil {
		return err
	}
	payload, err := backup.VerifyPair(absoluteBackup, absoluteManifest, config.Environment, "")
	if err != nil {
		return err
	}
	localBackupSHA := payload.Backup.SHA256
	localManifestSHA, err := backup.SHA256File(absoluteManifest)
	if err != nil {
		return err
	}
	backupName := filepath.Base(absoluteBackup)
	remoteDir, _, _, remoteReceipt, err := remotePaths(config, backupName)
	if err != nil {
		return err
	}
	state, err := remoteDirectoryState(config, remoteDir)
	if err != nil {
		return err
	}
	created := false
	if state == "collision" {
		return fmt.Errorf("off-host destination collides with a non-directory path: %s", remoteDir)
	}
	if state == "missing" {
		token, err := randomToken()
		if err != nil {
			return err
		}
		stage := config.EnvironmentDirectory() + "/.stage-" + backupName + "-" + token
		if _, err := runSSH(config, "umask 077; mkdir -p -- "+shellQuote(config.EnvironmentDirectory())+" && mkdir -- "+shellQuote(stage), nil, nil, true); err != nil {
			return err
		}
		cleanupStage := true
		defer func() {
			if cleanupStage {
				_, _ = runSSH(config, "rm -rf -- "+shellQuote(stage), nil, nil, false)
			}
		}()
		if err := uploadFile(config, absoluteBackup, stage+"/"+backupName); err != nil {
			return err
		}
		if err := uploadFile(config, absoluteManifest, stage+"/"+filepath.Base(absoluteManifest)); err != nil {
			return err
		}
		publish := "if [ -e " + shellQuote(remoteDir) + "]; then exit 73; fi; mv -- " + shellQuote(stage) + " " + shellQuote(remoteDir)
		if _, err := runSSH(config, publish, nil, nil, true); err != nil {
			return err
		}
		cleanupStage = false
		created = true
	}
	remotePayload, err := fetchAndVerifyRemoteSSH(config, backupName, localBackupSHA, localManifestSHA)
	if err != nil {
		if created {
			_, _ = runSSH(config, "rm -rf -- "+shellQuote(remoteDir), nil, nil, false)
		}
		return err
	}
	receipt, err := buildSSHReceipt(config, absoluteBackup, absoluteManifest, remotePayload, remoteDir)
	if err != nil {
		return err
	}
	tempDir, err := os.MkdirTemp("", "ers-offhost-receipt-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(tempDir)
	tempReceipt := filepath.Join(tempDir, filepath.Base(remoteReceipt))
	if err := backup.WriteJSONAtomic(tempReceipt, receipt); err != nil {
		return err
	}
	if err := uploadFile(config, tempReceipt, remoteReceipt); err != nil {
		return err
	}
	localReceipt := ReceiptPathFor(absoluteBackup)
	if err := backup.WriteJSONAtomic(localReceipt, receipt); err != nil {
		return err
	}
	fmt.Printf("Off-host backup verification passed: %s\n", backupName)
	fmt.Printf("Remote: ssh://%s@%s:%d%s\n", config.User, config.Host, config.Port, remoteDir)
	fmt.Printf("Backup SHA-256: %s\n", localBackupSHA)
	fmt.Printf("Manifest SHA-256: %s\n", localManifestSHA)
	fmt.Printf("Receipt: %s\n", localReceipt)
	return nil
}

func verifyReplicaSSH(config Config, receipt Receipt) error {
	backupName := receipt.Source.BackupFile
	remoteDir, _, _, _, err := remotePaths(config, backupName)
	if err != nil {
		return err
	}
	if receipt.Remote.Host != config.Host || receipt.Remote.User != config.User || receipt.Remote.Port != config.Port {
		return errors.New("off-host receipt remote SSH endpoint does not match current configuration")
	}
	if receipt.Remote.Directory != remoteDir {
		return errors.New("off-host receipt remote directory does not match current configuration")
	}
	payload, err := fetchAndVerifyRemoteSSH(config, backupName, receipt.Source.BackupSHA256, receipt.Source.ManifestSHA256)
	if err != nil {
		return err
	}
	fmt.Printf("Off-host replica verification passed: %s\n", backupName)
	fmt.Printf("Remote: ssh://%s@%s:%d%s\n", config.User, config.Host, config.Port, remoteDir)
	fmt.Printf("SHA-256: %s\n", payload.Backup.SHA256)
	return nil
}

func materializeReplicaSSH(config Config, receipt Receipt, outputDirectory string) (MaterializedReplica, error) {
	if receipt.Remote.Host != config.Host || receipt.Remote.User != config.User || receipt.Remote.Port != config.Port {
		return MaterializedReplica{}, errors.New("off-host receipt SSH endpoint does not match current configuration")
	}
	remoteDir, remoteBackup, remoteManifest, _, err := remotePaths(config, receipt.Source.BackupFile)
	if err != nil {
		return MaterializedReplica{}, err
	}
	if receipt.Remote.Directory != remoteDir {
		return MaterializedReplica{}, errors.New("off-host receipt SSH directory does not match current configuration")
	}
	backupPath := filepath.Join(outputDirectory, receipt.Source.BackupFile)
	manifestPath := filepath.Join(outputDirectory, receipt.Source.ManifestFile)
	receiptPath := filepath.Join(outputDirectory, receipt.Source.BackupFile+ReceiptSuffix)
	for _, path := range []string{backupPath, manifestPath, receiptPath} {
		if _, err := os.Stat(path); err == nil {
			return MaterializedReplica{}, fmt.Errorf("refusing to overwrite existing recovery artifact: %s", path)
		} else if !os.IsNotExist(err) {
			return MaterializedReplica{}, err
		}
	}
	tempDir, err := os.MkdirTemp(outputDirectory, ".ers-ssh-recovery-")
	if err != nil {
		return MaterializedReplica{}, err
	}
	defer os.RemoveAll(tempDir)
	tempBackup := filepath.Join(tempDir, receipt.Source.BackupFile)
	tempManifest := filepath.Join(tempDir, receipt.Source.ManifestFile)
	if err := downloadFile(config, remoteBackup, tempBackup); err != nil {
		return MaterializedReplica{}, err
	}
	if err := downloadFile(config, remoteManifest, tempManifest); err != nil {
		return MaterializedReplica{}, err
	}
	if _, err := verifyDownloadedPair(tempBackup, tempManifest, config.Environment, receipt.Source.BackupSHA256, receipt.Source.ManifestSHA256); err != nil {
		return MaterializedReplica{}, err
	}
	if err := os.Chmod(tempBackup, 0o600); err != nil {
		return MaterializedReplica{}, err
	}
	if err := os.Chmod(tempManifest, 0o600); err != nil {
		return MaterializedReplica{}, err
	}
	if err := os.Rename(tempBackup, backupPath); err != nil {
		return MaterializedReplica{}, err
	}
	if err := os.Rename(tempManifest, manifestPath); err != nil {
		_ = os.Remove(backupPath)
		return MaterializedReplica{}, err
	}
	return MaterializedReplica{BackupPath: backupPath, ManifestPath: manifestPath, ReceiptPath: receiptPath}, nil
}
