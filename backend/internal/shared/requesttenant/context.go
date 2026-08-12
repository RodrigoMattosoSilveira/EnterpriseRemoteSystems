package requesttenant

import (
	"context"
	"strings"

	"github.com/gofiber/fiber/v3"

	"enterpriseremotesystems/backend/internal/authz"
	"enterpriseremotesystems/backend/internal/shared/tenantctx"
	"enterpriseremotesystems/backend/internal/tenants"
)

// Context returns the Fiber request context enriched with the tenant already
// resolved by authentication and authorization middleware. The header and
// default fallbacks exist only for isolated handler tests that intentionally
// execute without the normal route middleware.
func Context(c fiber.Ctx) context.Context {
	tenantID := tenants.DefaultTenantID
	if actor, err := authz.RequestActorFromContext(c); err == nil && actor != nil {
		if selected := strings.TrimSpace(actor.TenantID); selected != "" {
			tenantID = selected
		}
	} else if selected := strings.TrimSpace(c.Get("X-Tenant-ID")); selected != "" {
		tenantID = selected
	}
	return tenantctx.WithTenantID(c.Context(), tenantID)
}
