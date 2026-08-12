package requesttenant

import (
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"

	"enterpriseremotesystems/backend/internal/authz"
	"enterpriseremotesystems/backend/internal/shared/tenantctx"
	"enterpriseremotesystems/backend/internal/tenants"
)

func TestContextUsesAuthoritativeActorTenant(t *testing.T) {
	app := fiber.New()
	app.Get("/", func(c fiber.Ctx) error {
		authz.SetRequestActor(c, &authz.Actor{
			ID:       "application-admin",
			TenantID: "tenant-selected",
		})
		if got := tenantctx.TenantID(Context(c)); got != "tenant-selected" {
			t.Fatalf("expected authoritative actor tenant, got %q", got)
		}
		return c.SendStatus(fiber.StatusNoContent)
	})

	req := httptest.NewRequest(fiber.MethodGet, "/", nil)
	req.Header.Set("X-Tenant-ID", "tenant-spoofed")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != fiber.StatusNoContent {
		t.Fatalf("expected 204, got %d", resp.StatusCode)
	}
}

func TestContextRetainsIsolatedHandlerFallbacks(t *testing.T) {
	app := fiber.New()
	app.Get("/header", func(c fiber.Ctx) error {
		if got := tenantctx.TenantID(Context(c)); got != "tenant-header" {
			t.Fatalf("expected header tenant fallback, got %q", got)
		}
		return c.SendStatus(fiber.StatusNoContent)
	})
	app.Get("/default", func(c fiber.Ctx) error {
		if got := tenantctx.TenantID(Context(c)); got != tenants.DefaultTenantID {
			t.Fatalf("expected default tenant fallback, got %q", got)
		}
		return c.SendStatus(fiber.StatusNoContent)
	})

	headerReq := httptest.NewRequest(fiber.MethodGet, "/header", nil)
	headerReq.Header.Set("X-Tenant-ID", "tenant-header")
	if _, err := app.Test(headerReq); err != nil {
		t.Fatal(err)
	}

	defaultReq := httptest.NewRequest(fiber.MethodGet, "/default", nil)
	if _, err := app.Test(defaultReq); err != nil {
		t.Fatal(err)
	}
}
