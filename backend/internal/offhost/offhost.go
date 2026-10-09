package offhost

import (
	"bufio"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"enterpriseremotesystems/backend/internal/backup"
)

const (
	ReceiptSuffix        = ".offhost.json"
	ReceiptFormatVersion = 1
)

type Config struct {
	Environment    string
	Enabled        bool
	Host           string
	User           string
	Directory      string
	Port           int
	IdentityFile   string
	KnownHostsFile string
}

func (c Config) SSHTarget() string {
	return c.User + "@" + c.Host
}

func (c Config) EnvironmentDirectory() string {
	return strings.TrimRight(c.Directory, "/") + "/" + c.Environment
}

type ReceiptSource struct {
	BackupFile     string `json:"backup_file"`
	BackupSHA256   string `json:"backup_sha256"`
	BackupSize     int64  `json:"backup_size_bytes"`
	ManifestFile   string `json:"manifest_file"`
	ManifestSHA256 string `json:"manifest_sha256"`
}

type ReceiptRemote struct {
	Host      string `json:"host"`
	User      string `json:"user"`
	Port      int    `json:"port"`
	Directory string `json:"directory"`
}

type ReceiptVerification struct {
	Method          string   `json:"method"`
	IntegrityCheck  string   `json:"integrity_check"`
	ForeignKeyCheck []string `json:"foreign_key_check"`
}

type Receipt struct {
	FormatVersion int                 `json:"format_version"`
	Status        string              `json:"status"`
	ReplicatedAt  string              `json:"replicated_at"`
	Environment   string              `json:"environment"`
	Transport     string              `json:"transport"`
	Source        ReceiptSource       `json:"source"`
	Remote        ReceiptRemote       `json:"remote"`
	Verification  ReceiptVerification `json:"verification"`
}

func normalizeEnvironment(raw string) (string, error) {
	value := strings.ToLower(strings.TrimSpace(raw))
	switch value {
	case "local", "dev", "development":
		return "development", nil
	case "test", "testing", "ci":
		return "test", nil
	case "production", "prod":
		return "production", nil
	default:
		return "", fmt.Errorf("environment must explicitly identify development, test, or production; got %q", raw)
	}
}

func parseBool(raw, label string) (bool, error) {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "1", "true", "yes", "on":
		return true, nil
	case "0", "false", "no", "off", "":
		return false, nil
	default:
		return false, fmt.Errorf("%s must be true or false; got %q", label, raw)
	}
}

func readEnvFile(path string) (map[string]string, error) {
	file, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, fmt.Errorf("off-host environment file does not exist: %s", path)
		}
		return nil, fmt.Errorf("cannot read off-host environment file %s: %w", path, err)
	}
	defer file.Close()
	values := map[string]string{}
	scanner := bufio.NewScanner(file)
	lineNumber := 0
	for scanner.Scan() {
		lineNumber++
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") || !strings.Contains(line, "=") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		key := strings.TrimSpace(parts[0])
		if key == "" {
			continue
		}
		if _, exists := values[key]; exists {
			return nil, fmt.Errorf("%s defines %s more than once (line %d)", path, key, lineNumber)
		}
		value := strings.TrimSpace(parts[1])
		if len(value) >= 2 && ((value[0] == '"' && value[len(value)-1] == '"') || (value[0] == '\'' && value[len(value)-1] == '\'')) {
			value = value[1 : len(value)-1]
		}
		values[key] = value
	}
	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("cannot read off-host environment file %s: %w", path, err)
	}
	return values, nil
}

