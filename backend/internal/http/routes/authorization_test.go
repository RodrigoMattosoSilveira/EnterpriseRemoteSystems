package routes

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"

	"enterpriseremotesystems/backend/internal/authentication"
	"enterpriseremotesystems/backend/internal/authz"
)

type fakeActorStore struct {
	actor  *authz.Actor
	err    error
	calls  *int
	lookup *authz.ActorLookup
}

func (s fakeActorStore) FindActor(ctx context.Context, lookup authz.ActorLookup) (*authz.Actor, error) {
	if s.calls != nil {
		*s.calls = *s.calls + 1
	}
	if s.lookup != nil {
		*s.lookup = lookup
	}
	if s.err != nil {
		return nil, s.err
	}
	if s.actor == nil {
		return nil, authz.ErrMissingActor
	}
	return s.actor, nil
}

func TestRequirePermissionRejectsMissingActor(t *testing.T) {
	app := fiber.New()
	app.Get("/protected", requirePermission(Dependencies{}, authz.PermissionPeopleRead), func(c fiber.Ctx) error {
		return c.SendStatus(fiber.StatusNoContent)
	})

	resp, err := app.Test(httptest.NewRequest(fiber.MethodGet, "/protected", nil))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", resp.StatusCode)
	}
}

func TestRequirePermissionRejectsForbiddenActor(t *testing.T) {
	app := fiber.New()
	app.Get("/protected", requirePermission(Dependencies{}, authz.PermissionPeopleRead), func(c fiber.Ctx) error {
		return c.SendStatus(fiber.StatusNoContent)
	})

	req := httptest.NewRequest(fiber.MethodGet, "/protected", nil)
	req.Header.Set(authz.HeaderActorID, "actor")
	req.Header.Set(authz.HeaderTenantID, "default")
	req.Header.Set(authz.HeaderActorPermissions, string(authz.PermissionExpensesRead))
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusForbidden {
		t.Fatalf("expected 403, got %d", resp.StatusCode)
	}
}

func TestRequirePermissionAllowsHeaderPermissionActor(t *testing.T) {
	app := fiber.New()
	app.Get("/protected", requirePermission(Dependencies{}, authz.PermissionPeopleRead), func(c fiber.Ctx) error {
		return c.SendStatus(fiber.StatusNoContent)
	})

	req := httptest.NewRequest(fiber.MethodGet, "/protected", nil)
	req.Header.Set(authz.HeaderActorID, "actor")
	req.Header.Set(authz.HeaderTenantID, "default")
	req.Header.Set(authz.HeaderActorPermissions, string(authz.PermissionPeopleRead))
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusNoContent {
		t.Fatalf("expected 204, got %d", resp.StatusCode)
	}
}

func TestRequirePermissionAllowsPersistedActor(t *testing.T) {
	store := fakeActorStore{actor: &authz.Actor{
		ID:       "actor",
		TenantID: "default",
		Scope:    authz.ActorScopeTenant,
		Permissions: map[authz.Permission]struct{}{
			authz.PermissionPeopleRead: {},
		},
	}}

	app := fiber.New()
	app.Get("/protected", requirePermission(Dependencies{ActorStore: store}, authz.PermissionPeopleRead), func(c fiber.Ctx) error {
		return c.SendStatus(fiber.StatusNoContent)
	})

	req := httptest.NewRequest(fiber.MethodGet, "/protected", nil)
	req.Header.Set(authz.HeaderActorID, "actor")
	req.Header.Set(authz.HeaderTenantID, "default")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusNoContent {
		t.Fatalf("expected 204, got %d", resp.StatusCode)
	}
}

