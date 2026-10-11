package offhost

import (
	"bufio"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"enterpriseremotesystems/backend/internal/backup"
)

type s3Credentials struct {
	AccessKey    string
	SecretKey    string
	SessionToken string
}

type s3Client struct {
	config      Config
	credentials s3Credentials
	httpClient  *http.Client
}

func loadS3Credentials(path, profile string) (s3Credentials, error) {
	file, err := os.Open(path)
	if err != nil {
		return s3Credentials{}, fmt.Errorf("cannot read S3 credentials file %s: %w", path, err)
	}
	defer file.Close()
	wanted := profile
	current := ""
	values := map[string]string{}
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") || strings.HasPrefix(line, ";") {
			continue
		}
		if strings.HasPrefix(line, "[") && strings.HasSuffix(line, "]") {
			current = strings.TrimSpace(strings.TrimSuffix(strings.TrimPrefix(line, "["), "]"))
			current = strings.TrimPrefix(current, "profile ")
			continue
		}
		if current != wanted || !strings.Contains(line, "=") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		values[strings.TrimSpace(parts[0])] = strings.TrimSpace(parts[1])
	}
	if err := scanner.Err(); err != nil {
		return s3Credentials{}, fmt.Errorf("cannot read S3 credentials file %s: %w", path, err)
	}
	creds := s3Credentials{AccessKey: values["aws_access_key_id"], SecretKey: values["aws_secret_access_key"], SessionToken: values["aws_session_token"]}
	if creds.AccessKey == "" || creds.SecretKey == "" {
		return s3Credentials{}, fmt.Errorf("S3 credentials profile %q in %s must define aws_access_key_id and aws_secret_access_key", profile, path)
	}
	return creds, nil
}

func newS3Client(config Config) (*s3Client, error) {
	creds, err := loadS3Credentials(config.AWSCredentialsFile, config.AWSProfile)
	if err != nil {
		return nil, err
	}
	return &s3Client{config: config, credentials: creds, httpClient: &http.Client{Timeout: 5 * time.Minute}}, nil
}

func hmacSHA256(key []byte, value string) []byte {
	mac := hmac.New(sha256.New, key)
	_, _ = mac.Write([]byte(value))
	return mac.Sum(nil)
}

func sha256HexBytes(value []byte) string {
	sum := sha256.Sum256(value)
	return hex.EncodeToString(sum[:])
}

func s3EscapePath(value string) string {
	parts := strings.Split(value, "/")
	for i, part := range parts {
		parts[i] = url.PathEscape(part)
	}
	return strings.Join(parts, "/")
}

func (c *s3Client) objectURL(key, versionID string) (*url.URL, error) {
	endpoint, err := url.Parse(c.config.S3Endpoint)
	if err != nil {
		return nil, err
	}
	basePath := strings.TrimRight(endpoint.Path, "/")
	if strings.HasSuffix(strings.ToLower(endpoint.Hostname()), ".your-objectstorage.com") {
		host := c.config.S3Bucket + "." + endpoint.Hostname()
		if port := endpoint.Port(); port != "" {
			host += ":" + port
		}
		endpoint.Host = host
		endpoint.Path = basePath + "/" + s3EscapePath(key)
	} else {
		// Non-Production regression endpoints may use path-style addressing so a
		// loopback test server does not require wildcard DNS. Hetzner Production
		// uses the documented virtual-host form: <bucket>.<region>.your-objectstorage.com.
		endpoint.Path = basePath + "/" + s3EscapePath(c.config.S3Bucket) + "/" + s3EscapePath(key)
	}
	endpoint.RawPath = ""
	endpoint.RawQuery = ""
	if versionID != "" {
		query := url.Values{}
		query.Set("versionId", versionID)
		endpoint.RawQuery = query.Encode()
	}
	return endpoint, nil
}

