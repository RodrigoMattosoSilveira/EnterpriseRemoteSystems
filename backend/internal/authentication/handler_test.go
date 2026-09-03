package authentication

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"enterpriseremotesystems/backend/internal/authz"
	appdb "enterpriseremotesystems/backend/internal/db"
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
	app.Get("/session", handler.CurrentSession)
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
	loginBytes, err := io.ReadAll(loginResponse.Body)
	if err != nil {
		t.Fatalf("read login response: %v", err)
	}
	if err := json.Unmarshal(loginBytes, &loginPayload); err != nil {
		t.Fatalf("decode login response: %v", err)
	}
	if loginPayload.Data.Login != "cookie@example.com" {
		t.Fatalf("expected normalized login in data.login, got %q", loginPayload.Data.Login)
	}
	var loginEnvelope map[string]any
	if err := json.Unmarshal(loginBytes, &loginEnvelope); err != nil {
		t.Fatalf("decode raw login response: %v", err)
	}
	loginData, ok := loginEnvelope["data"].(map[string]any)
	if !ok {
		t.Fatalf("expected login data object, got %#v", loginEnvelope["data"])
	}
	for _, legacyField := range []string{"actorId", "actorKey", "personId", "collaboratorId"} {
		if _, exists := loginData[legacyField]; exists {
			t.Fatalf("Bite 30E session contract must be Account-authenticated; unexpected %s in %#v", legacyField, loginData)
		}
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
	if revokedResponse.Header.Get("Cache-Control") != "no-store" {
		t.Fatalf("expected rejected session response to disable caching, got %q", revokedResponse.Header.Get("Cache-Control"))
	}
	revokedCookies := revokedResponse.Cookies()
	if len(revokedCookies) != 1 || revokedCookies[0].Name != "ers_test_session" || revokedCookies[0].MaxAge >= 0 {
		t.Fatalf("expected rejected session request to clear the stale cookie, got %#v", revokedCookies)
	}
}

func TestAuthenticationHandlerMissingSessionProbeReturnsNoContentWithoutClearingCookies(t *testing.T) {
	_, _, service, _ := authenticationTestService(t)
	handler := NewHandler(service, CookieConfig{Name: "ers_test_session", TTL: time.Hour}, nil, nil)
	app := fiber.New()
	app.Use(handler.SessionMiddleware())
	app.Get("/session", handler.CurrentSession)

	request := httptest.NewRequest(http.MethodGet, "/session", nil)
	response, err := app.Test(request)
	if err != nil {
		t.Fatalf("missing session request: %v", err)
	}
	if response.StatusCode != http.StatusNoContent {
		t.Fatalf("expected cookie-less session probe status 204, got %d", response.StatusCode)
	}
	if response.Header.Get("Cache-Control") != "no-store" {
		t.Fatalf("expected missing session response to disable caching, got %q", response.Header.Get("Cache-Control"))
	}
	if cookies := response.Cookies(); len(cookies) != 0 {
		t.Fatalf("expected a cookie-less session probe not to emit a clearing cookie, got %#v", cookies)
	}
}

func TestAuthenticationHandlerInactiveAccountLoginReturnsPreciseCodeForVerifiedCredentials(t *testing.T) {
	_, _, service, actor := authenticationTestService(t)
	account, err := service.CreateAccount(t.Context(), CreateAccountRequest{
		ActorID: actor.ID, Login: "inactive-login@example.com", TemporaryPassword: "Inactive-Login-Password-1",
	})
	if err != nil {
		t.Fatalf("create account: %v", err)
	}
	if _, err := service.SetAccountActive(t.Context(), account.ID, false); err != nil {
		t.Fatalf("deactivate account: %v", err)
	}

	handler := NewHandler(service, CookieConfig{Name: "ers_test_session"}, nil, nil)
	app := fiber.New()
	app.Post("/login", handler.Login)

	requestLogin := func(password string) (int, string) {
		body, _ := json.Marshal(LoginRequest{Login: account.Login, Password: password})
		request := httptest.NewRequest(http.MethodPost, "/login", bytes.NewReader(body))
		request.Header.Set("Content-Type", "application/json")
		response, err := app.Test(request)
		if err != nil {
			t.Fatalf("login request: %v", err)
		}
		defer response.Body.Close()
		var payload struct {
			Error struct {
				Code string `json:"code"`
			} `json:"error"`
		}
		if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
			t.Fatalf("decode login response: %v", err)
		}
		return response.StatusCode, payload.Error.Code
	}

	if status, code := requestLogin("Wrong-Password-1"); status != http.StatusUnauthorized || code != "invalid_credentials" {
		t.Fatalf("expected wrong password to remain invalid_credentials/401, got %s/%d", code, status)
	}
	if status, code := requestLogin("Inactive-Login-Password-1"); status != http.StatusUnauthorized || code != "account_inactive" {
		t.Fatalf("expected verified inactive account to return account_inactive/401, got %s/%d", code, status)
	}
}

