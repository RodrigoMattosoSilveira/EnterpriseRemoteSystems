package authentication

// Bite 33.6.6A integration only. An explicit external Python runner creates a
// disposable restored database and the ordinary emergency issuance token.
// Without these variables this test is skipped, not falsely reported as evidence.

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	appdb "enterpriseremotesystems/backend/internal/db"
	"enterpriseremotesystems/backend/internal/shared/ids"
	"github.com/gofiber/fiber/v3"
	"golang.org/x/crypto/bcrypt"
)

func TestIsolatedEmergencyAdminRedeemAndLogin(t *testing.T) {
	dbPath := os.Getenv("ERS_EMERGENCY_REHEARSAL_DB")
	tokenPath := os.Getenv("ERS_EMERGENCY_REHEARSAL_TOKEN_FILE")
	login := os.Getenv("ERS_EMERGENCY_REHEARSAL_LOGIN")
	correlation := os.Getenv("ERS_EMERGENCY_REHEARSAL_REQUEST_ID")
	if dbPath == "" && tokenPath == "" && login == "" && correlation == "" {
		t.Skip("requires the separate protected isolated-rehearsal runner")
	}
	if dbPath == "" || tokenPath == "" || login == "" || correlation == "" {
		t.Fatal("all isolated rehearsal inputs are required")
	}
	realDB, err := filepath.EvalSymlinks(dbPath)
	if err != nil {
		t.Fatal("scratch DB cannot be resolved")
	}
	realDB, err = filepath.Abs(realDB)
	if err != nil {
		t.Fatal(err)
	}
	dir := filepath.Dir(realDB)
	if !strings.HasPrefix(filepath.Base(dir), "ers-admin-rehearsal-") || filepath.Base(realDB) != "scratch.db" {
		t.Fatal("refusing authentication integration outside named disposable scratch database")
	}
	st, err := os.Stat(realDB)
	if err != nil || !st.Mode().IsRegular() || st.Mode().Perm()&0077 != 0 {
		t.Fatal("scratch DB must be a regular private file")
	}
	if filepath.Dir(tokenPath) != filepath.Join(dir, "private") {
		t.Fatal("rehearsal token must reside under scratch workspace private directory")
	}
	tokenBytes, err := os.ReadFile(tokenPath)
	if err != nil {
		t.Fatal("cannot read isolated emergency token")
	}
	token := strings.TrimSpace(string(tokenBytes))
	if !strings.HasPrefix(token, "ers_pr_") {
		t.Fatal("not an emergency reset token")
	}
	database, err := appdb.Open(realDB)
	if err != nil {
		t.Fatal("open isolated SQLite copy", err)
	}
	sqlDB, err := database.DB()
	if err != nil {
		t.Fatal(err)
	}
	defer sqlDB.Close()
	repo := NewRepository(database)
	svc := NewService(repo, ServiceConfig{PasswordHashCost: bcrypt.MinCost})
	ctx := context.Background()
	account, err := repo.FindAccountByLogin(ctx, login)
	if err != nil || !account.Active || account.SecuritySuspended {
		t.Fatal("canonical account missing/ineligible")
	}

	// Seed a synthetic, known old session into the disposable copy, then prove
	// that the real password-reset operation revokes it.
	oldRaw := make([]byte, 32)
	if _, err := rand.Read(oldRaw); err != nil {
		t.Fatal(err)
	}
	oldToken := "ers_s_" + base64.RawURLEncoding.EncodeToString(oldRaw)
	now := time.Now().UTC()
	err = repo.CreateSession(ctx, Session{
		ID: ids.New(), AccountID: account.ID, TokenHash: hashToken(oldToken),
		ExpiresAt: now.Add(time.Hour), LastSeenAt: now, CreatedAt: now, UpdatedAt: now,
		UserAgent: "isolated-rehearsal", IPAddress: "127.0.0.1",
	})
	if err != nil {
		t.Fatal("seed synthetic prior session", err)
	}
	if _, err := svc.ResolveSession(ctx, oldToken); err != nil {
		t.Fatal("old session not valid before reset", err)
	}

	handler := NewHandler(svc, CookieConfig{Name: "ers_rehearsal_session", Secure: true}, nil, nil)
	app := fiber.New()
	app.Use(handler.SessionMiddleware())
	app.Post("/api/v1/auth/password/reset", handler.ResetPassword)
	app.Post("/api/v1/auth/login", handler.Login)
	app.Get("/api/v1/auth/session", handler.CurrentSession)
	request := func(method, path string, payload any, cookie *http.Cookie) *http.Response {
		t.Helper()
		var body bytes.Buffer
		if payload != nil {
			if err := json.NewEncoder(&body).Encode(payload); err != nil {
				t.Fatal(err)
			}
		}
		req := httptest.NewRequest(method, path, &body)
		req.Header.Set("Content-Type", "application/json")
		if cookie != nil {
			req.AddCookie(cookie)
		}
		resp, err := app.Test(req)
		if err != nil {
			t.Fatal("isolated authentication HTTP request failed", err)
		}
		return resp
	}
	// Random rehearsal-only password, never logged or written to an evidence file.
	rawPassword := make([]byte, 36)
	if _, err := rand.Read(rawPassword); err != nil {
		t.Fatal(err)
	}
	password := "Rehearsal-" + base64.RawURLEncoding.EncodeToString(rawPassword)
	response := request("POST", "/api/v1/auth/password/reset", map[string]string{
		"token": token, "newPassword": password,
	}, nil)
	response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("real reset handler expected 200; got %d", response.StatusCode)
	}
	if _, err := svc.ResolveSession(ctx, oldToken); err != ErrAuthenticationRequired {
		t.Fatalf("prior session must be revoked, got %v", err)
	}
	response = request("POST", "/api/v1/auth/password/reset", map[string]string{
		"token": token, "newPassword": password,
	}, nil)
	response.Body.Close()
	if response.StatusCode == http.StatusOK {
		t.Fatal("reset token replay accepted")
	}
	response = request("GET", "/api/v1/auth/session", nil, &http.Cookie{Name: "ers_rehearsal_session", Value: oldToken})
	response.Body.Close()
	if response.StatusCode != http.StatusUnauthorized {
		t.Fatalf("revoked old session response %d", response.StatusCode)
	}
	response = request("POST", "/api/v1/auth/login", map[string]string{
		"login": login, "password": password,
	}, nil)
	cookies := response.Cookies()
	response.Body.Close()
	if response.StatusCode != http.StatusOK || len(cookies) == 0 {
		t.Fatalf("new administrator login failed: %d", response.StatusCode)
	}
	response = request("GET", "/api/v1/auth/session", nil, cookies[0])
	response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("new session resolution failed: %d", response.StatusCode)
	}

	var count int64
	if err := database.Table("authz_audit_logs").Where("correlation_id = ? AND operation = ?", correlation,
		"production.emergency_admin_recovery.token_issue").Count(&count).Error; err != nil || count != 1 {
		t.Fatal("missing/duplicate immutable recovery audit event")
	}
	var integrity string
	if err := database.Raw("PRAGMA integrity_check").Scan(&integrity).Error; err != nil || integrity != "ok" {
		t.Fatal("post-reset SQLite integrity failed")
	}
	t.Log("ERS_REHEARSAL API_REDEMPTION_LOGIN_SESSION_AUDIT PASS (scratch only)")
}
