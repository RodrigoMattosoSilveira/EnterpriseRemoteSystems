package authz

import (
	"context"
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
			PermissionAuthzSelfRead, PermissionTenantsRead, PermissionReferenceDataRead,
			PermissionCollaboratorsRead,
			PermissionPlanningRead, PermissionPlanningCreate, PermissionPlanningUpdate,
			PermissionEarningsRead, PermissionEarningsCreate,
			PermissionCurrentAccountsSummaryRead,
		},
		RoleExpenseOperator: {
			PermissionAuthzSelfRead, PermissionTenantsRead, PermissionReferenceDataRead,
			PermissionCollaboratorsRead,
			PermissionPriceListsRead, PermissionPriceListsCreate, PermissionPriceListsUpdate,
			PermissionCurrentAccountsSummaryRead,
			PermissionExpensesRead, PermissionExpensesCreate,
			PermissionLedgerReceiptsRead, PermissionLedgerReceiptsCreate, PermissionLedgerReceiptsPrint, PermissionLedgerReceiptsReturn,
		},
		RolePerson: {
			PermissionAuthzSelfRead, PermissionTenantsRead, PermissionReferenceDataRead,
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
		{PermissionAuthzSelfRead, "Read own authorization context", "Read the current persisted actor, effective roles, scope, and permissions."},
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

// TenantOption describes an active tenant in which an authenticated actor has
// at least one active role grant. Application-scoped grants apply to every
// active tenant.
type TenantOption struct {
	ID        string   `json:"id"`
	Code      string   `json:"code"`
	Name      string   `json:"name"`
	RoleCodes []string `json:"roleCodes"`
}

type TenantOptionStore interface {
	ListActorTenantOptions(ctx context.Context, actorRecordID string) ([]TenantOption, error)
}

func (s *GORMStore) ListActorTenantOptions(ctx context.Context, actorRecordID string) ([]TenantOption, error) {
	actorRecordID = strings.TrimSpace(actorRecordID)
	if s == nil || s.database == nil || actorRecordID == "" {
		return nil, ErrAuthenticationRequired
	}

	var actor AuthzActor
	result := s.database.WithContext(ctx).
		Where("id = ? AND active = ?", actorRecordID, true).
		Limit(1).
		Find(&actor)
	if result.Error != nil {
		return nil, fmt.Errorf("find tenant-option actor: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return nil, ErrAuthenticationRequired
	}

	type grantProjection struct {
		TenantID string
		RoleCode string
	}
	var grants []grantProjection
	if err := s.database.WithContext(ctx).
		Model(&AuthzActorRoleGrant{}).
		Select("authz_actor_role_grants.tenant_id AS tenant_id, authz_roles.code AS role_code").
		Joins("JOIN authz_roles ON authz_roles.id = authz_actor_role_grants.role_id AND authz_roles.active = ?", true).
		Where("authz_actor_role_grants.actor_id = ? AND authz_actor_role_grants.active = ?", actorRecordID, true).
		Scan(&grants).Error; err != nil {
		return nil, fmt.Errorf("find tenant-option grants: %w", err)
	}

	globalRoles := map[string]struct{}{}
	tenantRoles := map[string]map[string]struct{}{}
	for _, grant := range grants {
		if grant.TenantID == GlobalTenantScope {
			globalRoles[grant.RoleCode] = struct{}{}
			continue
		}
		if tenantRoles[grant.TenantID] == nil {
			tenantRoles[grant.TenantID] = map[string]struct{}{}
		}
		tenantRoles[grant.TenantID][grant.RoleCode] = struct{}{}
	}

	type tenantProjection struct {
		ID   string
		Code string
		Name string
	}
	var tenants []tenantProjection
	query := s.database.WithContext(ctx).
		Table("tenants").
		Select("id, code, name").
		Where("active = ?", true)
	if len(globalRoles) == 0 {
		ids := make([]string, 0, len(tenantRoles))
		for tenantID := range tenantRoles {
			ids = append(ids, tenantID)
		}
		if len(ids) == 0 {
			return []TenantOption{}, nil
		}
		query = query.Where("id IN ?", ids)
	}
	if err := query.Order("name ASC, code ASC, id ASC").Scan(&tenants).Error; err != nil {
		return nil, fmt.Errorf("find tenant options: %w", err)
	}

	options := make([]TenantOption, 0, len(tenants))
	for _, tenant := range tenants {
		roles := map[string]struct{}{}
		for role := range globalRoles {
			roles[role] = struct{}{}
		}
		for role := range tenantRoles[tenant.ID] {
			roles[role] = struct{}{}
		}
		roleCodes := make([]string, 0, len(roles))
		for role := range roles {
			roleCodes = append(roleCodes, role)
		}
		sort.Strings(roleCodes)
		options = append(options, TenantOption{ID: tenant.ID, Code: tenant.Code, Name: tenant.Name, RoleCodes: roleCodes})
	}
	return options, nil
}

// AccountActorStore resolves the Actor owned by an authenticated Account for a
// requested tenant. Bite 30C makes this relation authoritative for session
// traffic; header/test actor lookup remains available separately.
type AccountActorStore interface {
	FindAccountActor(ctx context.Context, accountID string, tenantID string) (*Actor, error)
	ListAccountTenantOptions(ctx context.Context, accountID string) ([]TenantOption, error)
}

type accountActorBindingProjection struct {
	ActorID        string
	ActorKey       string
	DisplayName    string
	PersonID       *string
	CollaboratorID *string
	ScopeType      string
	TenantID       *string
	MembershipID   *string
}

func (s *GORMStore) FindAccountActor(ctx context.Context, accountID string, tenantID string) (*Actor, error) {
	if s == nil || s.database == nil || strings.TrimSpace(accountID) == "" {
		return nil, ErrAuthenticationRequired
	}
	if !s.database.Migrator().HasTable("auth_account_actors") {
		return nil, ErrAccountActorFoundationUnavailable
	}
	accountID = strings.TrimSpace(accountID)
	tenantID = strings.TrimSpace(tenantID)
	if tenantID == "" {
		return nil, ErrTenantSelectionRequired
	}

	var binding accountActorBindingProjection
	result := s.database.WithContext(ctx).
		Table("auth_account_actors aa").
		Select(`aa.actor_id AS actor_id,
			a.actor_key AS actor_key,
			a.display_name AS display_name,
			a.person_id AS person_id,
			a.collaborator_id AS collaborator_id,
			aa.scope_type AS scope_type,
			aa.tenant_id AS tenant_id,
			aa.membership_id AS membership_id`).
		Joins("JOIN authz_actors a ON a.id = aa.actor_id AND a.active = ?", true).
		Where("aa.account_id = ? AND ((aa.scope_type = ? AND aa.tenant_id = ?) OR aa.scope_type = ?)", accountID, "TENANT", tenantID, "GLOBAL").
		Order("CASE WHEN aa.scope_type = 'TENANT' THEN 0 ELSE 1 END, aa.is_primary DESC").
		Limit(1).
		Scan(&binding)
	if result.Error != nil {
		return nil, fmt.Errorf("find authenticated Account Actor: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return nil, ErrAuthenticationRequired
	}

	grantTenantID := tenantID
	actorScope := ActorScopeTenant
	resolvedTenantID := tenantID
	if binding.ScopeType == "GLOBAL" {
		grantTenantID = GlobalTenantScope
		actorScope = ActorScopeApplication
		// Until Bite 30H removes Application Administrator tenant-data
		// compatibility, a global Actor can still be evaluated against the
		// selected tenant. The binding remains globally scoped and never becomes
		// a tenant Actor.
		resolvedTenantID = tenantID
	}
	return s.buildBoundActor(ctx, binding, grantTenantID, resolvedTenantID, actorScope)
}

func (s *GORMStore) buildBoundActor(ctx context.Context, binding accountActorBindingProjection, grantTenantID string, resolvedTenantID string, scope ActorScope) (*Actor, error) {
	type grantProjection struct {
		RoleID   string
		RoleCode string
	}
	var grants []grantProjection
	if err := s.database.WithContext(ctx).
		Table("authz_actor_role_grants g").
		Select("r.id AS role_id, r.code AS role_code").
		Joins("JOIN authz_roles r ON r.id = g.role_id AND r.active = ?", true).
		Where("g.actor_id = ? AND g.active = ? AND g.tenant_id = ?", binding.ActorID, true, grantTenantID).
		Scan(&grants).Error; err != nil {
		return nil, fmt.Errorf("find authenticated Account Actor grants: %w", err)
	}
	if len(grants) == 0 {
		return nil, ErrAuthenticationRequired
	}

	permissions := map[Permission]struct{}{}
	roles := make([]string, 0, len(grants))
	for _, grant := range grants {
		roles = append(roles, grant.RoleCode)
		var permissionRows []AuthzRolePermission
		if err := s.database.WithContext(ctx).Where("role_id = ?", grant.RoleID).Find(&permissionRows).Error; err != nil {
			return nil, fmt.Errorf("find authenticated Account Actor permissions: %w", err)
		}
		for _, row := range permissionRows {
			permissions[Permission(row.PermissionCode)] = struct{}{}
		}
	}
	sort.Strings(roles)
	return &Actor{
		ID:             binding.ActorKey,
		RecordID:       binding.ActorID,
		TenantID:       resolvedTenantID,
		PersonID:       stringValue(binding.PersonID),
		CollaboratorID: stringValue(binding.CollaboratorID),
		Source:         ActorSourceAuthenticatedSession,
		Scope:          scope,
		RoleCodes:      roles,
		Permissions:    permissions,
	}, nil
}

func (s *GORMStore) ListAccountTenantOptions(ctx context.Context, accountID string) ([]TenantOption, error) {
	if s == nil || s.database == nil || strings.TrimSpace(accountID) == "" {
		return nil, ErrAuthenticationRequired
	}
	if !s.database.Migrator().HasTable("auth_account_actors") {
		return nil, ErrAccountActorFoundationUnavailable
	}
	accountID = strings.TrimSpace(accountID)

	var globalCount int64
	if err := s.database.WithContext(ctx).
		Table("auth_account_actors aa").
		Joins("JOIN authz_actors a ON a.id = aa.actor_id AND a.active = ?", true).
		Where("aa.account_id = ? AND aa.scope_type = ?", accountID, "GLOBAL").
		Count(&globalCount).Error; err != nil {
		return nil, fmt.Errorf("find global Account Actor: %w", err)
	}
	if globalCount > 0 {
		var roleCodes []string
		if err := s.database.WithContext(ctx).
			Table("auth_account_actors aa").
			Select("DISTINCT r.code").
			Joins("JOIN authz_actor_role_grants g ON g.actor_id = aa.actor_id AND g.active = ? AND g.tenant_id = ?", true, GlobalTenantScope).
			Joins("JOIN authz_roles r ON r.id = g.role_id AND r.active = ?", true).
			Where("aa.account_id = ? AND aa.scope_type = ?", accountID, "GLOBAL").
			Order("r.code").
			Pluck("r.code", &roleCodes).Error; err != nil {
			return nil, fmt.Errorf("find global Account Actor roles: %w", err)
		}
		return s.activeTenantOptions(ctx, nil, roleCodes)
	}

	type tenantBinding struct {
		TenantID string
		ActorID  string
	}
	var bindings []tenantBinding
	if err := s.database.WithContext(ctx).
		Table("auth_account_actors aa").
		Select("aa.tenant_id AS tenant_id, aa.actor_id AS actor_id").
		Joins("JOIN authz_actors a ON a.id = aa.actor_id AND a.active = ?", true).
		Where("aa.account_id = ? AND aa.scope_type = ?", accountID, "TENANT").
		Order("aa.tenant_id").Scan(&bindings).Error; err != nil {
		return nil, fmt.Errorf("list Account tenant Actors: %w", err)
	}
	if len(bindings) == 0 {
		return []TenantOption{}, nil
	}

	roleCodesByTenant := map[string][]string{}
	for _, binding := range bindings {
		var roleCodes []string
		if err := s.database.WithContext(ctx).
			Table("authz_actor_role_grants g").
			Select("r.code").
			Joins("JOIN authz_roles r ON r.id = g.role_id AND r.active = ?", true).
			Where("g.actor_id = ? AND g.tenant_id = ? AND g.active = ?", binding.ActorID, binding.TenantID, true).
			Order("r.code").Pluck("r.code", &roleCodes).Error; err != nil {
			return nil, fmt.Errorf("list Account tenant Actor roles: %w", err)
		}
		roleCodesByTenant[binding.TenantID] = roleCodes
	}
	return s.activeTenantOptions(ctx, roleCodesByTenant, nil)
}

func (s *GORMStore) activeTenantOptions(ctx context.Context, roleCodesByTenant map[string][]string, globalRoles []string) ([]TenantOption, error) {
	type tenantProjection struct {
		ID   string
		Code string
		Name string
	}
	query := s.database.WithContext(ctx).Table("tenants").Select("id, code, name").Where("active = ?", true)
	if roleCodesByTenant != nil {
		ids := make([]string, 0, len(roleCodesByTenant))
		for tenantID := range roleCodesByTenant {
			ids = append(ids, tenantID)
		}
		if len(ids) == 0 {
			return []TenantOption{}, nil
		}
		query = query.Where("id IN ?", ids)
	}
	var tenants []tenantProjection
	if err := query.Order("name ASC, code ASC, id ASC").Scan(&tenants).Error; err != nil {
		return nil, fmt.Errorf("find Account tenant options: %w", err)
	}
	options := make([]TenantOption, 0, len(tenants))
	for _, tenant := range tenants {
		roles := globalRoles
		if roleCodesByTenant != nil {
			roles = roleCodesByTenant[tenant.ID]
		}
		options = append(options, TenantOption{ID: tenant.ID, Code: tenant.Code, Name: tenant.Name, RoleCodes: append([]string(nil), roles...)})
	}
	return options, nil
}
