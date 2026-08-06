package tenantctx

import (
	"context"
	"testing"

	"enterpriseremotesystems/backend/internal/tenants"
)

func TestTenantID(t *testing.T) {
	if got := TenantID(context.Background()); got != tenants.DefaultTenantID {
		t.Fatalf("expected default tenant fallback, got %q", got)
	}
	if got := TenantID(WithTenantID(context.Background(), " tenant-selected ")); got != "tenant-selected" {
		t.Fatalf("expected selected tenant, got %q", got)
	}
}