func (c *s3Client) sign(req *http.Request, payloadSHA string, now time.Time) {
	amzDate := now.UTC().Format("20060102T150405Z")
	dateStamp := now.UTC().Format("20060102")
	req.Header.Set("x-amz-date", amzDate)
	req.Header.Set("x-amz-content-sha256", payloadSHA)
	if c.credentials.SessionToken != "" {
		req.Header.Set("x-amz-security-token", c.credentials.SessionToken)
	}

	canonical := map[string]string{
		"host":                 req.URL.Host,
		"x-amz-content-sha256": payloadSHA,
		"x-amz-date":           amzDate,
	}
	if c.credentials.SessionToken != "" {
		canonical["x-amz-security-token"] = c.credentials.SessionToken
	}
	names := make([]string, 0, len(canonical))
	for name := range canonical {
		names = append(names, name)
	}
	sort.Strings(names)
	var headerBuilder strings.Builder
	for _, name := range names {
		fmt.Fprintf(&headerBuilder, "%s:%s\n", name, strings.TrimSpace(canonical[name]))
	}
	signedHeaders := strings.Join(names, ";")
	canonicalRequest := strings.Join([]string{req.Method, req.URL.EscapedPath(), req.URL.RawQuery, headerBuilder.String(), signedHeaders, payloadSHA}, "\n")
	credentialScope := dateStamp + "/" + c.config.S3Region + "/s3/aws4_request"
	stringToSign := "AWS4-HMAC-SHA256\n" + amzDate + "\n" + credentialScope + "\n" + sha256HexBytes([]byte(canonicalRequest))
	kDate := hmacSHA256([]byte("AWS4"+c.credentials.SecretKey), dateStamp)
	kRegion := hmacSHA256(kDate, c.config.S3Region)
	kService := hmacSHA256(kRegion, "s3")
	kSigning := hmacSHA256(kService, "aws4_request")
	signature := hex.EncodeToString(hmacSHA256(kSigning, stringToSign))
	req.Header.Set("Authorization", "AWS4-HMAC-SHA256 Credential="+c.credentials.AccessKey+"/"+credentialScope+", SignedHeaders="+signedHeaders+", Signature="+signature)
}

func responseError(resp *http.Response, operation string) error {
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 8192))
	detail := strings.TrimSpace(string(body))
	if detail == "" {
		detail = resp.Status
	}
	return fmt.Errorf("S3 %s failed with HTTP %d: %s", operation, resp.StatusCode, detail)
}

func (c *s3Client) putFile(localPath, key, payloadSHA string) (string, error) {
	file, err := os.Open(localPath)
	if err != nil {
		return "", err
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		return "", err
	}
	target, err := c.objectURL(key, "")
	if err != nil {
		return "", err
	}
	req, err := http.NewRequest(http.MethodPut, target.String(), file)
	if err != nil {
		return "", err
	}
	req.ContentLength = info.Size()
	req.Header.Set("Content-Type", "application/octet-stream")
	c.sign(req, payloadSHA, time.Now())
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("S3 PUT %s failed: %w", key, err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", responseError(resp, "PUT "+key)
	}
	_, _ = io.Copy(io.Discard, resp.Body)
	resp.Body.Close()
	versionID := strings.TrimSpace(resp.Header.Get("x-amz-version-id"))
	if versionID == "" || versionID == "null" {
		return "", fmt.Errorf("S3 PUT %s did not return a non-null x-amz-version-id; bucket Versioning/Object Lock contract is not satisfied", key)
	}
	return versionID, nil
}

func (c *s3Client) getFile(key, versionID, localPath string) error {
	if versionID == "" || versionID == "null" {
		return errors.New("S3 exact-version retrieval requires a non-null VersionId")
	}
	target, err := c.objectURL(key, versionID)
	if err != nil {
		return err
	}
	emptyHash := sha256HexBytes(nil)
	req, err := http.NewRequest(http.MethodGet, target.String(), nil)
	if err != nil {
		return err
	}
	c.sign(req, emptyHash, time.Now())
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("S3 GET %s version %s failed: %w", key, versionID, err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return responseError(resp, "GET "+key+" version "+versionID)
	}
	defer resp.Body.Close()
	if returned := strings.TrimSpace(resp.Header.Get("x-amz-version-id")); returned != "" && returned != versionID {
		return fmt.Errorf("S3 GET %s returned VersionId %s, expected %s", key, returned, versionID)
	}
	if err := os.MkdirAll(filepath.Dir(localPath), 0o755); err != nil {
		return err
	}
	out, err := os.Create(localPath)
	if err != nil {
		return err
	}
	_, copyErr := io.Copy(out, resp.Body)
	closeErr := out.Close()
	if copyErr != nil {
		return copyErr
	}
	return closeErr
}

