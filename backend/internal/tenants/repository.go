package tenants

import (
	"context"

	"enterpriseremotesystems/backend/internal/db"
	"gorm.io/gorm"
)

type TenantRecord struct {
	Tenant                     db.Tenant
	TenantAdminCount           int64
	TenantAdminAssignmentCount int64
}

type TenantAdminCandidateRecord struct {
	ActorID                            string
	ActorKey                           string
	DisplayName                        string
	GlobalPersonID                     string
	PersonName                         string
	PersonNickname                     string
	AccountLogin                       string
	Active                             bool
	Assigned                           bool
	Eligible                           bool
	IneligibilityReason                string
	HasDelegatedAuthorityInOtherTenant bool
}

type Repository interface {
	List(ctx context.Context) ([]TenantRecord, error)
	FindByID(ctx context.Context, id string) (*TenantRecord, error)
	CodeExists(ctx context.Context, code string, excludeID string) (bool, error)
	// Create inserts and seeds the Tenant. When provisionFirstAdministrator is
	// non-nil it runs in the same transaction and the returned Actor is
	// assigned as Tenant Administrator before commit.
	Create(ctx context.Context, tenant *db.Tenant, provisionFirstAdministrator func(tx *gorm.DB) (string, error)) error
	Update(ctx context.Context, tenant *db.Tenant) error
	SetActive(ctx context.Context, tenantID string, active bool) error
	ExistsByID(ctx context.Context, id string) (bool, error)
	ExistsActiveByID(ctx context.Context, id string) (bool, error)
	ListTenantAdminCandidates(ctx context.Context, tenantID string) ([]TenantAdminCandidateRecord, error)
	AssignTenantAdmin(ctx context.Context, tenantID string, actorID string) error
	RevokeTenantAdmin(ctx context.Context, tenantID string, actorID string) error
}
