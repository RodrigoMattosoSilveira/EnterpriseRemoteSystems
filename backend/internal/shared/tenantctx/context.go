package tenantctx

import (
	"context"
	"strings"

	"enterpriseremotesystems/backend/internal/tenants"
)

type tenantIDKey struct{}

// WithTenantID returns a context carrying the authoritative tenant selected for
// the request. Empty tenant IDs retain the historical default-tenant behavior
// used by isolated service and repository tests.
func WithTenantID(ctx context.Context, tenantID string) context.Context {
	if ctx == nil {
		ctx = context.Background()
	}
	trimmed := strings.TrimSpace(tenantID)
	if trimmed == "" {
		trimmed = tenants.DefaultTenantID
	}
	return context.WithValue(ctx, tenantIDKey{}, trimmed)
}

// TenantID returns the request tenant or the historical default tenant when a
// caller executes outside the normal authenticated HTTP request path.
func TenantID(ctx context.Context) string {
	if ctx != nil {
		if value, ok := ctx.Value(tenantIDKey{}).(string); ok {
			if trimmed := strings.TrimSpace(value); trimmed != "" {
				return trimmed
			}
		}
	}
	return tenants.DefaultTenantID
}
