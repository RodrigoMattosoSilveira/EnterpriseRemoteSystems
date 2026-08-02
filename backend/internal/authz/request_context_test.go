package authz

import (
	"context"
	"errors"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"
)

type requestContextActorStore struct {
	actor   *Actor
	err     error
	lookups int
}

func (s *requestContextActorStore) FindActor(_ context.Context, _ ActorLookup) (*Actor, error) {
	s.lookups++
	if s.err != nil {
		return nil, s.err
	}
	return s.actor, nil
}

func TestResolveRequestActorPrefersAuthoritativeContextActor(t *testing.T) {
	store := &requestContextActorStore{actor: &Actor{ID: "spoofed-header-actor"}}
	app := fiber.New()
	app.Get("/", func(c fiber.Ctx) error {
		SetRequestActor(c, &Actor{
			ID:       "session-actor",
			RecordID: "actor-record-1",
			TenantID: "tenant-a",
			Source:   ActorSourceAuthenticatedSession,
		})

		actor, err := ResolveRequestActor(c, store)
		if err != nil {
			t.Fatalf("resolve request actor: %v", err)
		}
		if actor.ID != "session-actor" || actor.Source != ActorSourceAuthenticatedSession {
			t.Fatalf("expected authoritative session actor, got %#v", actor)
		}
		if store.lookups != 0 {
			t.Fatalf("expected no header-store lookup, got %d", store.lookups)
		}
		return c.SendStatus(fiber.StatusNoContent)
	})

	req := httptest.NewRequest(fiber.MethodGet, "/", nil)
	req.Header.Set(HeaderActorID, "spoofed-header-actor")
	req.Header.Set(HeaderTenantID, "tenant-a")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusNoContent {
		t.Fatalf("expected 204, got %d", resp.StatusCode)
	}
}

func TestResolveRequestActorPreservesStoredResolutionError(t *testing.T) {
	store := &requestContextActorStore{actor: &Actor{ID: "header-actor"}}
	app := fiber.New()
	app.Get("/", func(c fiber.Ctx) error {
		SetRequestActorError(c, ErrAuthenticationRequired)

		actor, err := ResolveRequestActor(c, store)
		if actor != nil || !errors.Is(err, ErrAuthenticationRequired) {
			t.Fatalf("expected stored authentication error, actor=%#v err=%v", actor, err)
		}
		if store.lookups != 0 {
			t.Fatalf("expected no fallback lookup, got %d", store.lookups)
		}
		return c.SendStatus(fiber.StatusNoContent)
	})

	req := httptest.NewRequest(fiber.MethodGet, "/", nil)
	req.Header.Set(HeaderActorID, "header-actor")
	req.Header.Set(HeaderTenantID, "tenant-a")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusNoContent {
		t.Fatalf("expected 204, got %d", resp.StatusCode)
	}
}

func TestResolveRequestActorFallsBackForIsolatedHandlerTestsAndCachesActor(t *testing.T) {
	store := &requestContextActorStore{actor: &Actor{
		ID:       "persisted-actor",
		RecordID: "actor-record-2",
		TenantID: "tenant-a",
		Source:   ActorSourcePersisted,
	}}
	app := fiber.New()
	app.Get("/", func(c fiber.Ctx) error {
		first, err := ResolveRequestActor(c, store)
		if err != nil {
			t.Fatalf("first resolve: %v", err)
		}
		second, err := ResolveRequestActor(c, store)
		if err != nil {
			t.Fatalf("second resolve: %v", err)
		}
		if first != second {
			t.Fatal("expected cached request actor instance")
		}
		if store.lookups != 1 {
			t.Fatalf("expected one persisted lookup, got %d", store.lookups)
		}
		return c.SendStatus(fiber.StatusNoContent)
	})

	req := httptest.NewRequest(fiber.MethodGet, "/", nil)
	req.Header.Set(HeaderActorID, "persisted-actor")
	req.Header.Set(HeaderTenantID, "tenant-a")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusNoContent {
		t.Fatalf("expected 204, got %d", resp.StatusCode)
	}
}

func TestRequestActorIDPrefersAuthoritativeContextActor(t *testing.T) {
	app := fiber.New()
	app.Get("/", func(c fiber.Ctx) error {
		SetRequestActor(c, &Actor{
			ID:       "session-actor",
			RecordID: "actor-record-3",
			Source:   ActorSourceAuthenticatedSession,
		})

		if got := RequestActorID(c, "request-body-actor"); got != "session-actor" {
			t.Fatalf("expected authoritative session actor key, got %q", got)
		}
		return c.SendStatus(fiber.StatusNoContent)
	})

	resp, err := app.Test(httptest.NewRequest(fiber.MethodGet, "/", nil))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusNoContent {
		t.Fatalf("expected 204, got %d", resp.StatusCode)
	}
}

func TestRequestActorIDUsesFallbackOnlyWhenMiddlewareContextIsAbsent(t *testing.T) {
	app := fiber.New()
	app.Get("/", func(c fiber.Ctx) error {
		if got := RequestActorID(c, "  isolated-test-actor  "); got != "isolated-test-actor" {
			t.Fatalf("expected trimmed isolated-test fallback, got %q", got)
		}

		SetRequestActorError(c, ErrAuthenticationRequired)
		if got := RequestActorID(c, "spoofed-request-actor"); got != "" {
			t.Fatalf("expected stored authentication error to suppress fallback, got %q", got)
		}
		return c.SendStatus(fiber.StatusNoContent)
	})

	resp, err := app.Test(httptest.NewRequest(fiber.MethodGet, "/", nil))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	if resp.StatusCode != fiber.StatusNoContent {
		t.Fatalf("expected 204, got %d", resp.StatusCode)
	}
}