func TestRequirePermissionOrSelfPersonAllowsFullPermissionActor(t *testing.T) {
	store := fakeActorStore{actor: &authz.Actor{
		ID:       "admin",
		TenantID: "default",
		Scope:    authz.ActorScopeTenant,
		Permissions: map[authz.Permission]struct{}{
			authz.PermissionPeopleRead: {},
		},
	}}

	app := fiber.New()
	app.Get("/people/:id", requirePermissionOrSelfPerson(Dependencies{ActorStore: store}, authz.PermissionPeopleRead, authz.PermissionPeopleSelfRead, "id"), func(c fiber.Ctx) error {
		return c.SendStatus(fiber.StatusNoContent)
	})

	req := httptest.NewRequest(fiber.MethodGet, "/people/person-other", nil)
	req.Header.Set(authz.HeaderActorID, "admin")
	req.Header.Set(authz.HeaderTenantID, "default")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusNoContent {
		t.Fatalf("expected 204, got %d", resp.StatusCode)
	}
}

func TestRequirePermissionOrSelfPersonAllowsMatchingSelfActor(t *testing.T) {
	store := fakeActorStore{actor: &authz.Actor{
		ID:       "person-actor",
		TenantID: "default",
		PersonID: "person-self",
		Scope:    authz.ActorScopeSelf,
		Permissions: map[authz.Permission]struct{}{
			authz.PermissionPeopleSelfRead: {},
		},
	}}

	app := fiber.New()
	app.Get("/people/:id", requirePermissionOrSelfPerson(Dependencies{ActorStore: store}, authz.PermissionPeopleRead, authz.PermissionPeopleSelfRead, "id"), func(c fiber.Ctx) error {
		return c.SendStatus(fiber.StatusNoContent)
	})

	req := httptest.NewRequest(fiber.MethodGet, "/people/person-self", nil)
	req.Header.Set(authz.HeaderActorID, "person-actor")
	req.Header.Set(authz.HeaderTenantID, "default")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusNoContent {
		t.Fatalf("expected 204, got %d", resp.StatusCode)
	}
}

func TestRequirePermissionOrSelfPersonRejectsDifferentPerson(t *testing.T) {
	store := fakeActorStore{actor: &authz.Actor{
		ID:       "person-actor",
		TenantID: "default",
		PersonID: "person-self",
		Scope:    authz.ActorScopeSelf,
		Permissions: map[authz.Permission]struct{}{
			authz.PermissionPeopleSelfRead: {},
		},
	}}

	app := fiber.New()
	app.Get("/people/:id", requirePermissionOrSelfPerson(Dependencies{ActorStore: store}, authz.PermissionPeopleRead, authz.PermissionPeopleSelfRead, "id"), func(c fiber.Ctx) error {
		return c.SendStatus(fiber.StatusNoContent)
	})

	req := httptest.NewRequest(fiber.MethodGet, "/people/person-other", nil)
	req.Header.Set(authz.HeaderActorID, "person-actor")
	req.Header.Set(authz.HeaderTenantID, "default")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusForbidden {
		t.Fatalf("expected 403, got %d", resp.StatusCode)
	}
}

func TestRequirePermissionOrSelfPersonRejectsSelfPermissionWithoutLinkedPerson(t *testing.T) {
	store := fakeActorStore{actor: &authz.Actor{
		ID:       "person-actor",
		TenantID: "default",
		Scope:    authz.ActorScopeSelf,
		Permissions: map[authz.Permission]struct{}{
			authz.PermissionPeopleSelfRead: {},
		},
	}}

	app := fiber.New()
	app.Get("/people/:id", requirePermissionOrSelfPerson(Dependencies{ActorStore: store}, authz.PermissionPeopleRead, authz.PermissionPeopleSelfRead, "id"), func(c fiber.Ctx) error {
		return c.SendStatus(fiber.StatusNoContent)
	})

	req := httptest.NewRequest(fiber.MethodGet, "/people/person-self", nil)
	req.Header.Set(authz.HeaderActorID, "person-actor")
	req.Header.Set(authz.HeaderTenantID, "default")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusForbidden {
		t.Fatalf("expected 403, got %d", resp.StatusCode)
	}
}

