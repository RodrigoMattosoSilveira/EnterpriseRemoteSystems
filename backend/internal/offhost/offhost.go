package offhost

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"enterpriseremotesystems/backend/internal/backup"
)

const (
	ReceiptSuffix        = ".offhost.json"
	ReceiptFormatVersion = 1
	TransportSSH         = "ssh"
	TransportS3          = "s3"
)

type Config struct {
	Environment string
	Enabled     bool
	Transport   string

	Host           string
	User           string
	Directory      string
	Port           int
	IdentityFile   string
	KnownHostsFile string

	S3Endpoint         string
	S3Region           string
	S3Bucket           string
	S3Prefix           string
	AWSCredentialsFile string
	AWSProfile         string
}

func (c Config) SSHTarget() string { return c.User + "@" + c.Host }
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

type S3ObjectRef struct {
	Key       string `json:"key"`
	VersionID string `json:"version_id"`
	SHA256    string `json:"sha256"`
}

type ReceiptRemote struct {
	Host      string `json:"host,omitempty"`
	User      string `json:"user,omitempty"`
	Port      int    `json:"port,omitempty"`
	Directory string `json:"directory,omitempty"`

	Endpoint   string       `json:"endpoint,omitempty"`
	Region     string       `json:"region,omitempty"`
	Bucket     string       `json:"bucket,omitempty"`
	Prefix     string       `json:"prefix,omitempty"`
	Backup     *S3ObjectRef `json:"backup,omitempty"`
	Manifest   *S3ObjectRef `json:"manifest,omitempty"`
	ReceiptKey string       `json:"receipt_key,omitempty"`
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

	transport := strings.ToLower(strings.TrimSpace(values["SERVER_OFFHOST_BACKUP_TRANSPORT"]))
	if transport == "" && enabled && normalized != "production" {
		transport = TransportSSH
	}
	if normalized == "production" && transport != TransportS3 {
		return Config{}, errors.New("Production requires SERVER_OFFHOST_BACKUP_TRANSPORT=s3 for Hetzner Object Storage.")
	}
	if enabled && transport != TransportSSH && transport != TransportS3 {
		return Config{}, fmt.Errorf("SERVER_OFFHOST_BACKUP_TRANSPORT must be ssh or s3; got %q", transport)
	}

	config := Config{Environment: normalized, Enabled: enabled, Transport: transport}
	if !enabled {
		return config, nil
	}
	switch transport {
	case TransportSSH:
		return loadSSHConfig(config, values, requireRuntimeFiles)
	case TransportS3:
		return loadS3Config(config, values, requireRuntimeFiles)
	default:
		return Config{}, fmt.Errorf("unsupported off-host transport %q", transport)
	}
}