func (c *s3Client) getLatestFile(key, localPath string) (string, error) {
	target, err := c.objectURL(key, "")
	if err != nil {
		return "", err
	}
	emptyHash := sha256HexBytes(nil)
	req, err := http.NewRequest(http.MethodGet, target.String(), nil)
	if err != nil {
		return "", err
	}
	c.sign(req, emptyHash, time.Now())
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("S3 GET latest %s failed: %w", key, err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", responseError(resp, "GET latest "+key)
	}
	defer resp.Body.Close()
	versionID := strings.TrimSpace(resp.Header.Get("x-amz-version-id"))
	if versionID == "" || versionID == "null" {
		return "", fmt.Errorf("S3 GET latest %s did not return a non-null x-amz-version-id", key)
	}
	if err := os.MkdirAll(filepath.Dir(localPath), 0o755); err != nil {
		return "", err
	}
	out, err := os.Create(localPath)
	if err != nil {
		return "", err
	}
	_, copyErr := io.Copy(out, resp.Body)
	closeErr := out.Close()
	if copyErr != nil {
		return "", copyErr
	}
	if closeErr != nil {
		return "", closeErr
	}
	return versionID, nil
}

func s3Keys(config Config, backupName string) (string, string, string, error) {
	if filepath.Base(backupName) != backupName || !strings.HasPrefix(backupName, "app-") || !strings.HasSuffix(backupName, ".db") {
		return "", "", "", fmt.Errorf("invalid managed backup filename for off-host storage: %q", backupName)
	}
	root := strings.Trim(config.S3Prefix, "/")
	if root != "" {
		root += "/"
	}
	root += config.Environment + "/" + backupName + "/"
	return root + backupName, root + backupName + backup.ManifestSuffix, root + backupName + ReceiptSuffix, nil
}

func fetchAndVerifyS3(config Config, client *s3Client, receipt Receipt) (backup.Manifest, error) {
	if receipt.Remote.Backup == nil || receipt.Remote.Manifest == nil {
		return backup.Manifest{}, errors.New("S3 off-host receipt is missing exact database/manifest object references")
	}
	if receipt.Remote.Backup.VersionID == "" || receipt.Remote.Manifest.VersionID == "" {
		return backup.Manifest{}, errors.New("S3 off-host receipt is missing exact database/manifest VersionIds")
	}
	if receipt.Remote.Backup.SHA256 != receipt.Source.BackupSHA256 || receipt.Remote.Manifest.SHA256 != receipt.Source.ManifestSHA256 {
		return backup.Manifest{}, errors.New("S3 off-host receipt remote SHA-256 evidence does not match source evidence")
	}
	tempDir, err := os.MkdirTemp("", "ers-s3-offhost-verify-")
	if err != nil {
		return backup.Manifest{}, err
	}
	defer os.RemoveAll(tempDir)
	localBackup := filepath.Join(tempDir, receipt.Source.BackupFile)
	localManifest := filepath.Join(tempDir, receipt.Source.ManifestFile)
	if err := client.getFile(receipt.Remote.Backup.Key, receipt.Remote.Backup.VersionID, localBackup); err != nil {
		return backup.Manifest{}, err
	}
	if err := client.getFile(receipt.Remote.Manifest.Key, receipt.Remote.Manifest.VersionID, localManifest); err != nil {
		return backup.Manifest{}, err
	}
	return verifyDownloadedPair(localBackup, localManifest, config.Environment, receipt.Source.BackupSHA256, receipt.Source.ManifestSHA256)
}

