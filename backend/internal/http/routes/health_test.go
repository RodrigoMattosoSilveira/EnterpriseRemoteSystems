package routes

import (
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"

	"enterpriseremotesystems/backend/internal/authz"
)

func TestPublicHealthFastPathBypassesRouteAuthorization(t *testing.T) {
	calls := 0
	store := fakeActorStore{err: authz.ErrMissingActor, calls: &calls}
	app := fiber.New()
	Register(app, Dependencies{ActorStore: store})

	for _, path := range []string{"/healthz", "/healthz/", "/api/v1/healthz", "/api/v1/healthz/"} {
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
