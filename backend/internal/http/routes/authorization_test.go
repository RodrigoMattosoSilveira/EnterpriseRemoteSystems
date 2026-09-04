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

type accountActorRouteStore struct {
	fakeActorStore
	accountID  string
	tenantID   string
	accountErr error
}

func (s *accountActorRouteStore) FindAccountActor(_ context.Context, accountID string, tenantID string) (*authz.Actor, error) {
	s.accountID = accountID
	s.tenantID = tenantID
	if s.accountErr != nil {
		return nil, s.accountErr
	}
	return s.actor, nil
}

func (s *accountActorRouteStore) ListAccountTenantOptions(context.Context, string) ([]authz.TenantOption, error) {
	return nil, nil
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

func TestRequireTenantAdministratorAllowsTenantAdminOnly(t *testing.T) {
	cases := []struct {
		name       string
		actor      *authz.Actor
		wantStatus int
	}{
		{
			name: "tenant administrator",
			actor: &authz.Actor{
				ID: "tenant-admin", TenantID: "default", Scope: authz.ActorScopeTenant,
				RoleCodes:   []string{string(authz.RoleTenantAdmin)},
				Permissions: map[authz.Permission]struct{}{authz.PermissionAll: {}},
			},
			wantStatus: fiber.StatusNoContent,
		},
		{
			name: "tenant operator with people permission",
			actor: &authz.Actor{
				ID: "tenant-operator", TenantID: "default", Scope: authz.ActorScopeTenant,
				RoleCodes:   []string{string(authz.RoleExpenseOperator)},
				Permissions: map[authz.Permission]struct{}{authz.PermissionPeopleCreate: {}},
			},
			wantStatus: fiber.StatusForbidden,
		},
		{
			name: "application administrator",
			actor: &authz.Actor{
				ID: "application-admin", TenantID: authz.GlobalTenantScope, Scope: authz.ActorScopeApplication,
				RoleCodes:   []string{string(authz.RoleApplicationAdmin)},
				Permissions: map[authz.Permission]struct{}{authz.PermissionAuthzManage: {}},
			},
			wantStatus: fiber.StatusForbidden,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			app := fiber.New()
			app.Get("/tenant-admin-only", requireTenantAdministrator(Dependencies{ActorStore: fakeActorStore{actor: tc.actor}}), func(c fiber.Ctx) error {
				return c.SendStatus(fiber.StatusNoContent)
			})
			req := httptest.NewRequest(fiber.MethodGet, "/tenant-admin-only", nil)
			req.Header.Set(authz.HeaderActorID, tc.actor.ID)
			req.Header.Set(authz.HeaderTenantID, tc.actor.TenantID)
			resp, err := app.Test(req)
			if err != nil {
				t.Fatalf("request failed: %v", err)
			}
			if resp.StatusCode != tc.wantStatus {
				t.Fatalf("status = %d, want %d", resp.StatusCode, tc.wantStatus)
			}
		})
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
		Scope:    authz.ActorScopeTenant,
		Permissions: map[authz.Permission]struct{}{
			authz.PermissionPeopleSelfRead: {},
		},
		IntrinsicPermissions: map[authz.Permission]struct{}{
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

func TestRequirePermissionOrSelfPersonRejectsDelegatedSelfPermissionWithoutIntrinsicIdentityAuthority(t *testing.T) {
	store := fakeActorStore{actor: &authz.Actor{
		ID:       "person-actor",
		TenantID: "default",
		PersonID: "person-self",
		Scope:    authz.ActorScopeTenant,
		Permissions: map[authz.Permission]struct{}{
			authz.PermissionPeopleSelfRead: {},
		},
		DelegatedPermissions: map[authz.Permission]struct{}{
			authz.PermissionPeopleSelfRead: {},
		},
		IntrinsicPermissions: map[authz.Permission]struct{}{},
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

func TestRequirePermissionOrSelfPersonRejectsDifferentPerson(t *testing.T) {
	store := fakeActorStore{actor: &authz.Actor{
		ID:       "person-actor",
		TenantID: "default",
		PersonID: "person-self",
		Scope:    authz.ActorScopeTenant,
		Permissions: map[authz.Permission]struct{}{
			authz.PermissionPeopleSelfRead: {},
		},
		IntrinsicPermissions: map[authz.Permission]struct{}{
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
		Scope:    authz.ActorScopeTenant,
		Permissions: map[authz.Permission]struct{}{
			authz.PermissionPeopleSelfRead: {},
		},
		IntrinsicPermissions: map[authz.Permission]struct{}{
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
		Scope:          authz.ActorScopeTenant,
		Permissions: map[authz.Permission]struct{}{
			authz.PermissionCollaboratorsSelfRead: {},
		},
		IntrinsicPermissions: map[authz.Permission]struct{}{
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
		Scope:          authz.ActorScopeTenant,
		Permissions: map[authz.Permission]struct{}{
			authz.PermissionCollaboratorsSelfRead: {},
		},
		IntrinsicPermissions: map[authz.Permission]struct{}{
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

func TestCollaboratorSelfReadDoesNotAuthorizeCollaboratorMutations(t *testing.T) {
	store := fakeActorStore{actor: &authz.Actor{
		ID:       "collaborator-self-actor",
		TenantID: "default",
		Scope:    authz.ActorScopeTenant,
		Permissions: map[authz.Permission]struct{}{
			authz.PermissionCollaboratorsSelfRead: {},
		},
		IntrinsicPermissions: map[authz.Permission]struct{}{
			authz.PermissionCollaboratorsSelfRead: {},
		},
	}}

	app := fiber.New()
	deps := Dependencies{ActorStore: store}
	app.Put("/collaborators/:id", requirePermission(deps, authz.PermissionCollaboratorsUpdate), func(c fiber.Ctx) error {
		return c.SendStatus(fiber.StatusNoContent)
	})
	app.Patch("/collaborators/:id/work-assignment", requirePermission(deps, authz.PermissionCollaboratorsWorkAssignmentUpdate), func(c fiber.Ctx) error {
		return c.SendStatus(fiber.StatusNoContent)
	})
	app.Post("/collaborators/:id/extend", requirePermission(deps, authz.PermissionCollaboratorsUpdate), func(c fiber.Ctx) error {
		return c.SendStatus(fiber.StatusNoContent)
	})

	for _, tc := range []struct {
		method string
		path   string
	}{
		{method: fiber.MethodPut, path: "/collaborators/collaborator-self"},
		{method: fiber.MethodPatch, path: "/collaborators/collaborator-self/work-assignment"},
		{method: fiber.MethodPost, path: "/collaborators/collaborator-self/extend"},
	} {
		req := httptest.NewRequest(tc.method, tc.path, nil)
		req.Header.Set(authz.HeaderActorID, "collaborator-self-actor")
		req.Header.Set(authz.HeaderTenantID, "default")
		resp, err := app.Test(req)
		if err != nil {
			t.Fatalf("%s %s failed: %v", tc.method, tc.path, err)
		}
		if resp.StatusCode != fiber.StatusForbidden {
			t.Fatalf("%s %s expected 403, got %d", tc.method, tc.path, resp.StatusCode)
		}
	}
}

func TestEarningsOperatorWorkAssignmentPermissionDoesNotAuthorizeFullCollaboratorUpdate(t *testing.T) {
	store := fakeActorStore{actor: &authz.Actor{
		ID:       "earnings-actor",
		TenantID: "default",
		Scope:    authz.ActorScopeTenant,
		Permissions: map[authz.Permission]struct{}{
			authz.PermissionCollaboratorsRead:                 {},
			authz.PermissionCollaboratorsWorkAssignmentUpdate: {},
		},
	}}

	app := fiber.New()
	deps := Dependencies{ActorStore: store}
	app.Put("/collaborators/:id", requirePermission(deps, authz.PermissionCollaboratorsUpdate), func(c fiber.Ctx) error {
		return c.SendStatus(fiber.StatusNoContent)
	})
	app.Patch("/collaborators/:id/work-assignment", requirePermission(deps, authz.PermissionCollaboratorsWorkAssignmentUpdate), func(c fiber.Ctx) error {
		return c.SendStatus(fiber.StatusNoContent)
	})
	app.Post("/collaborators/:id/extend", requirePermission(deps, authz.PermissionCollaboratorsUpdate), func(c fiber.Ctx) error {
		return c.SendStatus(fiber.StatusNoContent)
	})

	fullReq := httptest.NewRequest(fiber.MethodPut, "/collaborators/collaborator-1", nil)
	fullReq.Header.Set(authz.HeaderActorID, "earnings-actor")
	fullReq.Header.Set(authz.HeaderTenantID, "default")
	fullResp, err := app.Test(fullReq)
	if err != nil {
		t.Fatalf("full collaborator update request failed: %v", err)
	}
	if fullResp.StatusCode != fiber.StatusForbidden {
		t.Fatalf("full collaborator update expected 403, got %d", fullResp.StatusCode)
	}

	assignmentReq := httptest.NewRequest(fiber.MethodPatch, "/collaborators/collaborator-1/work-assignment", nil)
	assignmentReq.Header.Set(authz.HeaderActorID, "earnings-actor")
	assignmentReq.Header.Set(authz.HeaderTenantID, "default")
	assignmentResp, err := app.Test(assignmentReq)
	if err != nil {
		t.Fatalf("work-assignment update request failed: %v", err)
	}
	if assignmentResp.StatusCode != fiber.StatusNoContent {
		t.Fatalf("work-assignment update expected 204, got %d", assignmentResp.StatusCode)
	}

	extendReq := httptest.NewRequest(fiber.MethodPost, "/collaborators/collaborator-1/extend", nil)
	extendReq.Header.Set(authz.HeaderActorID, "earnings-actor")
	extendReq.Header.Set(authz.HeaderTenantID, "default")
	extendResp, err := app.Test(extendReq)
	if err != nil {
		t.Fatalf("Journey extension request failed: %v", err)
	}
	if extendResp.StatusCode != fiber.StatusForbidden {
		t.Fatalf("Journey extension expected 403, got %d", extendResp.StatusCode)
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
		TenantID: authz.GlobalTenantScope,
		Scope:    authz.ActorScopeApplication,
		Permissions: map[authz.Permission]struct{}{
			authz.PermissionTenantsCreate: {},
		},
	}}

	app := fiber.New()
	app.Post("/tenants", requireApplicationPermission(Dependencies{ActorStore: store}, authz.PermissionTenantsCreate), func(c fiber.Ctx) error {
		return c.SendStatus(fiber.StatusNoContent)
	})

	req := httptest.NewRequest(fiber.MethodPost, "/tenants", nil)
	req.Header.Set(authz.HeaderActorID, "application-admin")
	req.Header.Set(authz.HeaderTenantID, authz.GlobalTenantScope)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusNoContent {
		t.Fatalf("expected 204, got %d", resp.StatusCode)
	}
}

func TestRequireApplicationPermissionRejectsLeasedApplicationContext(t *testing.T) {
	store := fakeActorStore{actor: &authz.Actor{
		ID:             "application-admin",
		TenantID:       "tenant-a",
		Scope:          authz.ActorScopeApplication,
		SupportLeaseID: "lease-a",
		Permissions: map[authz.Permission]struct{}{
			authz.PermissionTenantsCreate: {},
		},
	}}

	app := fiber.New()
	app.Post("/tenants", requireApplicationPermission(Dependencies{ActorStore: store}, authz.PermissionTenantsCreate), func(c fiber.Ctx) error {
		return c.SendStatus(fiber.StatusNoContent)
	})

	req := httptest.NewRequest(fiber.MethodPost, "/tenants", nil)
	req.Header.Set(authz.HeaderActorID, "application-admin")
	req.Header.Set(authz.HeaderTenantID, "tenant-a")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusForbidden {
		t.Fatalf("expected leased Application context to be denied global control-plane action, got %d", resp.StatusCode)
	}
}

func TestRequireTenantPermissionAllowsApplicationControlPlaneTenantMetadata(t *testing.T) {
	store := fakeActorStore{actor: &authz.Actor{
		ID:       "application-admin",
		TenantID: authz.GlobalTenantScope,
		Scope:    authz.ActorScopeApplication,
		Permissions: map[authz.Permission]struct{}{
			authz.PermissionTenantsRead: {},
		},
	}}

	app := fiber.New()
	app.Get("/tenants/:id", requireTenantPermission(Dependencies{ActorStore: store}, authz.PermissionTenantsRead, "id"), func(c fiber.Ctx) error {
		return c.SendStatus(fiber.StatusNoContent)
	})

	req := httptest.NewRequest(fiber.MethodGet, "/tenants/tenant-b", nil)
	req.Header.Set(authz.HeaderActorID, "application-admin")
	req.Header.Set(authz.HeaderTenantID, authz.GlobalTenantScope)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusNoContent {
		t.Fatalf("expected control-plane tenant metadata read 204, got %d", resp.StatusCode)
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

func TestAuthenticatedAccountKeepsSessionWhenSelectedTenantActorIsUnavailable(t *testing.T) {
	store := &accountActorRouteStore{
		fakeActorStore: fakeActorStore{},
		accountErr:     authz.ErrTenantActorUnavailable,
	}
	deps := Dependencies{ActorStore: store, ActorHeaderMode: actorHeaderModeDisabled}

	app := fiber.New()
	app.Use(func(c fiber.Ctx) error {
		authentication.SetSessionContext(c, authentication.SessionResponse{AccountID: "account-1"})
		return c.Next()
	})
	app.Use(authorizationMiddleware(deps))
	app.Get("/protected", requirePermission(deps, authz.PermissionPeopleRead), func(c fiber.Ctx) error {
		return c.SendStatus(fiber.StatusNoContent)
	})

	req := httptest.NewRequest(fiber.MethodGet, "/protected", nil)
	req.Header.Set(authz.HeaderTenantID, "tenant-a")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusForbidden {
		t.Fatalf("expected tenant-scoped 403 without ending the Account session, got %d", resp.StatusCode)
	}
	if store.accountID != "account-1" || store.tenantID != "tenant-a" {
		t.Fatalf("expected Account-owned Actor lookup, account=%q tenant=%q", store.accountID, store.tenantID)
	}
	var body struct {
		Error struct {
			Code string `json:"code"`
		} `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if body.Error.Code != "tenant_actor_unavailable" {
		t.Fatalf("expected tenant_actor_unavailable, got %q", body.Error.Code)
	}
}

func TestAuthenticatedGlobalAccountResolvesOnlyControlPlaneContext(t *testing.T) {
	store := &accountActorRouteStore{fakeActorStore: fakeActorStore{actor: &authz.Actor{
		ID:        "application-admin",
		RecordID:  "actor-application-admin",
		TenantID:  authz.GlobalTenantScope,
		Scope:     authz.ActorScopeApplication,
		RoleCodes: []string{string(authz.RoleApplicationAdmin)},
		Permissions: map[authz.Permission]struct{}{
			authz.PermissionTenantsRead: {},
		},
	}}}
	deps := Dependencies{ActorStore: store, ActorHeaderMode: actorHeaderModeDisabled}

	app := fiber.New()
	app.Use(func(c fiber.Ctx) error {
		authentication.SetSessionContext(c, authentication.SessionResponse{AccountID: "application-account"})
		return c.Next()
	})
	app.Use(authorizationMiddleware(deps))
	app.Get("/control-plane", requireApplicationPermission(deps, authz.PermissionTenantsRead), func(c fiber.Ctx) error {
		actor, err := authz.RequestActorFromContext(c)
		if err != nil {
			return err
		}
		if actor.Scope != authz.ActorScopeApplication || actor.TenantID != authz.GlobalTenantScope {
			t.Fatalf("unexpected GLOBAL control-plane actor: %#v", actor)
		}
		return c.SendStatus(fiber.StatusNoContent)
	})

	req := httptest.NewRequest(fiber.MethodGet, "/control-plane", nil)
	req.Header.Set(authz.HeaderTenantID, authz.GlobalTenantScope)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusNoContent {
		t.Fatalf("expected 204, got %d", resp.StatusCode)
	}
	if store.accountID != "application-account" || store.tenantID != authz.GlobalTenantScope {
		t.Fatalf("expected Account control-plane lookup, account=%q context=%q", store.accountID, store.tenantID)
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
		TenantID: authz.GlobalTenantScope,
		Scope:    authz.ActorScopeApplication,
		Permissions: map[authz.Permission]struct{}{
			authz.PermissionAuthzManage: {},
		},
	}}
	deps := Dependencies{
		ActorStore:        store,
		ActorHeaderMode:   actorHeaderModeBootstrap,
		BootstrapActorKey: "bootstrap-admin",
	}
	app := fiber.New()
	app.Use(authorizationMiddleware(deps))
	app.Get("/protected", requirePermission(deps, authz.PermissionAuthzManage), func(c fiber.Ctx) error {
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
		req.Header.Set(authz.HeaderTenantID, authz.GlobalTenantScope)
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
		TenantID: authz.GlobalTenantScope,
		Scope:    authz.ActorScopeApplication,
		Permissions: map[authz.Permission]struct{}{
			authz.PermissionAuthzManage: {},
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
		app.Get("/protected", requirePermission(deps, authz.PermissionAuthzManage), func(c fiber.Ctx) error {
			return c.SendStatus(fiber.StatusNoContent)
		})

		req := httptest.NewRequest(fiber.MethodGet, "/protected", nil)
		req.Header.Set(authz.HeaderActorID, "bootstrap-admin")
		req.Header.Set(authz.HeaderTenantID, authz.GlobalTenantScope)
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