func replicateS3(config Config, backupPath, manifestPath string) error {
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
	localManifestSHA, err := backup.SHA256File(absoluteManifest)
	if err != nil {
		return err
	}
	localReceipt := ReceiptPathFor(absoluteBackup)
	client, err := newS3Client(config)
	if err != nil {
		return err
	}

	if _, err := os.Stat(localReceipt); err == nil {
		existing, loadErr := loadReceipt(localReceipt)
		if loadErr != nil {
			return loadErr
		}
		if existing.Transport != TransportS3 || existing.Source.BackupSHA256 != payload.Backup.SHA256 || existing.Source.ManifestSHA256 != localManifestSHA {
			return errors.New("existing off-host receipt does not describe this S3 backup pair; refusing to create replacement object versions")
		}
		if err := verifyReplicaS3(config, existing); err != nil {
			return err
		}
		fmt.Printf("Off-host backup verification passed using existing exact S3 versions: %s\n", filepath.Base(absoluteBackup))
		return nil
	} else if !os.IsNotExist(err) {
		return err
	}

	backupName := filepath.Base(absoluteBackup)
	dbKey, manifestKey, receiptKey, err := s3Keys(config, backupName)
	if err != nil {
		return err
	}
	dbVersion, err := client.putFile(absoluteBackup, dbKey, payload.Backup.SHA256)
	if err != nil {
		return err
	}
	manifestVersion, err := client.putFile(absoluteManifest, manifestKey, localManifestSHA)
	if err != nil {
		return err
	}

	receipt := Receipt{FormatVersion: ReceiptFormatVersion, Status: "verified", ReplicatedAt: time.Now().UTC().Format(time.RFC3339Nano), Environment: config.Environment, Transport: TransportS3,
		Source: ReceiptSource{BackupFile: backupName, BackupSHA256: payload.Backup.SHA256, BackupSize: payload.Backup.SizeBytes, ManifestFile: filepath.Base(absoluteManifest), ManifestSHA256: localManifestSHA},
		Remote: ReceiptRemote{Endpoint: config.S3Endpoint, Region: config.S3Region, Bucket: config.S3Bucket, Prefix: config.S3Prefix,
			Backup: &S3ObjectRef{Key: dbKey, VersionID: dbVersion, SHA256: payload.Backup.SHA256}, Manifest: &S3ObjectRef{Key: manifestKey, VersionID: manifestVersion, SHA256: localManifestSHA}, ReceiptKey: receiptKey},
		Verification: ReceiptVerification{Method: "exact-version-round-trip-download-plus-bite-33.2-full-verification", IntegrityCheck: "ok", ForeignKeyCheck: []string{}},
	}
	if _, err := fetchAndVerifyS3(config, client, receipt); err != nil {
		return err
	}

	tempDir, err := os.MkdirTemp("", "ers-s3-offhost-receipt-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(tempDir)
	tempReceipt := filepath.Join(tempDir, backupName+ReceiptSuffix)
	if err := backup.WriteJSONAtomic(tempReceipt, receipt); err != nil {
		return err
	}
	receiptSHA, err := backup.SHA256File(tempReceipt)
	if err != nil {
		return err
	}
	if _, err := client.putFile(tempReceipt, receiptKey, receiptSHA); err != nil {
		return err
	}
	if err := backup.WriteJSONAtomic(localReceipt, receipt); err != nil {
		return err
	}

	fmt.Printf("Off-host backup verification passed: %s\n", backupName)
	fmt.Printf("Remote: s3://%s/%s (endpoint %s)\n", config.S3Bucket, strings.Trim(config.S3Prefix, "/"), config.S3Endpoint)
	fmt.Printf("Backup VersionId: %s\n", dbVersion)
	fmt.Printf("Manifest VersionId: %s\n", manifestVersion)
	fmt.Printf("Backup SHA-256: %s\n", payload.Backup.SHA256)
	fmt.Printf("Manifest SHA-256: %s\n", localManifestSHA)
	fmt.Printf("Receipt: %s\n", localReceipt)
	return nil
}

func validateS3ReceiptConfig(config Config, receipt Receipt) error {
	if strings.TrimRight(receipt.Remote.Endpoint, "/") != config.S3Endpoint || receipt.Remote.Region != config.S3Region || receipt.Remote.Bucket != config.S3Bucket || strings.Trim(receipt.Remote.Prefix, "/") != strings.Trim(config.S3Prefix, "/") {
		return errors.New("off-host receipt S3 endpoint/region/bucket/prefix does not match current configuration")
	}
	expectedDBKey, expectedManifestKey, expectedReceiptKey, err := s3Keys(config, receipt.Source.BackupFile)
	if err != nil {
		return err
	}
	if receipt.Remote.Backup == nil || receipt.Remote.Manifest == nil {
		return errors.New("S3 off-host receipt is missing exact object references")
	}
	if receipt.Remote.Backup.Key != expectedDBKey || receipt.Remote.Manifest.Key != expectedManifestKey || receipt.Remote.ReceiptKey != expectedReceiptKey {
		return errors.New("off-host receipt S3 object keys do not match current configuration")
	}
	return nil
}

func verifyReplicaS3(config Config, receipt Receipt) error {
	if err := validateS3ReceiptConfig(config, receipt); err != nil {
		return err
	}
	client, err := newS3Client(config)
	if err != nil {
		return err
	}
	payload, err := fetchAndVerifyS3(config, client, receipt)
	if err != nil {
		return err
	}
	fmt.Printf("Off-host replica verification passed: %s\n", receipt.Source.BackupFile)
	fmt.Printf("Remote: s3://%s/%s\n", config.S3Bucket, strings.Trim(config.S3Prefix, "/"))
	fmt.Printf("VersionId: %s\n", receipt.Remote.Backup.VersionID)
	fmt.Printf("SHA-256: %s\n", payload.Backup.SHA256)
	return nil
}

func materializeReplicaS3(config Config, receipt Receipt, outputDirectory string) (MaterializedReplica, error) {
	if err := validateS3ReceiptConfig(config, receipt); err != nil {
		return MaterializedReplica{}, err
	}
	client, err := newS3Client(config)
	if err != nil {
		return MaterializedReplica{}, err
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
	tempDir, err := os.MkdirTemp(outputDirectory, ".ers-s3-recovery-")
	if err != nil {
		return MaterializedReplica{}, err
	}
	defer os.RemoveAll(tempDir)
	tempBackup := filepath.Join(tempDir, receipt.Source.BackupFile)
	tempManifest := filepath.Join(tempDir, receipt.Source.ManifestFile)
	if err := client.getFile(receipt.Remote.Backup.Key, receipt.Remote.Backup.VersionID, tempBackup); err != nil {
		return MaterializedReplica{}, err
	}
	if err := client.getFile(receipt.Remote.Manifest.Key, receipt.Remote.Manifest.VersionID, tempManifest); err != nil {
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

func materializeS3ReplicaByBackupName(config Config, backupName, outputDirectory string) (MaterializedReplica, error) {
	_, _, receiptKey, err := s3Keys(config, backupName)
	if err != nil {
		return MaterializedReplica{}, err
	}
	client, err := newS3Client(config)
	if err != nil {
		return MaterializedReplica{}, err
	}
	tempDir, err := os.MkdirTemp(outputDirectory, ".ers-s3-receipt-bootstrap-")
	if err != nil {
		return MaterializedReplica{}, err
	}
	defer os.RemoveAll(tempDir)
	tempReceipt := filepath.Join(tempDir, backupName+ReceiptSuffix)
	receiptVersionID, err := client.getLatestFile(receiptKey, tempReceipt)
	if err != nil {
		return MaterializedReplica{}, err
	}
	receipt, err := loadReceipt(tempReceipt)
	if err != nil {
		return MaterializedReplica{}, err
	}
	receiptEnvironment, err := normalizeEnvironment(receipt.Environment)
	if err != nil {
		return MaterializedReplica{}, err
	}
	if receiptEnvironment != config.Environment || receipt.Transport != TransportS3 {
		return MaterializedReplica{}, errors.New("remote S3 receipt environment/transport does not match current configuration")
	}
	if receipt.Source.BackupFile != backupName {
		return MaterializedReplica{}, fmt.Errorf("remote S3 receipt describes backup %q, expected %q", receipt.Source.BackupFile, backupName)
	}
	materialized, err := materializeReplicaS3(config, receipt, outputDirectory)
	if err != nil {
		return MaterializedReplica{}, err
	}
	if err := copyFileAtomic(tempReceipt, materialized.ReceiptPath, 0o600); err != nil {
		_ = os.Remove(materialized.BackupPath)
		_ = os.Remove(materialized.ManifestPath)
		return MaterializedReplica{}, err
	}
	materialized.ReceiptVersionID = receiptVersionID
	return materialized, nil
}
