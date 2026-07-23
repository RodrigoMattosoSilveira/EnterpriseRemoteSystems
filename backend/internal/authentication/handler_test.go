package authentication

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"enterpriseremotesystems/backend/internal/authz"
	"github.com/gofiber/fiber/v3"
)

func TestAuthenticationHandlerIssuesReadsAndClearsSessionCookie(t *testing.T) {
	_, _, service, actor := authenticationTestService(t)
	account, err := service.CreateAccount(t.Context(), CreateAccountRequest{
		ActorID: actor.ID, Login: "cookie@example.com", TemporaryPassword: "Cookie-Password-1",
	})
	if err != nil {
		t.Fatalf("create account: %v", err)
	}

	handler := NewHandler(service, CookieConfig{Name: "ers_test_session", Secure: true, SameSite: "Lax", TTL: time.Hour}, nil, nil)
	app := fiber.New()
	app.Use(handler.SessionMiddleware())
	app.Post("/login", handler.Login)
	app.Get("/session", handler.RequireSession, handler.CurrentSession)
	app.Post("/logout", handler.Logout)

	body, _ := json.Marshal(LoginRequest{Login: account.Login, Password: "Cookie-Password-1"})
	loginRequest := httptest.NewRequest(http.MethodPost, "/login", bytes.NewReader(body))
	loginRequest.Header.Set("Content-Type", "application/json")
	loginResponse, err := app.Test(loginRequest)
	if err != nil {
		t.Fatalf("login request: %v", err)
	}
	if loginResponse.StatusCode != http.StatusOK {
		t.Fatalf("expected login status 200, got %d", loginResponse.StatusCode)
	}
	if loginResponse.Header.Get("Cache-Control") != "no-store" {
		t.Fatalf("expected login response to disable caching, got %q", loginResponse.Header.Get("Cache-Control"))
	}
	var loginPayload struct {
		Data SessionResponse `json:"data"`
	}
	if err := json.NewDecoder(loginResponse.Body).Decode(&loginPayload); err != nil {
		t.Fatalf("decode login response: %v", err)
	}
	if loginPayload.Data.Login != "cookie@example.com" {
		t.Fatalf("expected normalized login in data.login, got %q", loginPayload.Data.Login)
	}
	cookies := loginResponse.Cookies()
	if len(cookies) != 1 {
		t.Fatalf("expected one session cookie, got %d", len(cookies))
	}
	cookie := cookies[0]
	if cookie.Name != "ers_test_session" || cookie.Value == "" || !cookie.HttpOnly || !cookie.Secure || cookie.Path != "/" {
		t.Fatalf("unexpected session cookie: %#v", cookie)
	}
	if cookie.SameSite != http.SameSiteLaxMode {
		t.Fatalf("expected SameSite=Lax, got %v", cookie.SameSite)
	}

	sessionRequest := httptest.NewRequest(http.MethodGet, "/session", nil)
	sessionRequest.AddCookie(cookie)
	sessionResponse, err := app.Test(sessionRequest)
	if err != nil {
		t.Fatalf("session request: %v", err)
	}
	if sessionResponse.StatusCode != http.StatusOK {
		t.Fatalf("expected session status 200, got %d", sessionResponse.StatusCode)
	}
	if sessionResponse.Header.Get("Cache-Control") != "no-store" {
		t.Fatalf("expected session response to disable caching, got %q", sessionResponse.Header.Get("Cache-Control"))
	}

	logoutRequest := httptest.NewRequest(http.MethodPost, "/logout", nil)
	logoutRequest.AddCookie(cookie)
	logoutResponse, err := app.Test(logoutRequest)
	if err != nil {
		t.Fatalf("logout request: %v", err)
	}
	if logoutResponse.StatusCode != http.StatusNoContent {
		t.Fatalf("expected logout status 204, got %d", logoutResponse.StatusCode)
	}
	logoutCookies := logoutResponse.Cookies()
	if len(logoutCookies) != 1 {
		t.Fatalf("expected one cleared session cookie, got %d", len(logoutCookies))
	}
	clearedCookie := logoutCookies[0]
	if clearedCookie.Name != "ers_test_session" || clearedCookie.Value != "" || clearedCookie.MaxAge >= 0 {
		t.Fatalf("expected logout to clear session cookie, got %#v", clearedCookie)
	}

	revokedRequest := httptest.NewRequest(http.MethodGet, "/session", nil)
	revokedRequest.AddCookie(cookie)
	revokedResponse, err := app.Test(revokedRequest)
	if err != nil {
		t.Fatalf("revoked session request: %v", err)
	}
	if revokedResponse.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected revoked session status 401, got %d", revokedResponse.StatusCode)
	}
}

