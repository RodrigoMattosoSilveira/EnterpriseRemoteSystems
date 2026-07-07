package authz

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"gorm.io/gorm"
)

const GlobalTenantScope = "*"

const (
	RoleApplicationAdmin RoleCode = "APPLICATION_ADMIN"
	RoleTenantAdmin      RoleCode = "TENANT_ADMIN"
	RoleEarningsOperator RoleCode = "EARNINGS_OPERATOR"
	RoleExpenseOperator  RoleCode = "EXPENSE_OPERATOR"
	RolePerson           RoleCode = "PERSON"
)

type RoleCode string

type ActorLookup struct {
	ActorID  string
	TenantID string
}

type ActorStore interface {
	FindActor(ctx context.Context, lookup ActorLookup) (*Actor, error)
}

type GORMStore struct {
	database *gorm.DB
}

func NewGORMStore(database *gorm.DB) *GORMStore {
	return &GORMStore{database: database}
}

func ResolveActor(ctx context.Context, store ActorStore, get HeaderGetter) (*Actor, error) {
	extracted, err := ExtractActor(get)
	if err != nil {
		return nil, err
	}
	if extracted.Source != ActorSourceHeaderActorID || store == nil {
		return extracted, nil
	}

	actor, err := store.FindActor(ctx, ActorLookup{ActorID: extracted.ID, TenantID: extracted.TenantID})
	if err != nil {
		if errors.Is(err, ErrMissingActor) && len(extracted.Permissions) > 0 {
			return extracted, nil
		}
		return nil, err
	}
	actor.Source = ActorSourcePersisted
	return actor, nil
}

