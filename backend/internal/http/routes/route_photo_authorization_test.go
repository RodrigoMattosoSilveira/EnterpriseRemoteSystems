package routes

import (
	"net/http/httptest"
	"testing"

	"enterpriseremotesystems/backend/internal/authz"

	"github.com/gofiber/fiber/v3"
)

// photoGuardApp mounts the real photo guard for PUT and DELETE, so both verbs are exercised
// through the same authorization rule the production routes use.
func photoGuardApp(store fakeActorStore) *fiber.App {
	app := fiber.New()
	guard := requireTenantAdministratorOrSelfPerson(Dependencies{ActorStore: store}, authz.PermissionPeopleSelfUpdate, "id")
	ok := func(c fiber.Ctx) error { return c.SendStatus(fiber.StatusNoContent) }
	app.Put("/people/:id/photo", guard, ok)
	app.Delete("/people/:id/photo", guard, ok)
	return app
}

func photoRequest(t *testing.T, app *fiber.App, method, path, actorID string) int {
	t.Helper()
	req := httptest.NewRequest(method, path, nil)
	req.Header.Set(authz.HeaderActorID, actorID)
	req.Header.Set(authz.HeaderTenantID, "default")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("%s %s: %v", method, path, err)
	}
	return resp.StatusCode
}

// Collaborator deletion through the guard: own photo may be deleted, another Person's may not.
func TestPhotoGuardDeleteAllowsOwnPersonOnly(t *testing.T) {
	selfActor := &authz.Actor{
		ID: "collaborator-actor", TenantID: "default", PersonID: "person-self", Scope: authz.ActorScopeTenant,
		Permissions:          map[authz.Permission]struct{}{authz.PermissionPeopleSelfUpdate: {}},
		IntrinsicPermissions: map[authz.Permission]struct{}{authz.PermissionPeopleSelfUpdate: {}},
	}
	app := photoGuardApp(fakeActorStore{actor: selfActor})

	if got := photoRequest(t, app, fiber.MethodDelete, "/people/person-self/photo", "collaborator-actor"); got != fiber.StatusNoContent {
		t.Fatalf("own photo DELETE: expected 204, got %d", got)
	}
	if got := photoRequest(t, app, fiber.MethodDelete, "/people/person-other/photo", "collaborator-actor"); got != fiber.StatusForbidden {
		t.Fatalf("another Person's photo DELETE: expected 403, got %d", got)
	}
}

// Other Person denial: both PUT and DELETE are rejected for a different Person.
func TestPhotoGuardRejectsPutAndDeleteForAnotherPerson(t *testing.T) {
	selfActor := &authz.Actor{
		ID: "collaborator-actor", TenantID: "default", PersonID: "person-self", Scope: authz.ActorScopeTenant,
		Permissions:          map[authz.Permission]struct{}{authz.PermissionPeopleSelfUpdate: {}},
		IntrinsicPermissions: map[authz.Permission]struct{}{authz.PermissionPeopleSelfUpdate: {}},
	}
	app := photoGuardApp(fakeActorStore{actor: selfActor})

	if got := photoRequest(t, app, fiber.MethodPut, "/people/person-other/photo", "collaborator-actor"); got != fiber.StatusForbidden {
		t.Fatalf("another Person's photo PUT: expected 403, got %d", got)
	}
	if got := photoRequest(t, app, fiber.MethodDelete, "/people/person-other/photo", "collaborator-actor"); got != fiber.StatusForbidden {
		t.Fatalf("another Person's photo DELETE: expected 403, got %d", got)
	}
}

// Intrinsic authorization: a role-delegated people.self.update does not grant photo access,
// neither to the actor's own Person nor to another Person.
func TestPhotoGuardIgnoresRoleDelegatedSelfUpdate(t *testing.T) {
	delegatedActor := &authz.Actor{
		ID: "delegated-actor", TenantID: "default", PersonID: "person-self", Scope: authz.ActorScopeTenant,
		Permissions:          map[authz.Permission]struct{}{authz.PermissionPeopleSelfUpdate: {}},
		IntrinsicPermissions: map[authz.Permission]struct{}{},
		DelegatedPermissions: map[authz.Permission]struct{}{authz.PermissionPeopleSelfUpdate: {}},
	}
	app := photoGuardApp(fakeActorStore{actor: delegatedActor})

	for _, method := range []string{fiber.MethodPut, fiber.MethodDelete} {
		if got := photoRequest(t, app, method, "/people/person-self/photo", "delegated-actor"); got != fiber.StatusForbidden {
			t.Fatalf("%s own photo with role-delegated grant only: expected 403, got %d", method, got)
		}
		if got := photoRequest(t, app, method, "/people/person-other/photo", "delegated-actor"); got != fiber.StatusForbidden {
			t.Fatalf("%s another Person's photo with role-delegated grant: expected 403, got %d", method, got)
		}
	}
}

// Identity consistency: the backend identifies the self Person by PersonID only. An actor
// that carries the Person only as GlobalPersonID is refused, and the frontend mirrors this.
func TestPhotoGuardUsesPersonIDNotGlobalPersonIDForSelf(t *testing.T) {
	globalOnlyActor := &authz.Actor{
		ID: "global-only-actor", TenantID: "default", PersonID: "", GlobalPersonID: "person-self", Scope: authz.ActorScopeTenant,
		Permissions:          map[authz.Permission]struct{}{authz.PermissionPeopleSelfUpdate: {}},
		IntrinsicPermissions: map[authz.Permission]struct{}{authz.PermissionPeopleSelfUpdate: {}},
	}
	app := photoGuardApp(fakeActorStore{actor: globalOnlyActor})

	if got := photoRequest(t, app, fiber.MethodPut, "/people/person-self/photo", "global-only-actor"); got != fiber.StatusForbidden {
		t.Fatalf("PUT with GlobalPersonID-only identity: expected 403, got %d", got)
	}
	if got := photoRequest(t, app, fiber.MethodDelete, "/people/person-self/photo", "global-only-actor"); got != fiber.StatusForbidden {
		t.Fatalf("DELETE with GlobalPersonID-only identity: expected 403, got %d", got)
	}
}