func loadSSHConfig(config Config, values map[string]string, requireRuntimeFiles bool) (Config, error) {
	host := strings.TrimSpace(values["SERVER_OFFHOST_BACKUP_HOST"])
	user := strings.TrimSpace(values["SERVER_OFFHOST_BACKUP_USER"])
	directory := strings.TrimSpace(values["SERVER_OFFHOST_BACKUP_DIRECTORY"])
	portRaw := strings.TrimSpace(values["SERVER_OFFHOST_BACKUP_PORT"])
	if portRaw == "" {
		portRaw = "22"
	}
	identity := strings.TrimSpace(values["SERVER_OFFHOST_BACKUP_IDENTITY_FILE"])
	knownHosts := strings.TrimSpace(values["SERVER_OFFHOST_BACKUP_KNOWN_HOSTS_FILE"])
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
	if identity == "" || !filepath.IsAbs(identity) {
		return Config{}, errors.New("SERVER_OFFHOST_BACKUP_IDENTITY_FILE must be an absolute path")
	}
	if knownHosts == "" || !filepath.IsAbs(knownHosts) {
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
	config.Host, config.User, config.Directory, config.Port = host, user, strings.TrimRight(directory, "/"), port
	config.IdentityFile, config.KnownHostsFile = identity, knownHosts
	return config, nil
}

func loadS3Config(config Config, values map[string]string, requireRuntimeFiles bool) (Config, error) {
	endpoint := strings.TrimSpace(values["SERVER_OFFHOST_BACKUP_S3_ENDPOINT"])
	region := strings.ToLower(strings.TrimSpace(values["SERVER_OFFHOST_BACKUP_S3_REGION"]))
	bucketName := strings.TrimSpace(values["SERVER_OFFHOST_BACKUP_S3_BUCKET"])
	prefix := strings.Trim(strings.TrimSpace(values["SERVER_OFFHOST_BACKUP_S3_PREFIX"]), "/")
	credentialsFile := strings.TrimSpace(values["AWS_SHARED_CREDENTIALS_FILE"])
	profile := strings.TrimSpace(values["AWS_PROFILE"])
	if prefix == "" {
		prefix = "ers-backups"
	}
	if endpoint == "" {
		return Config{}, errors.New("SERVER_OFFHOST_BACKUP_S3_ENDPOINT is required when S3 off-host backup is enabled")
	}
	parsed, err := url.Parse(endpoint)
	if err != nil || parsed.Host == "" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		return Config{}, errors.New("SERVER_OFFHOST_BACKUP_S3_ENDPOINT must be an absolute S3 endpoint URL without credentials, query, or fragment")
	}
	if parsed.Scheme != "https" && !(config.Environment != "production" && parsed.Scheme == "http") {
		return Config{}, errors.New("SERVER_OFFHOST_BACKUP_S3_ENDPOINT must use HTTPS in Production")
	}
	if region == "" {
		return Config{}, errors.New("SERVER_OFFHOST_BACKUP_S3_REGION is required when S3 off-host backup is enabled")
	}
	if bucketName == "" || strings.ContainsAny(bucketName, " /\t\r\n") {
		return Config{}, errors.New("SERVER_OFFHOST_BACKUP_S3_BUCKET must be a non-empty bucket name without whitespace or slashes")
	}
	if strings.ContainsAny(prefix, "\r\n") || strings.Contains(prefix, "//") {
		return Config{}, errors.New("SERVER_OFFHOST_BACKUP_S3_PREFIX must be a normalized object prefix")
	}
	if credentialsFile == "" || !filepath.IsAbs(credentialsFile) {
		return Config{}, errors.New("AWS_SHARED_CREDENTIALS_FILE must be an absolute path for S3 off-host backup")
	}
	if profile == "" {
		return Config{}, errors.New("AWS_PROFILE is required for S3 off-host backup")
	}
	if config.Environment == "production" {
		allowed := map[string]bool{"fsn1": true, "nbg1": true, "hel1": true}
		if !allowed[region] {
			return Config{}, errors.New("Production SERVER_OFFHOST_BACKUP_S3_REGION must be fsn1, nbg1, or hel1")
		}
		expected := "https://" + region + ".your-objectstorage.com"
		if strings.TrimRight(endpoint, "/") != expected {
			return Config{}, fmt.Errorf("Production SERVER_OFFHOST_BACKUP_S3_ENDPOINT must be %s for region %s", expected, region)
		}
	}
	if requireRuntimeFiles {
		if info, err := os.Stat(credentialsFile); err != nil || !info.Mode().IsRegular() {
			return Config{}, fmt.Errorf("S3 credentials file does not exist: %s", credentialsFile)
		}
		if _, err := loadS3Credentials(credentialsFile, profile); err != nil {
			return Config{}, err
		}
	}
	config.S3Endpoint = strings.TrimRight(endpoint, "/")
	config.S3Region, config.S3Bucket, config.S3Prefix = region, bucketName, prefix
	config.AWSCredentialsFile, config.AWSProfile = credentialsFile, profile
	return config, nil
}

func ReceiptPathFor(backupPath string) string { return backupPath + ReceiptSuffix }

func loadReceipt(path string) (Receipt, error) {
	file, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			return Receipt{}, fmt.Errorf("off-host receipt does not exist: %s", path)
		}
		return Receipt{}, fmt.Errorf("cannot read off-host receipt %s: %w", path, err)
	}
	defer file.Close()
	var receipt Receipt
	if err := json.NewDecoder(file).Decode(&receipt); err != nil {
		return Receipt{}, fmt.Errorf("cannot read off-host receipt %s: %w", path, err)
	}
	if receipt.FormatVersion != ReceiptFormatVersion || receipt.Status != "verified" {
		return Receipt{}, errors.New("off-host receipt format/status is invalid")
	}
	return receipt, nil
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
	switch config.Transport {
	case TransportSSH:
		return replicateSSH(config, backupPath, manifestPath)
	case TransportS3:
		return replicateS3(config, backupPath, manifestPath)
	default:
		return fmt.Errorf("unsupported off-host transport %q", config.Transport)
	}
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
	receipt, err := loadReceipt(absoluteReceipt)
	if err != nil {
		return err
	}
	receiptEnvironment, err := normalizeEnvironment(receipt.Environment)
	if err != nil {
		return err
	}
	if receiptEnvironment != config.Environment {
		return errors.New("off-host receipt environment does not match the selected environment")
	}
	if receipt.Transport != config.Transport {
		return fmt.Errorf("off-host receipt transport %s does not match configured transport %s", receipt.Transport, config.Transport)
	}
	switch config.Transport {
	case TransportSSH:
		return verifyReplicaSSH(config, receipt)
	case TransportS3:
		return verifyReplicaS3(config, receipt)
	default:
		return fmt.Errorf("unsupported off-host transport %q", config.Transport)
	}
}