func TestRequirePermissionOrSelfCollaboratorAllowsMatchingSelfActor(t *testing.T) {
	store := fakeActorStore{actor: &authz.Actor{
		ID:             "collaborator-actor",
		TenantID:       "default",
		CollaboratorID: "collaborator-self",
		Scope:          authz.ActorScopeSelf,
		Permissions: map[authz.Permission]struct{}{
			authz.PermissionCollaboratorsSelfRead: {},
		},
	}}

	app := fiber.New()
	app.Get("/collaborators/:id", requirePermissionOrSelfCollaborator(Dependencies{ActorStore: store}, authz.PermissionCollaboratorsRead, authz.PermissionCollaboratorsSelfRead, "id"), func(c fiber.Ctx) error {
		return c.SendStatus(fiber.StatusNoContent)
	})

	req := httptest.NewRequest(fiber.MethodGet, "/collaborators/collaborator-self", nil)
	req.Header.Set(authz.HeaderActorID, "collaborator-actor")
	req.Header.Set(authz.HeaderTenantID, "default")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusNoContent {
		t.Fatalf("expected 204, got %d", resp.StatusCode)
	}
}

func TestRequirePermissionOrSelfCollaboratorRejectsDifferentCollaborator(t *testing.T) {
	store := fakeActorStore{actor: &authz.Actor{
		ID:             "collaborator-actor",
		TenantID:       "default",
		CollaboratorID: "collaborator-self",
		Scope:          authz.ActorScopeSelf,
		Permissions: map[authz.Permission]struct{}{
			authz.PermissionCollaboratorsSelfRead: {},
		},
	}}

	app := fiber.New()
	app.Get("/collaborators/:id", requirePermissionOrSelfCollaborator(Dependencies{ActorStore: store}, authz.PermissionCollaboratorsRead, authz.PermissionCollaboratorsSelfRead, "id"), func(c fiber.Ctx) error {
		return c.SendStatus(fiber.StatusNoContent)
	})

	req := httptest.NewRequest(fiber.MethodGet, "/collaborators/collaborator-other", nil)
	req.Header.Set(authz.HeaderActorID, "collaborator-actor")
	req.Header.Set(authz.HeaderTenantID, "default")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusForbidden {
		t.Fatalf("expected 403, got %d", resp.StatusCode)
	}
}

func TestAuthorizationMiddlewareCachesResolvedActorForRouteGuards(t *testing.T) {
	calls := 0
	store := fakeActorStore{
		calls: &calls,
		actor: &authz.Actor{
			ID:       "actor",
			TenantID: "default",
			Scope:    authz.ActorScopeTenant,
			Permissions: map[authz.Permission]struct{}{
				authz.PermissionPeopleRead:   {},
				authz.PermissionExpensesRead: {},
			},
		},
	}

	app := fiber.New()
	app.Use(authorizationMiddleware(Dependencies{ActorStore: store}))
	app.Get(
		"/protected",
		requirePermission(Dependencies{ActorStore: store}, authz.PermissionPeopleRead),
		requirePermission(Dependencies{ActorStore: store}, authz.PermissionExpensesRead),
		func(c fiber.Ctx) error {
			return c.SendStatus(fiber.StatusNoContent)
		},
	)

	req := httptest.NewRequest(fiber.MethodGet, "/protected", nil)
	req.Header.Set(authz.HeaderActorID, "actor")
	req.Header.Set(authz.HeaderTenantID, "default")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusNoContent {
		t.Fatalf("expected 204, got %d", resp.StatusCode)
	}
	if calls != 1 {
		t.Fatalf("expected actor store to be called once, got %d", calls)
	}
}

func TestRequirePermissionFallsBackWhenMiddlewareIsNotInstalled(t *testing.T) {
	calls := 0
	store := fakeActorStore{
		calls: &calls,
		actor: &authz.Actor{
			ID:       "actor",
			TenantID: "default",
			Scope:    authz.ActorScopeTenant,
			Permissions: map[authz.Permission]struct{}{
				authz.PermissionPeopleRead: {},
			},
		},
	}

	app := fiber.New()
	app.Get("/protected", requirePermission(Dependencies{ActorStore: store}, authz.PermissionPeopleRead), func(c fiber.Ctx) error {
		return c.SendStatus(fiber.StatusNoContent)
	})

	req := httptest.NewRequest(fiber.MethodGet, "/protected", nil)
	req.Header.Set(authz.HeaderActorID, "actor")
	req.Header.Set(authz.HeaderTenantID, "default")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusNoContent {
		t.Fatalf("expected 204, got %d", resp.StatusCode)
	}
	if calls != 1 {
		t.Fatalf("expected actor store to be called once, got %d", calls)
	}
}