func LoadConfig(environment, envFile string, requireRuntimeFiles bool) (Config, error) {
	normalized, err := normalizeEnvironment(environment)
	if err != nil {
		return Config{}, err
	}
	values, err := readEnvFile(envFile)
	if err != nil {
		return Config{}, err
	}
	fileEnvironment, err := normalizeEnvironment(values["APP_ENV"])
	if err != nil {
		return Config{}, err
	}
	if fileEnvironment != normalized {
		return Config{}, fmt.Errorf("selected environment %s does not match %s APP_ENV=%s", normalized, envFile, fileEnvironment)
	}
	enabled, err := parseBool(values["SERVER_OFFHOST_BACKUP_ENABLED"], "SERVER_OFFHOST_BACKUP_ENABLED")
	if err != nil {
		return Config{}, err
	}
	if normalized == "production" && !enabled {
		return Config{}, errors.New("Production requires SERVER_OFFHOST_BACKUP_ENABLED=true so verified backups leave the application host.")
	}

	host := strings.TrimSpace(values["SERVER_OFFHOST_BACKUP_HOST"])
	user := strings.TrimSpace(values["SERVER_OFFHOST_BACKUP_USER"])
	directory := strings.TrimSpace(values["SERVER_OFFHOST_BACKUP_DIRECTORY"])
	portRaw := strings.TrimSpace(values["SERVER_OFFHOST_BACKUP_PORT"])
	if portRaw == "" {
		portRaw = "22"
	}
	identity := strings.TrimSpace(values["SERVER_OFFHOST_BACKUP_IDENTITY_FILE"])
	knownHosts := strings.TrimSpace(values["SERVER_OFFHOST_BACKUP_KNOWN_HOSTS_FILE"])
	if !enabled {
		return Config{
			Environment:    normalized,
			Enabled:        false,
			Host:           host,
			User:           user,
			Directory:      directory,
			Port:           22,
			IdentityFile:   firstNonEmpty(identity, "/nonexistent"),
			KnownHostsFile: firstNonEmpty(knownHosts, "/nonexistent"),
		}, nil
	}
	if host == "" || strings.ContainsAny(host, " \t\r\n") {
		return Config{}, errors.New("SERVER_OFFHOST_BACKUP_HOST must be a non-empty host name/address without whitespace")
	}
	lowerHost := strings.TrimSuffix(strings.ToLower(host), ".")
	if lowerHost == "localhost" || lowerHost == "localhost.localdomain" {
		return Config{}, errors.New("SERVER_OFFHOST_BACKUP_HOST must identify a distinct non-loopback host")
	}
	if parsed := net.ParseIP(strings.Trim(host, "[]")); parsed != nil && parsed.IsLoopback() {
		return Config{}, errors.New("SERVER_OFFHOST_BACKUP_HOST must identify a distinct non-loopback host")
	}
	if user == "" || strings.ContainsAny(user, " \t\r\n") {
		return Config{}, errors.New("SERVER_OFFHOST_BACKUP_USER must be a non-empty SSH user without whitespace")
	}
	if !filepath.IsAbs(directory) || directory == "/" {
		return Config{}, errors.New("SERVER_OFFHOST_BACKUP_DIRECTORY must be an absolute remote directory other than /")
	}
	if strings.ContainsAny(directory, "\r\n") {
		return Config{}, errors.New("SERVER_OFFHOST_BACKUP_DIRECTORY must not contain newlines")
	}
	port, err := strconv.Atoi(portRaw)
	if err != nil || port < 1 || port > 65535 {
		return Config{}, errors.New("SERVER_OFFHOST_BACKUP_PORT must be an integer from 1 through 65535")
	}
	if identity == "" {
		return Config{}, errors.New("SERVER_OFFHOST_BACKUP_IDENTITY_FILE is required when off-host backup is enabled")
	}
	if knownHosts == "" {
		return Config{}, errors.New("SERVER_OFFHOST_BACKUP_KNOWN_HOSTS_FILE is required when off-host backup is enabled")
	}
	if !filepath.IsAbs(identity) {
		return Config{}, errors.New("SERVER_OFFHOST_BACKUP_IDENTITY_FILE must be an absolute path")
	}
	if !filepath.IsAbs(knownHosts) {
		return Config{}, errors.New("SERVER_OFFHOST_BACKUP_KNOWN_HOSTS_FILE must be an absolute path")
	}
	if requireRuntimeFiles {
		if info, err := os.Stat(identity); err != nil || !info.Mode().IsRegular() {
			return Config{}, fmt.Errorf("off-host SSH identity file does not exist: %s", identity)
		}
		if info, err := os.Stat(knownHosts); err != nil || !info.Mode().IsRegular() {
			return Config{}, fmt.Errorf("off-host SSH known-hosts file does not exist: %s", knownHosts)
		}
	}
	return Config{
		Environment:    normalized,
		Enabled:        true,
		Host:           host,
		User:           user,
		Directory:      strings.TrimRight(directory, "/"),
		Port:           port,
		IdentityFile:   identity,
		KnownHostsFile: knownHosts,
	}, nil
}

func firstNonEmpty(value, fallback string) string {
	if value != "" {
		return value
	}
	return fallback
}