func TestAuthenticationHandlerResetReturnsVerifiedAccountIdentity(t *testing.T) {
	_, _, service, actor := authenticationTestService(t)
	account, err := service.CreateAccount(t.Context(), CreateAccountRequest{
		ActorID: actor.ID, Login: "reset-target@example.com", TemporaryPassword: "Original-Password-1",
	})
	if err != nil {
		t.Fatalf("create account: %v", err)
	}
	resetToken, err := service.IssuePasswordResetToken(t.Context(), account.ID)
	if err != nil {
		t.Fatalf("issue reset token: %v", err)
	}

	handler := NewHandler(service, CookieConfig{Name: "ers_test_session"}, nil, nil)
	app := fiber.New()
	app.Post("/password/reset", handler.ResetPassword)

	body, _ := json.Marshal(ResetPasswordRequest{
		Token: resetToken.Token, NewPassword: "%3oU1^Z!Gf6WEj8u",
	})
	request := httptest.NewRequest(http.MethodPost, "/password/reset", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	response, err := app.Test(request)
	if err != nil {
		t.Fatalf("reset password request: %v", err)
	}
	if response.StatusCode != http.StatusOK {
		t.Fatalf("expected reset status 200, got %d", response.StatusCode)
	}
	if response.Header.Get("Cache-Control") != "no-store" {
		t.Fatalf("expected reset response to disable caching, got %q", response.Header.Get("Cache-Control"))
	}
	var payload struct {
		Data PasswordResetResult `json:"data"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode reset response: %v", err)
	}
	if payload.Data.AccountID != account.ID || payload.Data.Login != account.Login || payload.Data.PasswordChangedAt.IsZero() {
		t.Fatalf("unexpected reset response: %#v", payload.Data)
	}
	if _, err := service.Login(t.Context(), LoginRequest{
		Login: account.Login, Password: "%3oU1^Z!Gf6WEj8u",
	}, "", ""); err != nil {
		t.Fatalf("login with reset password: %v", err)
	}
}

func TestAuthenticationHandlerInactiveResetTargetDoesNotClearCallerCookie(t *testing.T) {
	_, _, service, actor := authenticationTestService(t)
	account, err := service.CreateAccount(t.Context(), CreateAccountRequest{
		ActorID: actor.ID, Login: "inactive-reset-handler@example.com", TemporaryPassword: "Inactive-Reset-Handler-1",
	})
	if err != nil {
		t.Fatalf("create account: %v", err)
	}
	if _, err := service.SetAccountActive(t.Context(), account.ID, false); err != nil {
		t.Fatalf("deactivate account: %v", err)
	}

	handler := NewHandler(service, CookieConfig{Name: "ers_test_session"}, nil, nil)
	app := fiber.New()
	app.Post("/accounts/:id/password-reset-tokens", handler.IssuePasswordResetToken)

	request := httptest.NewRequest(http.MethodPost, "/accounts/"+account.ID+"/password-reset-tokens", nil)
	request.AddCookie(&http.Cookie{Name: "ers_test_session", Value: "caller-session"})
	response, err := app.Test(request)
	if err != nil {
		t.Fatalf("issue reset token request: %v", err)
	}
	if response.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected inactive target status 400, got %d", response.StatusCode)
	}
	if cookies := response.Cookies(); len(cookies) != 0 {
		t.Fatalf("target validation must not clear the caller session cookie, got %#v", cookies)
	}
	var payload struct {
		Error struct {
			Code   string            `json:"code"`
			Fields map[string]string `json:"fields"`
		} `json:"error"`
	}
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode inactive target response: %v", err)
	}
	if payload.Error.Code != "validation_failed" || payload.Error.Fields["accountId"] == "" {
		t.Fatalf("unexpected inactive target response: %#v", payload)
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

func TestAuthenticationHandlerPreservesTargetTenantFromCreateAccountBody(t *testing.T) {
	database, _, service, _ := authenticationTestService(t)
	now := time.Now().UTC()
	status := appdb.ReferenceData{
		BaseModel: appdb.BaseModel{ID: "handler-target-tenant-status", CreatedAt: now, UpdatedAt: now},
		TenantID:  appdb.DefaultTenantID,
		Type:      "person_status",
		Code:      "ACTIVE",
		Label:     "Active",
		Active:    true,
	}
	if err := database.Create(&status).Error; err != nil {
		t.Fatalf("create Person status: %v", err)
	}
	person := appdb.Person{
		BaseModel: appdb.BaseModel{ID: "handler-target-tenant-person", CreatedAt: now, UpdatedAt: now},
		TenantID:  appdb.DefaultTenantID,
		FirstName: "Target", LastName: "Tenant", Nickname: "TargetTenant",
		CPF: "12345678909", RG: "HANDLERTARGET", Cellular: "11912345679",
		Email: "handler-target-tenant@example.com", Country: "Brasil", StatusID: status.ID,
	}
	if err := database.Create(&person).Error; err != nil {
		t.Fatalf("create Person: %v", err)
	}

	handler := NewHandler(service, CookieConfig{}, nil, nil)
	app := fiber.New()
	app.Post("/accounts", handler.CreateAccount)
	body, _ := json.Marshal(CreateAccountRequest{
		TenantID:          appdb.DefaultTenantID,
		Login:             person.Email,
		TemporaryPassword: "Target-Tenant-Password-1",
	})
	request := httptest.NewRequest(http.MethodPost, "/accounts", bytes.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set(authz.HeaderTenantID, authz.GlobalTenantScope)
	response, err := app.Test(request)
	if err != nil {
		t.Fatalf("create account request: %v", err)
	}
	if response.StatusCode != http.StatusCreated {
		payload, _ := io.ReadAll(response.Body)
		t.Fatalf("expected target-Tenant account creation status 201, got %d: %s", response.StatusCode, payload)
	}
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

type tenantOptionAuthenticationActorStore struct {
	actorRecordID string
	options       []authz.TenantOption
}

func (s *tenantOptionAuthenticationActorStore) FindActor(context.Context, authz.ActorLookup) (*authz.Actor, error) {
	return nil, authz.ErrMissingActor
}

func (s *tenantOptionAuthenticationActorStore) ListActorTenantOptions(_ context.Context, actorRecordID string) ([]authz.TenantOption, error) {
	s.actorRecordID = actorRecordID
	return s.options, nil
}

func TestAuthenticationHandlerListsGrantedTenantOptions(t *testing.T) {
	_, _, service, actor := authenticationTestService(t)
	account, err := service.CreateAccount(t.Context(), CreateAccountRequest{
		ActorID: actor.ID, Login: "tenant-options@example.com", TemporaryPassword: "Tenant-Options-Password-1",
	})
	if err != nil {
		t.Fatalf("create account: %v", err)
	}

	store := &tenantOptionAuthenticationActorStore{options: []authz.TenantOption{{
		ID: "tenant-a", Code: "A", Name: "Alpha", RoleCodes: []string{"TENANT_ADMIN"},
	}}}
	handler := NewHandler(service, CookieConfig{Name: "ers_test_session", TTL: time.Hour}, store, nil)
	app := fiber.New()
	app.Use(handler.SessionMiddleware())
	app.Post("/login", handler.Login)
	app.Get("/tenant-options", handler.RequireSession, handler.TenantOptions)

	body, _ := json.Marshal(LoginRequest{Login: account.Login, Password: "Tenant-Options-Password-1"})
	loginRequest := httptest.NewRequest(http.MethodPost, "/login", bytes.NewReader(body))
	loginRequest.Header.Set("Content-Type", "application/json")
	loginResponse, err := app.Test(loginRequest)
	if err != nil {
		t.Fatalf("login request: %v", err)
	}
	cookie := loginResponse.Cookies()[0]

	optionsRequest := httptest.NewRequest(http.MethodGet, "/tenant-options", nil)
	optionsRequest.AddCookie(cookie)
	optionsResponse, err := app.Test(optionsRequest)
	if err != nil {
		t.Fatalf("tenant-options request: %v", err)
	}
	if optionsResponse.StatusCode != http.StatusOK {
		t.Fatalf("expected tenant-options status 200, got %d", optionsResponse.StatusCode)
	}
	if store.actorRecordID != actor.ID {
		t.Fatalf("tenant options resolved actor %q, want %q", store.actorRecordID, actor.ID)
	}
	var payload struct {
		Data []authz.TenantOption `json:"data"`
	}
	if err := json.NewDecoder(optionsResponse.Body).Decode(&payload); err != nil {
		t.Fatalf("decode tenant options: %v", err)
	}
	if len(payload.Data) != 1 || payload.Data[0].ID != "tenant-a" {
		t.Fatalf("unexpected tenant options: %#v", payload.Data)
	}
}