func TestAuthorizationMiddlewareLeavesHealthzPublic(t *testing.T) {
	calls := 0
	store := fakeActorStore{err: authz.ErrMissingActor, calls: &calls}
	app := fiber.New()
	Register(app, Dependencies{ActorStore: store})

	for _, path := range []string{"/healthz", "/api/v1/healthz"} {
		resp, err := app.Test(httptest.NewRequest(fiber.MethodGet, path, nil))
		if err != nil {
			t.Fatalf("%s request failed: %v", path, err)
		}
		if resp.StatusCode != fiber.StatusOK {
			t.Fatalf("expected %s to remain public with status 200, got %d", path, resp.StatusCode)
		}
	}
	if calls != 0 {
		t.Fatalf("health checks should not resolve an authorization actor, got %d calls", calls)
	}
}

func TestRequireApplicationPermissionRejectsTenantScopedWildcardActor(t *testing.T) {
	store := fakeActorStore{actor: &authz.Actor{
		ID:       "tenant-admin",
		TenantID: "default",
		Scope:    authz.ActorScopeTenant,
		Permissions: map[authz.Permission]struct{}{
			authz.PermissionAll: {},
		},
	}}

	app := fiber.New()
	app.Post("/tenants", requireApplicationPermission(Dependencies{ActorStore: store}, authz.PermissionTenantsCreate), func(c fiber.Ctx) error {
		return c.SendStatus(fiber.StatusNoContent)
	})

	req := httptest.NewRequest(fiber.MethodPost, "/tenants", nil)
	req.Header.Set(authz.HeaderActorID, "tenant-admin")
	req.Header.Set(authz.HeaderTenantID, "default")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusForbidden {
		t.Fatalf("expected 403, got %d", resp.StatusCode)
	}
}

func TestRequireApplicationPermissionAllowsApplicationScopedActor(t *testing.T) {
	store := fakeActorStore{actor: &authz.Actor{
		ID:       "application-admin",
		TenantID: "default",
		Scope:    authz.ActorScopeApplication,
		Permissions: map[authz.Permission]struct{}{
			authz.PermissionAll: {},
		},
	}}

	app := fiber.New()
	app.Post("/tenants", requireApplicationPermission(Dependencies{ActorStore: store}, authz.PermissionTenantsCreate), func(c fiber.Ctx) error {
		return c.SendStatus(fiber.StatusNoContent)
	})

	req := httptest.NewRequest(fiber.MethodPost, "/tenants", nil)
	req.Header.Set(authz.HeaderActorID, "application-admin")
	req.Header.Set(authz.HeaderTenantID, "default")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusNoContent {
		t.Fatalf("expected 204, got %d", resp.StatusCode)
	}
}

func TestRequireTenantPermissionRejectsDifferentTenant(t *testing.T) {
	store := fakeActorStore{actor: &authz.Actor{
		ID:       "tenant-admin",
		TenantID: "tenant-a",
		Scope:    authz.ActorScopeTenant,
		Permissions: map[authz.Permission]struct{}{
			authz.PermissionTenantsRead: {},
		},
	}}

	app := fiber.New()
	app.Get("/tenants/:id", requireTenantPermission(Dependencies{ActorStore: store}, authz.PermissionTenantsRead, "id"), func(c fiber.Ctx) error {
		return c.SendStatus(fiber.StatusNoContent)
	})

	req := httptest.NewRequest(fiber.MethodGet, "/tenants/tenant-b", nil)
	req.Header.Set(authz.HeaderActorID, "tenant-admin")
	req.Header.Set(authz.HeaderTenantID, "tenant-a")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusForbidden {
		t.Fatalf("expected 403, got %d", resp.StatusCode)
	}
}