func sshBase(config Config) []string {
	return []string{
		"-i", config.IdentityFile,
		"-p", strconv.Itoa(config.Port),
		"-o", "BatchMode=yes",
		"-o", "IdentitiesOnly=yes",
		"-o", "StrictHostKeyChecking=yes",
		"-o", "UserKnownHostsFile=" + config.KnownHostsFile,
		config.SSHTarget(),
	}
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
	return remoteDir,
		remoteDir + "/" + backupName,
		remoteDir + "/" + backupName + backup.ManifestSuffix,
		remoteDir + "/" + backupName + ReceiptSuffix,
		nil
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

func verifyDownloadedPair(backupPath, manifestPath, environment, expectedBackupSHA, expectedManifestSHA string) (backup.Manifest, error) {
	if expectedManifestSHA != "" {
		actual, err := backup.SHA256File(manifestPath)
		if err != nil {
			return backup.Manifest{}, err
		}
		if actual != expectedManifestSHA {
			return backup.Manifest{}, fmt.Errorf("off-host manifest SHA-256 mismatch: expected %s, received %s", expectedManifestSHA, actual)
		}
	}
	payload, err := backup.VerifyPair(backupPath, manifestPath, environment, "")
	if err != nil {
		return backup.Manifest{}, err
	}
	actualBackupSHA, err := backup.SHA256File(backupPath)
	if err != nil {
		return backup.Manifest{}, err
	}
	if expectedBackupSHA != "" && actualBackupSHA != expectedBackupSHA {
		return backup.Manifest{}, fmt.Errorf("off-host backup SHA-256 mismatch: expected %s, received %s", expectedBackupSHA, actualBackupSHA)
	}
	return payload, nil
}

func fetchAndVerifyRemote(config Config, backupName, expectedBackupSHA, expectedManifestSHA string) (backup.Manifest, error) {
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

func ReceiptPathFor(backupPath string) string {
	return backupPath + ReceiptSuffix
}

func randomToken() (string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

func BuildReceipt(config Config, localBackup, localManifest string, payload backup.Manifest, remoteDir string) (Receipt, error) {
	manifestSHA, err := backup.SHA256File(localManifest)
	if err != nil {
		return Receipt{}, err
	}
	return Receipt{
		FormatVersion: ReceiptFormatVersion,
		Status:        "verified",
		ReplicatedAt:  time.Now().UTC().Format(time.RFC3339Nano),
		Environment:   config.Environment,
		Transport:     "ssh",
		Source: ReceiptSource{
			BackupFile:     filepath.Base(localBackup),
			BackupSHA256:   payload.Backup.SHA256,
			BackupSize:     payload.Backup.SizeBytes,
			ManifestFile:   filepath.Base(localManifest),
			ManifestSHA256: manifestSHA,
		},
		Remote: ReceiptRemote{
			Host:      config.Host,
			User:      config.User,
			Port:      config.Port,
			Directory: remoteDir,
		},
		Verification: ReceiptVerification{
			Method:          "round-trip-download-plus-bite-33.2-full-verification",
			IntegrityCheck:  "ok",
			ForeignKeyCheck: []string{},
		},
	}, nil
}

func Replicate(environment, envFile, backupPath, manifestPath string) error {
	absoluteEnv, err := filepath.Abs(envFile)
	if err != nil {
		return err
	}
	config, err := LoadConfig(environment, absoluteEnv, true)
	if err != nil {
		return err
	}
	if !config.Enabled {
		return fmt.Errorf("off-host backup is disabled for %s; set SERVER_OFFHOST_BACKUP_ENABLED=true to replicate explicitly", config.Environment)
	}
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
	remotePayload, err := fetchAndVerifyRemote(config, backupName, localBackupSHA, localManifestSHA)
	if err != nil {
		if created {
			_, _ = runSSH(config, "rm -rf -- "+shellQuote(remoteDir), nil, nil, false)
		}
		return err
	}
	receipt, err := BuildReceipt(config, absoluteBackup, absoluteManifest, remotePayload, remoteDir)
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

func VerifyReplica(environment, envFile, receiptPath string) error {
	absoluteEnv, err := filepath.Abs(envFile)
	if err != nil {
		return err
	}
	config, err := LoadConfig(environment, absoluteEnv, true)
	if err != nil {
		return err
	}
	if !config.Enabled {
		return fmt.Errorf("off-host backup is disabled for %s", config.Environment)
	}
	absoluteReceipt, err := filepath.Abs(receiptPath)
	if err != nil {
		return err
	}
	file, err := os.Open(absoluteReceipt)
	if err != nil {
		if os.IsNotExist(err) {
			return fmt.Errorf("off-host receipt does not exist: %s", absoluteReceipt)
		}
		return fmt.Errorf("cannot read off-host receipt %s: %w", absoluteReceipt, err)
	}
	var receipt Receipt
	decodeErr := json.NewDecoder(file).Decode(&receipt)
	file.Close()
	if decodeErr != nil {
		return fmt.Errorf("cannot read off-host receipt %s: %w", absoluteReceipt, decodeErr)
	}
	if receipt.FormatVersion != ReceiptFormatVersion || receipt.Status != "verified" {
		return errors.New("off-host receipt format/status is invalid")
	}
	receiptEnvironment, err := normalizeEnvironment(receipt.Environment)
	if err != nil {
		return err
	}
	if receiptEnvironment != config.Environment {
		return errors.New("off-host receipt environment does not match the selected environment")
	}
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
	payload, err := fetchAndVerifyRemote(config, backupName, receipt.Source.BackupSHA256, receipt.Source.ManifestSHA256)
	if err != nil {
		return err
	}
	fmt.Printf("Off-host replica verification passed: %s\n", backupName)
	fmt.Printf("Remote: ssh://%s@%s:%d%s\n", config.User, config.Host, config.Port, remoteDir)
	fmt.Printf("SHA-256: %s\n", payload.Backup.SHA256)
	return nil
}