func (s *GORMStore) FindActor(ctx context.Context, lookup ActorLookup) (*Actor, error) {
	if s == nil || s.database == nil || strings.TrimSpace(lookup.ActorID) == "" {
		return nil, ErrMissingActor
	}

	actorKey := strings.TrimSpace(lookup.ActorID)
	tenantID := strings.TrimSpace(lookup.TenantID)
	if tenantID == "" {
		return nil, ErrMissingActor
	}

	var actorRow AuthzActor
	result := s.database.WithContext(ctx).
		Where("actor_key = ? AND active = ?", actorKey, true).
		Limit(1).
		Find(&actorRow)
	if result.Error != nil {
		return nil, fmt.Errorf("find authorization actor: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return nil, ErrMissingActor
	}

	grantQuery := s.database.WithContext(ctx).
		Model(&AuthzActorRoleGrant{}).
		Joins("JOIN authz_roles ON authz_roles.id = authz_actor_role_grants.role_id AND authz_roles.active = ?", true).
		Where("authz_actor_role_grants.actor_id = ? AND authz_actor_role_grants.active = ?", actorRow.ID, true)
	if tenantID != "" {
		grantQuery = grantQuery.Where("authz_actor_role_grants.tenant_id IN ?", []string{tenantID, GlobalTenantScope})
	}

	type grantProjection struct {
		RoleID    string
		RoleCode  string
		ScopeType string
		TenantID  string
	}
	var grants []grantProjection
	if err := grantQuery.Select("authz_roles.id AS role_id, authz_roles.code AS role_code, authz_roles.scope_type AS scope_type, authz_actor_role_grants.tenant_id AS tenant_id").
		Scan(&grants).Error; err != nil {
		return nil, fmt.Errorf("find authorization grants: %w", err)
	}

	permissions := map[Permission]struct{}{}
	roles := make([]string, 0, len(grants))
	scope := ActorScope("")
	resolvedTenantID := tenantID
	for _, grant := range grants {
		roles = append(roles, grant.RoleCode)
		if resolvedTenantID == "" && grant.TenantID != GlobalTenantScope {
			resolvedTenantID = grant.TenantID
		}
		scope = strongestScope(scope, ActorScope(grant.ScopeType))

		var permissionRows []AuthzRolePermission
		if err := s.database.WithContext(ctx).
			Where("role_id = ?", grant.RoleID).
			Find(&permissionRows).Error; err != nil {
			return nil, fmt.Errorf("find authorization permissions: %w", err)
		}
		for _, row := range permissionRows {
			permissions[Permission(row.PermissionCode)] = struct{}{}
		}
	}

	sort.Strings(roles)

	return &Actor{
		ID:             actorRow.ActorKey,
		RecordID:       actorRow.ID,
		TenantID:       resolvedTenantID,
		PersonID:       stringValue(actorRow.PersonID),
		CollaboratorID: stringValue(actorRow.CollaboratorID),
		Source:         ActorSourcePersisted,
		Scope:          scope,
		RoleCodes:      roles,
		Permissions:    permissions,
	}, nil
}

func AutoMigrate(database *gorm.DB) error {
	if err := database.AutoMigrate(&AuthzActor{}, &AuthzRole{}, &AuthzPermission{}, &AuthzRolePermission{}, &AuthzActorRoleGrant{}, &AuthzAuditLog{}); err != nil {
		return err
	}
	return EnsureAuditLogImmutability(database)
}

func EnsureAuditLogImmutability(database *gorm.DB) error {
	if database == nil {
		return nil
	}
	statements := []string{
		`CREATE TRIGGER IF NOT EXISTS trg_authz_audit_logs_no_update
BEFORE UPDATE ON authz_audit_logs
BEGIN
  SELECT RAISE(ABORT, 'authz_audit_logs are immutable; append a new audit event instead');
END`,
		`CREATE TRIGGER IF NOT EXISTS trg_authz_audit_logs_no_delete
BEFORE DELETE ON authz_audit_logs
BEGIN
  SELECT RAISE(ABORT, 'authz_audit_logs are immutable; append a new audit event instead');
END`,
	}
	for _, statement := range statements {
		if err := database.Exec(statement).Error; err != nil {
			return fmt.Errorf("install authorization audit immutability guard: %w", err)
		}
	}
	return nil
}

func SeedAuthorizationCatalog(database *gorm.DB) error {
	now := time.Now().UTC()

	permissions := PermissionCatalog()
	for _, permission := range permissions {
		row := AuthzPermission{Code: string(permission.Permission), Label: permission.Label, Description: permission.Description, CreatedAt: now, UpdatedAt: now}
		if err := database.Where("code = ?", row.Code).FirstOrCreate(&row).Error; err != nil {
			return fmt.Errorf("seed permission %s: %w", row.Code, err)
		}
	}

	roles := []AuthzRole{
		{ID: "authz-role-application-admin", Code: string(RoleApplicationAdmin), Label: "Application Administrator", Description: "CRU all records across all tenants.", ScopeType: string(ActorScopeApplication), Active: true, CreatedAt: now, UpdatedAt: now},
		{ID: "authz-role-tenant-admin", Code: string(RoleTenantAdmin), Label: "Tenant Administrator", Description: "CRU all records for the assigned tenant.", ScopeType: string(ActorScopeTenant), Active: true, CreatedAt: now, UpdatedAt: now},
		{ID: "authz-role-earnings-operator", Code: string(RoleEarningsOperator), Label: "Earnings Operator", Description: "Planning and earning operations for the assigned tenant.", ScopeType: string(ActorScopeTenant), Active: true, CreatedAt: now, UpdatedAt: now},
		{ID: "authz-role-expense-operator", Code: string(RoleExpenseOperator), Label: "Expense Operator", Description: "Expense, price list, current account summary, and receipt operations for the assigned tenant.", ScopeType: string(ActorScopeTenant), Active: true, CreatedAt: now, UpdatedAt: now},
		{ID: "authz-role-person", Code: string(RolePerson), Label: "Person", Description: "Self-service read/update access for a person and linked collaborator records.", ScopeType: string(ActorScopeSelf), Active: true, CreatedAt: now, UpdatedAt: now},
	}
	for _, role := range roles {
		if err := database.Where("id = ?", role.ID).FirstOrCreate(&role).Error; err != nil {
			return fmt.Errorf("seed role %s: %w", role.Code, err)
		}
	}

	rolePermissions := map[RoleCode][]Permission{
		RoleApplicationAdmin: {PermissionAll},
		RoleTenantAdmin:      {PermissionAll},
		RoleEarningsOperator: {
			PermissionTenantsRead, PermissionReferenceDataRead,
			PermissionCollaboratorsRead,
			PermissionPlanningRead, PermissionPlanningCreate, PermissionPlanningUpdate,
			PermissionEarningsRead, PermissionEarningsCreate,
			PermissionCurrentAccountsSummaryRead,
		},
		RoleExpenseOperator: {
			PermissionTenantsRead, PermissionReferenceDataRead,
			PermissionCollaboratorsRead,
			PermissionPriceListsRead, PermissionPriceListsCreate, PermissionPriceListsUpdate,
			PermissionCurrentAccountsSummaryRead,
			PermissionExpensesRead, PermissionExpensesCreate,
			PermissionLedgerReceiptsRead, PermissionLedgerReceiptsCreate, PermissionLedgerReceiptsPrint, PermissionLedgerReceiptsReturn,
		},
		RolePerson: {
			PermissionTenantsRead, PermissionReferenceDataRead,
			PermissionPeopleSelfRead, PermissionPeopleSelfUpdate,
			PermissionCollaboratorsSelfRead,
			PermissionCurrentAccountsSelfSummaryRead, PermissionCurrentAccountsSelfLedgerRead,
			PermissionAssignmentsSelfCurrentRead,
			PermissionLedgerReceiptsSelfRead,
		},
	}

	roleIDs := map[RoleCode]string{
		RoleApplicationAdmin: "authz-role-application-admin",
		RoleTenantAdmin:      "authz-role-tenant-admin",
		RoleEarningsOperator: "authz-role-earnings-operator",
		RoleExpenseOperator:  "authz-role-expense-operator",
		RolePerson:           "authz-role-person",
	}
	for roleCode, grantedPermissions := range rolePermissions {
		roleID := roleIDs[roleCode]
		for _, permission := range grantedPermissions {
			row := AuthzRolePermission{RoleID: roleID, PermissionCode: string(permission), CreatedAt: now}
			if err := database.Where("role_id = ? AND permission_code = ?", roleID, string(permission)).FirstOrCreate(&row).Error; err != nil {
				return fmt.Errorf("seed role permission %s/%s: %w", roleCode, permission, err)
			}
		}
	}

	return nil
}

func GrantRole(database *gorm.DB, actorID string, role RoleCode, tenantID string) error {
	if strings.TrimSpace(actorID) == "" || strings.TrimSpace(string(role)) == "" {
		return ErrMissingActor
	}
	if strings.TrimSpace(tenantID) == "" {
		tenantID = GlobalTenantScope
	}

	var roleRow AuthzRole
	if err := database.Where("code = ? AND active = ?", string(role), true).First(&roleRow).Error; err != nil {
		return fmt.Errorf("find role %s: %w", role, err)
	}

	now := time.Now().UTC()
	grant := AuthzActorRoleGrant{ID: fmt.Sprintf("authz-grant-%s-%s-%s", actorID, roleRow.Code, tenantID), ActorID: actorID, RoleID: roleRow.ID, TenantID: tenantID, Active: true, CreatedAt: now, UpdatedAt: now}
	if err := database.Where("actor_id = ? AND role_id = ? AND tenant_id = ?", actorID, roleRow.ID, tenantID).FirstOrCreate(&grant).Error; err != nil {
		return fmt.Errorf("grant role %s: %w", role, err)
	}
	return nil
}

type PermissionCatalogEntry struct {
	Permission  Permission
	Label       string
	Description string
}

func PermissionCatalog() []PermissionCatalogEntry {
	return []PermissionCatalogEntry{
		{PermissionAll, "All permissions", "Wildcard permission for application and tenant administrators."},
		{PermissionAuthzRead, "Read authorization administration", "Read authorization actors, roles, permissions, and grants."},
		{PermissionAuthzManage, "Manage authorization administration", "Create authorization actors and manage role grants."},
		{PermissionTenantsRead, "Read tenants", "Read tenant records."},
		{PermissionTenantsCreate, "Create tenants", "Create tenant records."},
		{PermissionTenantsUpdate, "Update tenants", "Update tenant records."},
		{PermissionPeopleRead, "Read people", "Read tenant person records."},
		{PermissionPeopleCreate, "Create people", "Create tenant person records."},
		{PermissionPeopleUpdate, "Update people", "Update tenant person records."},
		{PermissionPeopleSelfRead, "Read own person", "Read the actor's own person record."},
		{PermissionPeopleSelfUpdate, "Update own person", "Update the actor's own person record."},
		{PermissionCollaboratorsRead, "Read collaborators", "Read tenant collaborator records."},
		{PermissionCollaboratorsCreate, "Create collaborators", "Create tenant collaborator records."},
		{PermissionCollaboratorsUpdate, "Update collaborators", "Update tenant collaborator records."},
		{PermissionCollaboratorsSelfRead, "Read own collaborator", "Read the actor's linked collaborator record."},
		{PermissionPlanningRead, "Read planning", "Read tenant planning records."},
		{PermissionPlanningCreate, "Create planning", "Create tenant planning records."},
		{PermissionPlanningUpdate, "Update planning", "Update tenant planning records."},
		{PermissionEarningsRead, "Read earnings", "Read tenant earning records."},
		{PermissionEarningsCreate, "Create earnings", "Create tenant earning records."},
		{PermissionEarningsUpdate, "Update earnings", "Update tenant earning records."},
		{PermissionPriceListsRead, "Read price lists", "Read tenant price list records."},
		{PermissionPriceListsCreate, "Create price lists", "Create tenant price list records."},
		{PermissionPriceListsUpdate, "Update price lists", "Update tenant price list records."},
		{PermissionReferenceDataRead, "Read reference data", "Read tenant reference data records."},
		{PermissionReferenceDataManage, "Manage reference data", "Create, update, deactivate, and reactivate tenant reference data records."},
		{PermissionExpensesRead, "Read expenses", "Read tenant expense records."},
		{PermissionExpensesCreate, "Create expenses", "Create tenant expense records."},
		{PermissionExpensesUpdate, "Update expenses", "Update tenant expense records."},
		{PermissionCurrentAccountsSummaryRead, "Read current account summary", "Read tenant collaborator current account summaries."},
		{PermissionCurrentAccountsLedgerRead, "Read current account ledger", "Read tenant collaborator current account ledger records."},
		{PermissionCurrentAccountsLedgerCreate, "Create current account ledger", "Create tenant current account ledger records."},
		{PermissionCurrentAccountsSettingsRead, "Read current account settings", "Read tenant current account policy settings."},
		{PermissionCurrentAccountsSettingsUpdate, "Update current account settings", "Update tenant current account policy settings."},
		{PermissionCurrentAccountsSelfSummaryRead, "Read own current account summary", "Read the actor's own current account summary."},
		{PermissionCurrentAccountsSelfLedgerRead, "Read own current account ledger", "Read the actor's own current account ledger records."},
		{PermissionAssignmentsSelfCurrentRead, "Read own current assignment", "Read the actor's current assignment."},
		{PermissionLedgerReceiptsRead, "Read receipts", "Read tenant receipt records."},
		{PermissionLedgerReceiptsCreate, "Create receipts", "Create tenant receipt records."},
		{PermissionLedgerReceiptsPrint, "Print receipts", "Mark tenant receipts as printed."},
		{PermissionLedgerReceiptsReturn, "Return receipts", "Record signed and returned tenant receipts."},
		{PermissionLedgerReceiptsBackfill, "Backfill receipts", "Backfill missing tenant receipt obligations."},
		{PermissionLedgerReceiptsSelfRead, "Read own receipts", "Read the actor's own receipt records."},
		{PermissionLedgerCorrectionsCreate, "Create ledger corrections", "Create tenant ledger correction records."},
		{PermissionJourneySettlementsPreview, "Preview journey settlements", "Preview tenant journey settlements."},
		{PermissionJourneySettlementsZeroGold, "Zero Gold settlement", "Post tenant Zero Gold settlements."},
		{PermissionJourneySettlementsPartialPayout, "Partial payout settlement", "Post tenant partial payout settlements."},
		{PermissionJourneySettlementsClose, "Close journey", "Close tenant journeys."},
	}
}

func stringValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func strongestScope(current, next ActorScope) ActorScope {
	if current == ActorScopeApplication || next == ActorScopeApplication {
		return ActorScopeApplication
	}
	if current == ActorScopeTenant || next == ActorScopeTenant {
		return ActorScopeTenant
	}
	if current == ActorScopeSelf || next == ActorScopeSelf {
		return ActorScopeSelf
	}
	return next
}