func TestAuthenticatedSessionOverridesSpoofedActorHeader(t *testing.T) {
	lookup := authz.ActorLookup{}
	store := fakeActorStore{
		lookup: &lookup,
		actor: &authz.Actor{
			ID:       "session-actor",
			RecordID: "actor-record-1",
			TenantID: "default",
			Scope:    authz.ActorScopeTenant,
			Permissions: map[authz.Permission]struct{}{
				authz.PermissionPeopleRead: {},
			},
		},
	}
	deps := Dependencies{ActorStore: store, ActorHeaderMode: actorHeaderModeDisabled}

	app := fiber.New()
	app.Use(func(c fiber.Ctx) error {
		authentication.SetSessionContext(c, authentication.SessionResponse{
			ActorID:  "actor-record-1",
			ActorKey: "session-actor",
		})
		return c.Next()
	})
	app.Use(authorizationMiddleware(deps))
	app.Get("/protected", requirePermission(deps, authz.PermissionPeopleRead), func(c fiber.Ctx) error {
		actor, err := authz.RequestActorFromContext(c)
		if err != nil {
			return err
		}
		if actor.ID != "session-actor" || actor.Source != authz.ActorSourceAuthenticatedSession {
			t.Fatalf("unexpected authoritative actor: %#v", actor)
		}
		return c.SendStatus(fiber.StatusNoContent)
	})

	req := httptest.NewRequest(fiber.MethodGet, "/protected", nil)
	req.Header.Set(authz.HeaderActorID, "spoofed-application-admin")
	req.Header.Set(authz.HeaderActorPermissions, "*")
	req.Header.Set(authz.HeaderTenantID, "default")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusNoContent {
		t.Fatalf("expected 204, got %d", resp.StatusCode)
	}
	if lookup.ActorID != "session-actor" || lookup.TenantID != "default" {
		t.Fatalf("expected session lookup, got %#v", lookup)
	}
}

func TestDisabledActorHeadersRequireAuthentication(t *testing.T) {
	deps := Dependencies{ActorHeaderMode: actorHeaderModeDisabled}
	app := fiber.New()
	app.Use(authorizationMiddleware(deps))
	app.Get("/protected", requirePermission(deps, authz.PermissionPeopleRead), func(c fiber.Ctx) error {
		return c.SendStatus(fiber.StatusNoContent)
	})

	req := httptest.NewRequest(fiber.MethodGet, "/protected", nil)
	req.Header.Set(authz.HeaderActorID, "bootstrap-admin")
	req.Header.Set(authz.HeaderTenantID, "default")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", resp.StatusCode)
	}
}

func TestBootstrapActorHeaderModeAllowsOnlyConfiguredBootstrapActor(t *testing.T) {
	store := fakeActorStore{actor: &authz.Actor{
		ID:       "bootstrap-admin",
		RecordID: "bootstrap-record",
		TenantID: "default",
		Scope:    authz.ActorScopeApplication,
		Permissions: map[authz.Permission]struct{}{
			authz.PermissionAll: {},
		},
	}}
	deps := Dependencies{
		ActorStore:        store,
		ActorHeaderMode:   actorHeaderModeBootstrap,
		BootstrapActorKey: "bootstrap-admin",
	}
	app := fiber.New()
	app.Use(authorizationMiddleware(deps))
	app.Get("/protected", requirePermission(deps, authz.PermissionPeopleRead), func(c fiber.Ctx) error {
		return c.SendStatus(fiber.StatusNoContent)
	})

	for _, test := range []struct {
		actorKey string
		status   int
	}{
		{actorKey: "bootstrap-admin", status: fiber.StatusNoContent},
		{actorKey: "other-actor", status: fiber.StatusUnauthorized},
	} {
		req := httptest.NewRequest(fiber.MethodGet, "/protected", nil)
		req.Header.Set(authz.HeaderActorID, test.actorKey)
		req.Header.Set(authz.HeaderTenantID, "default")
		resp, err := app.Test(req)
		if err != nil {
			t.Fatalf("request failed: %v", err)
		}
		if resp.StatusCode != test.status {
			t.Fatalf("actor %q: expected %d, got %d", test.actorKey, test.status, resp.StatusCode)
		}
	}
}