type fixedAuthenticationActorStore struct {
	actor *authz.Actor
}

func (s fixedAuthenticationActorStore) FindActor(context.Context, authz.ActorLookup) (*authz.Actor, error) {
	return s.actor, nil
}

type recordingAuthenticationAuditStore struct {
	entries []authz.AuthorizationAuditEntry
}

func (s *recordingAuthenticationAuditStore) RecordAuthorizationAudit(_ context.Context, entry authz.AuthorizationAuditEntry) error {
	s.entries = append(s.entries, entry)
	return nil
}

func TestAuthenticationHandlerAuditsAccountCreation(t *testing.T) {
	_, _, service, actor := authenticationTestService(t)
	auditStore := &recordingAuthenticationAuditStore{}
	actorStore := fixedAuthenticationActorStore{actor: &authz.Actor{
		ID: "application-admin", RecordID: "application-admin-record", TenantID: authz.GlobalTenantScope,
		Scope: authz.ActorScopeApplication, Permissions: map[authz.Permission]struct{}{authz.PermissionAuthzManage: {}},
	}}
	handler := NewHandler(service, CookieConfig{}, actorStore, auditStore)
	app := fiber.New()
	app.Post("/accounts", handler.CreateAccount)

	body, _ := json.Marshal(CreateAccountRequest{
		ActorID: actor.ID, Login: "audited@example.com", TemporaryPassword: "Audited-Password-1",
	})
	request := httptest.NewRequest(http.MethodPost, "/accounts", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set(authz.HeaderActorID, "application-admin")
	request.Header.Set(authz.HeaderTenantID, authz.GlobalTenantScope)
	response, err := app.Test(request)
	if err != nil {
		t.Fatalf("create account request: %v", err)
	}
	if response.StatusCode != http.StatusCreated {
		t.Fatalf("expected account creation status 201, got %d", response.StatusCode)
	}
	if len(auditStore.entries) != 1 {
		t.Fatalf("expected one account audit entry, got %d", len(auditStore.entries))
	}
	entry := auditStore.entries[0]
	if entry.Operation != "authentication.accounts.create" || entry.TargetType != "auth_user_account" || entry.Permission != authz.PermissionAuthzManage {
		t.Fatalf("unexpected account audit entry: %#v", entry)
	}
}

func TestAuthenticationHandlerPreventsSelfAccountDeactivation(t *testing.T) {
	_, _, service, actor := authenticationTestService(t)
	account, err := service.CreateAccount(t.Context(), CreateAccountRequest{
		ActorID: actor.ID, Login: "self-admin@example.com", TemporaryPassword: "Self-Admin-Password-1",
	})
	if err != nil {
		t.Fatalf("create self account: %v", err)
	}
	actorStore := fixedAuthenticationActorStore{actor: &authz.Actor{
		ID: "self-admin", RecordID: actor.ID, TenantID: authz.GlobalTenantScope,
		Scope: authz.ActorScopeApplication, Permissions: map[authz.Permission]struct{}{authz.PermissionAuthzManage: {}},
	}}
	handler := NewHandler(service, CookieConfig{}, actorStore, nil)
	app := fiber.New()
	app.Patch("/accounts/:id/active", handler.SetAccountActive)

	body, _ := json.Marshal(SetAccountActiveRequest{Active: boolPointer(false)})
	request := httptest.NewRequest(http.MethodPatch, "/accounts/"+account.ID+"/active", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set(authz.HeaderActorID, "self-admin")
	request.Header.Set(authz.HeaderTenantID, authz.GlobalTenantScope)
	response, err := app.Test(request)
	if err != nil {
		t.Fatalf("deactivate own account request: %v", err)
	}
	if response.StatusCode != http.StatusForbidden {
		t.Fatalf("expected self-deactivation status 403, got %d", response.StatusCode)
	}
	persisted, err := service.GetAccount(t.Context(), account.ID)
	if err != nil {
		t.Fatalf("read account after denied self-deactivation: %v", err)
	}
	if !persisted.Active {
		t.Fatal("self-deactivation must leave the account active")
	}
}

func boolPointer(value bool) *bool { return &value }