func TestTestActorHeaderModeReportsUnknownPersistedActorAsAuthenticationRequired(t *testing.T) {
	deps := Dependencies{
		ActorStore:      fakeActorStore{err: authz.ErrMissingActor},
		ActorHeaderMode: actorHeaderModeTest,
	}
	app := fiber.New()
	app.Use(authorizationMiddleware(deps))
	app.Get("/protected", requirePermission(deps, authz.PermissionPeopleRead), func(c fiber.Ctx) error {
		return c.SendStatus(fiber.StatusNoContent)
	})

	req := httptest.NewRequest(fiber.MethodGet, "/protected", nil)
	req.Header.Set(authz.HeaderActorID, "unknown@example.com")
	req.Header.Set(authz.HeaderTenantID, "default")
	req.Header.Set(authz.HeaderActorPermissions, string(authz.PermissionAll))
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", resp.StatusCode)
	}

	var body struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body.Error.Code != "authentication_required" {
		t.Fatalf("expected authentication_required, got %q", body.Error.Code)
	}
}

func TestAuthenticationBoundaryErrorPreservesNonIdentityFailures(t *testing.T) {
	if got := authenticationBoundaryError(authz.ErrTenantSelectionRequired); got != authz.ErrTenantSelectionRequired {
		t.Fatalf("expected tenant selection error to be preserved, got %v", got)
	}
}

func TestBootstrapActorHeaderModeRejectsIdentityEscalationHeaders(t *testing.T) {
	store := fakeActorStore{actor: &authz.Actor{
		ID:       "bootstrap-admin",
		RecordID: "bootstrap-record",
		TenantID: "default",
		Scope:    authz.ActorScopeApplication,
		Permissions: map[authz.Permission]struct{}{
			authz.PermissionAll: {},
		},
	}}
	deps := Dependencies{
		ActorStore:        store,
		ActorHeaderMode:   actorHeaderModeBootstrap,
		BootstrapActorKey: "bootstrap-admin",
	}

	for _, header := range []string{authz.HeaderAuthorizedBy, authz.HeaderActorPermissions} {
		app := fiber.New()
		app.Use(authorizationMiddleware(deps))
		app.Get("/protected", requirePermission(deps, authz.PermissionPeopleRead), func(c fiber.Ctx) error {
			return c.SendStatus(fiber.StatusNoContent)
		})

		req := httptest.NewRequest(fiber.MethodGet, "/protected", nil)
		req.Header.Set(authz.HeaderActorID, "bootstrap-admin")
		req.Header.Set(authz.HeaderTenantID, "default")
		req.Header.Set(header, "*")
		resp, err := app.Test(req)
		if err != nil {
			t.Fatalf("%s request failed: %v", header, err)
		}
		if resp.StatusCode != fiber.StatusUnauthorized {
			t.Fatalf("%s: expected 401, got %d", header, resp.StatusCode)
		}
	}
}

func TestAuthenticatedSessionRequiresTenantSelection(t *testing.T) {
	deps := Dependencies{ActorStore: fakeActorStore{}, ActorHeaderMode: actorHeaderModeDisabled}
	app := fiber.New()
	app.Use(func(c fiber.Ctx) error {
		authentication.SetSessionContext(c, authentication.SessionResponse{
			ActorID:  "actor-record-1",
			ActorKey: "session-actor",
		})
		return c.Next()
	})
	app.Use(authorizationMiddleware(deps))
	app.Get("/protected", requirePermission(deps, authz.PermissionPeopleRead), func(c fiber.Ctx) error {
		return c.SendStatus(fiber.StatusNoContent)
	})

	resp, err := app.Test(httptest.NewRequest(fiber.MethodGet, "/protected", nil))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusForbidden {
		t.Fatalf("expected 403, got %d", resp.StatusCode)
	}
}
