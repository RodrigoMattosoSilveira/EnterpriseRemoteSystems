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

	// A persisted global Actor is evaluated only against global/control-plane
	// Role Grants. Selecting a tenant no longer turns global authority into
	// tenant business authority.
	globalRoles, globalPermissions, err := s.loadDelegatedAuthorization(ctx, actorRow.ID, GlobalTenantScope, ActorScopeApplication)
	if err != nil {
		return nil, err
	}
	if len(globalRoles) > 0 {
		if tenantID != GlobalTenantScope {
			return nil, ErrTenantActorUnavailable
		}
		return &Actor{
			ID:                   actorRow.ActorKey,
			RecordID:             actorRow.ID,
			TenantID:             GlobalTenantScope,
			Source:               ActorSourcePersisted,
			Scope:                ActorScopeApplication,
			RoleCodes:            globalRoles,
			Permissions:          clonePermissionSet(globalPermissions),
			DelegatedPermissions: globalPermissions,
			IntrinsicPermissions: map[Permission]struct{}{},
		}, nil
	}

	// Header/test actors remain useful for isolated tests, but tenant delegated
	// authority is resolved only from grants for the explicitly requested tenant.
	roles, delegated, err := s.loadDelegatedAuthorization(ctx, actorRow.ID, tenantID, ActorScopeTenant)
	if err != nil {
		return nil, err
	}
	return &Actor{
		ID:                   actorRow.ActorKey,
		RecordID:             actorRow.ID,
		TenantID:             tenantID,
		PersonID:             stringValue(actorRow.PersonID),
		CollaboratorID:       stringValue(actorRow.CollaboratorID),
		Source:               ActorSourcePersisted,
		Scope:                ActorScopeTenant,
		RoleCodes:            roles,
		Permissions:          clonePermissionSet(delegated),
		DelegatedPermissions: delegated,
		IntrinsicPermissions: map[Permission]struct{}{},
	}, nil
}

func (s *GORMStore) loadDelegatedAuthorization(ctx context.Context, actorID string, tenantID string, scope ActorScope) ([]string, map[Permission]struct{}, error) {
	type grantProjection struct {
		RoleID   string
		RoleCode string
	}
	var grants []grantProjection
	query := s.database.WithContext(ctx).
		Table("authz_actor_role_grants g").
		Select("r.id AS role_id, r.code AS role_code").
		Joins("JOIN authz_roles r ON r.id = g.role_id AND r.active = ?", true).
		Where("g.actor_id = ? AND g.active = ? AND g.lifecycle_suspended = ? AND g.tenant_id = ?", actorID, true, false, tenantID)
	switch scope {
	case ActorScopeApplication:
		query = query.Where("r.scope_type = ?", string(ActorScopeApplication))
	case ActorScopeTenant:
		query = query.Where("r.scope_type = ?", string(ActorScopeTenant))
	default:
		return nil, nil, ErrForbidden
	}
	if err := query.Scan(&grants).Error; err != nil {
		return nil, nil, fmt.Errorf("find authorization grants: %w", err)
	}

	permissions := map[Permission]struct{}{}
	roles := make([]string, 0, len(grants))
	for _, grant := range grants {
		roles = append(roles, grant.RoleCode)
		var permissionRows []AuthzRolePermission
		if err := s.database.WithContext(ctx).
			Where("role_id = ?", grant.RoleID).
			Find(&permissionRows).Error; err != nil {
			return nil, nil, fmt.Errorf("find authorization permissions: %w", err)
		}
		for _, row := range permissionRows {
			permissions[Permission(row.PermissionCode)] = struct{}{}
		}
	}
	sort.Strings(roles)
	return roles, permissions, nil
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

func applicationAdministratorControlPlanePermissions() []Permission {
	return []Permission{
		PermissionAuthzSelfRead,
		PermissionAuthzRead,
		PermissionAuthzManage,
		PermissionTenantsRead,
		PermissionTenantsCreate,
		PermissionTenantsUpdate,
	}
}

func tenantAdministratorDelegatedPermissions() []Permission {
	return []Permission{
		PermissionTenantsRead,
		PermissionPeopleRead,
		PermissionPeopleCreate,
		PermissionPeopleUpdate,
		PermissionCollaboratorsRead,
		PermissionCollaboratorsCreate,
		PermissionCollaboratorsUpdate,
		PermissionCollaboratorsWorkAssignmentUpdate,
		PermissionPlanningRead,
		PermissionPlanningCreate,
		PermissionPlanningUpdate,
		PermissionEarningsRead,
		PermissionEarningsCreate,
		PermissionEarningsUpdate,
		PermissionPriceListsRead,
		PermissionPriceListsCreate,
		PermissionPriceListsUpdate,
		PermissionGoldPricesManage,
		PermissionGoldProductionManage,
		PermissionAuthzTenantActorsManage,
		PermissionAuthzTenantRoleGrantsManage,
		PermissionReferenceDataRead,
		PermissionReferenceDataManage,
		PermissionExpensesRead,
		PermissionExpensesCreate,
		PermissionExpensesUpdate,
		PermissionCurrentAccountsSummaryRead,
		PermissionCurrentAccountsLedgerRead,
		PermissionCurrentAccountsLedgerCreate,
		PermissionCurrentAccountsSettingsRead,
		PermissionCurrentAccountsSettingsUpdate,
		PermissionLedgerReceiptsRead,
		PermissionLedgerReceiptsCreate,
		PermissionLedgerReceiptsPrint,
		PermissionLedgerReceiptsReturn,
		PermissionLedgerReceiptsBackfill,
		PermissionLedgerReceiptsTenantAccept,
		PermissionLedgerCorrectionsCreate,
		PermissionJourneySettlementsPreview,
		PermissionJourneySettlementsZeroGold,
		PermissionJourneySettlementsPartialPayout,
		PermissionJourneySettlementsFinalTenantPayment,
		PermissionJourneySettlementsFinalCollaboratorPayment,
		PermissionJourneySettlementsClose,
	}
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
		{ID: "authz-role-application-admin", Code: string(RoleApplicationAdmin), Label: "Application Administrator", Description: "Application-global control-plane administration with no standing Tenant business-data access.", ScopeType: string(ActorScopeApplication), Active: true, CreatedAt: now, UpdatedAt: now},
		{ID: "authz-role-tenant-admin", Code: string(RoleTenantAdmin), Label: "Tenant Administrator", Description: "Tenant-wide administration through explicit delegated permissions.", ScopeType: string(ActorScopeTenant), Active: true, CreatedAt: now, UpdatedAt: now},
		{ID: "authz-role-earnings-operator", Code: string(RoleEarningsOperator), Label: "Earnings Operator", Description: "Planning and earning operations for the assigned tenant.", ScopeType: string(ActorScopeTenant), Active: true, CreatedAt: now, UpdatedAt: now},
		{ID: "authz-role-expense-operator", Code: string(RoleExpenseOperator), Label: "Expense Operator", Description: "Expense, price list, current account summary, and receipt operations for the assigned tenant.", ScopeType: string(ActorScopeTenant), Active: true, CreatedAt: now, UpdatedAt: now},
	}
	for _, role := range roles {
		if err := database.Where("id = ?", role.ID).FirstOrCreate(&role).Error; err != nil {
			return fmt.Errorf("seed role %s: %w", role.Code, err)
		}
	}

	rolePermissions := map[RoleCode][]Permission{
		RoleApplicationAdmin: applicationAdministratorControlPlanePermissions(),
		RoleTenantAdmin:      tenantAdministratorDelegatedPermissions(),
		RoleEarningsOperator: {
			PermissionAuthzSelfRead, PermissionTenantsRead, PermissionReferenceDataRead,
			PermissionCollaboratorsRead, PermissionCollaboratorsWorkAssignmentUpdate,
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
	}

	roleIDs := map[RoleCode]string{
		RoleApplicationAdmin: "authz-role-application-admin",
		RoleTenantAdmin:      "authz-role-tenant-admin",
		RoleEarningsOperator: "authz-role-earnings-operator",
		RoleExpenseOperator:  "authz-role-expense-operator",
	}
	// Earnings administration is intentionally narrower than full Collaborator
	// administration. Converge any stale/manual role-permission row so the
	// EARNINGS_OPERATOR role can change only the work-assignment fields exposed
	// through PermissionCollaboratorsWorkAssignmentUpdate.
	if err := database.
		Where("role_id = ? AND permission_code = ?", roleIDs[RoleEarningsOperator], string(PermissionCollaboratorsUpdate)).
		Delete(&AuthzRolePermission{}).Error; err != nil {
		return fmt.Errorf("remove Earnings Operator full collaborator update permission: %w", err)
	}

	// Bite 30I.1 cuts APPLICATION_ADMIN over to explicit control-plane
	// authority. Converge pre-migration/test databases by removing every stale
	// role permission that is not part of that allowlist.
	allowedApplicationPermissions := make([]string, 0, len(applicationAdministratorControlPlanePermissions()))
	for _, permission := range applicationAdministratorControlPlanePermissions() {
		allowedApplicationPermissions = append(allowedApplicationPermissions, string(permission))
	}
	if err := database.
		Where("role_id = ? AND permission_code NOT IN ?", roleIDs[RoleApplicationAdmin], allowedApplicationPermissions).
		Delete(&AuthzRolePermission{}).Error; err != nil {
		return fmt.Errorf("remove Application Administrator tenant-data permissions: %w", err)
	}

	// Tenant Administrator authority is deliberately explicit in Bite 30D.
	// Remove the historical wildcard so catalog seeding also converges databases
	// that were initialized before the explicit-permission migration.
	if err := database.
		Where("role_id = ? AND permission_code = ?", roleIDs[RoleTenantAdmin], string(PermissionAll)).
		Delete(&AuthzRolePermission{}).Error; err != nil {
		return fmt.Errorf("remove Tenant Administrator wildcard permission: %w", err)
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
	if err := ValidateDelegatedRoleGrant(database, actorID, roleRow, tenantID, false); err != nil {
		return err
	}

	now := time.Now().UTC()
	grant := AuthzActorRoleGrant{ID: fmt.Sprintf("authz-grant-%s-%s-%s", actorID, roleRow.Code, tenantID), ActorID: actorID, RoleID: roleRow.ID, TenantID: tenantID, Active: true, LifecycleSuspended: false, CreatedAt: now, UpdatedAt: now}
	result := database.Where("actor_id = ? AND role_id = ? AND tenant_id = ?", actorID, roleRow.ID, tenantID).FirstOrCreate(&grant)
	if result.Error != nil {
		return fmt.Errorf("grant role %s: %w", role, result.Error)
	}
	if result.RowsAffected == 0 && (!grant.Active || grant.LifecycleSuspended) {
		grant.Active = true
		grant.LifecycleSuspended = false
		grant.UpdatedAt = now
		if err := database.Save(&grant).Error; err != nil {
			return fmt.Errorf("reactivate role %s: %w", role, err)
		}
	}
	return nil
}

// ValidateDelegatedRoleGrant enforces the Bite 30D separation between Actor
// identity and delegated authority. Self-service is intrinsic and therefore
// cannot be granted as a Role. When requireTenantBinding is true, a tenant Role
// may be granted only to the Actor already bound to that exact tenant through
// auth_account_actors.
func ValidateDelegatedRoleGrant(database *gorm.DB, actorID string, role AuthzRole, tenantID string, requireTenantBinding bool) error {
	actorID = strings.TrimSpace(actorID)
	tenantID = strings.TrimSpace(tenantID)
	if actorID == "" {
		return NewValidationError(map[string]string{"actorId": "Actor ID is required"})
	}
	if role.Code == string(RolePerson) || role.ScopeType == string(ActorScopeSelf) {
		return NewValidationError(map[string]string{"roleCode": "Self-service authorization is intrinsic and cannot be granted as a Role"})
	}
	if role.ScopeType == string(ActorScopeApplication) {
		if tenantID != GlobalTenantScope {
			return NewValidationError(map[string]string{"tenantId": "Application-scoped roles must use the global tenant scope (*)"})
		}
		if database != nil && database.Migrator().HasTable("auth_account_actors") {
			var tenantBindings int64
			if err := database.Table("auth_account_actors").Where("actor_id = ? AND scope_type = ?", actorID, "TENANT").Count(&tenantBindings).Error; err != nil {
				return fmt.Errorf("check application Actor scope: %w", err)
			}
			if tenantBindings > 0 {
				return NewValidationError(map[string]string{"actorId": "Application roles cannot be granted to a tenant Actor"})
			}
		}
		return nil
	}
	if role.ScopeType != string(ActorScopeTenant) {
		return NewValidationError(map[string]string{"roleCode": "Only tenant or application delegated Roles are supported"})
	}
	if tenantID == "" || tenantID == GlobalTenantScope {
		return NewValidationError(map[string]string{"tenantId": "Tenant roles require a specific tenant ID"})
	}
	if requireTenantBinding && database != nil && database.Migrator().HasTable("auth_account_actors") {
		type bindingProjection struct {
			ScopeType string
			TenantID  *string
		}
		var binding bindingProjection
		result := database.Table("auth_account_actors").
			Select("scope_type, tenant_id").
			Where("actor_id = ?", actorID).
			Limit(1).
			Scan(&binding)
		if result.Error != nil {
			return fmt.Errorf("check tenant Actor binding: %w", result.Error)
		}
		if result.RowsAffected == 0 {
			return NewValidationError(map[string]string{"actorId": "Tenant roles require an Actor bound to the target tenant"})
		}
		if binding.ScopeType != "TENANT" || binding.TenantID == nil || strings.TrimSpace(*binding.TenantID) != tenantID {
			return NewValidationError(map[string]string{"tenantId": "Tenant Role Grant must match the Actor's tenant"})
		}
	}

	if role.Code == string(RoleTenantAdmin) {
		if err := validateTenantAdministratorCardinality(database, actorID, tenantID, requireTenantBinding); err != nil {
			return err
		}
	}
	return nil
}

func validateTenantAdministratorCardinality(database *gorm.DB, actorID string, tenantID string, requireTenantBinding bool) error {
	if database == nil {
		return nil
	}

	globalPersonID, err := tenantAdministratorGlobalPersonID(database, actorID, tenantID, requireTenantBinding)
	if err != nil {
		return err
	}
	if globalPersonID == "" {
		// Isolated pre-foundation authorization tests may not install the Bite 30
		// Person/Membership tables. Production Tenant Administrator assignments are
		// always tenant-bound and therefore require canonical global Person identity.
		return nil
	}

	base := func() *gorm.DB {
		return database.Table("authz_actor_role_grants g").
			Joins("JOIN authz_roles r ON r.id = g.role_id").
			Where("g.active = ? AND r.code = ?", true, string(RoleTenantAdmin))
	}

	var otherTenantAdmins int64
	if err := base().
		Where("g.tenant_id = ? AND g.actor_id <> ?", tenantID, actorID).
		Count(&otherTenantAdmins).Error; err != nil {
		return fmt.Errorf("count Tenant Administrators: %w", err)
	}
	if otherTenantAdmins >= 2 {
		return NewValidationError(map[string]string{
			"tenantId": "Tenant already has the maximum of two active Tenant Administrators",
		})
	}

	var samePersonSameTenant int64
	if err := base().
		Joins("JOIN auth_account_actors cardinality_binding ON cardinality_binding.actor_id = g.actor_id AND cardinality_binding.scope_type = ? AND cardinality_binding.tenant_id = g.tenant_id", "TENANT").
		Joins("JOIN person_tenant_memberships cardinality_membership ON cardinality_membership.id = cardinality_binding.membership_id AND cardinality_membership.tenant_id = cardinality_binding.tenant_id").
		Where("cardinality_membership.person_id = ? AND g.tenant_id = ? AND g.actor_id <> ?", globalPersonID, tenantID, actorID).
		Count(&samePersonSameTenant).Error; err != nil {
		return fmt.Errorf("check Tenant Administrator global Person uniqueness: %w", err)
	}
	if samePersonSameTenant > 0 {
		return NewValidationError(map[string]string{
			"actorId": "Tenant Administrator slots must belong to two distinct Persons",
		})
	}

	var otherTenantID string
	result := base().
		Joins("JOIN auth_account_actors cardinality_binding ON cardinality_binding.actor_id = g.actor_id AND cardinality_binding.scope_type = ? AND cardinality_binding.tenant_id = g.tenant_id", "TENANT").
		Joins("JOIN person_tenant_memberships cardinality_membership ON cardinality_membership.id = cardinality_binding.membership_id AND cardinality_membership.tenant_id = cardinality_binding.tenant_id").
		Select("g.tenant_id").
		Where("cardinality_membership.person_id = ? AND g.tenant_id <> ?", globalPersonID, tenantID).
		Order("g.tenant_id ASC").
		Limit(1).
		Scan(&otherTenantID)
	if result.Error != nil {
		return fmt.Errorf("check cross-tenant Tenant Administrator Person cardinality: %w", result.Error)
	}
	if strings.TrimSpace(otherTenantID) != "" {
		return NewValidationError(map[string]string{
			"actorId": fmt.Sprintf("Person already administers tenant %s; a Person may administer only one Tenant at a time", otherTenantID),
		})
	}

	return nil
}

func tenantAdministratorGlobalPersonID(database *gorm.DB, actorID string, tenantID string, requireTenantBinding bool) (string, error) {
	if database == nil {
		return "", nil
	}

	hasFoundation := database.Migrator().HasTable("auth_account_actors") && database.Migrator().HasTable("person_tenant_memberships")
	if hasFoundation {
		type projection struct {
			GlobalPersonID string
		}
		var identity projection
		result := database.Table("auth_account_actors aa").
			Select("m.person_id AS global_person_id").
			Joins("JOIN person_tenant_memberships m ON m.id = aa.membership_id AND m.tenant_id = aa.tenant_id").
			Where("aa.actor_id = ? AND aa.scope_type = ? AND aa.tenant_id = ?", actorID, "TENANT", tenantID).
			Limit(1).
			Scan(&identity)
		if result.Error != nil {
			return "", fmt.Errorf("resolve Tenant Administrator global Person: %w", result.Error)
		}
		globalPersonID := strings.TrimSpace(identity.GlobalPersonID)
		if result.RowsAffected > 0 && globalPersonID != "" {
			return globalPersonID, nil
		}
		if requireTenantBinding {
			return "", NewValidationError(map[string]string{
				"actorId": "Tenant Administrator authority requires a tenant Actor bound to a canonical Person Membership",
			})
		}
	}

	if requireTenantBinding {
		return "", NewValidationError(map[string]string{
			"actorId": "Tenant Administrator authority requires the Account/Actor and Person Membership foundation",
		})
	}

	// Compatibility for isolated authorization unit tests that intentionally do
	// not install the Bite 30 Account/Actor foundation. This path is not used by
	// production Tenant Administrator assignment endpoints.
	var actor AuthzActor
	if err := database.Select("id", "person_id").Where("id = ?", actorID).First(&actor).Error; err != nil {
		return "", fmt.Errorf("find Tenant Administrator Actor: %w", err)
	}
	return strings.TrimSpace(stringValue(actor.PersonID)), nil
}

type PermissionCatalogEntry struct {
	Permission  Permission
	Label       string
	Description string
}

func PermissionCatalog() []PermissionCatalogEntry {
	return []PermissionCatalogEntry{
		{PermissionAll, "All permissions", "Legacy wildcard permission retained for compatibility testing; APPLICATION_ADMIN no longer receives it after Bite 30I.1."},
		{PermissionAuthzSelfRead, "Read own authorization context", "Read the current persisted actor, effective roles, scope, and permissions."},
		{PermissionAuthzRead, "Read authorization administration", "Read authorization actors, roles, permissions, and grants."},
		{PermissionAuthzManage, "Manage authorization administration", "Create authorization actors and manage application-global role grants."},
		{PermissionAuthzTenantActorsManage, "Manage tenant Actors", "Activate and deactivate Account-bound Actors for members of the selected tenant."},
		{PermissionAuthzTenantRoleGrantsManage, "Manage tenant operator role grants", "Grant and revoke Earnings Operator and Expenses Operator roles for active Actors backed by ACTIVE Memberships in the selected tenant."},
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
		{PermissionCollaboratorsUpdate, "Update collaborators", "Update all editable tenant collaborator Journey attributes."},
		{PermissionCollaboratorsWorkAssignmentUpdate, "Update collaborator work assignment", "Update only Sector, Location, and Task on tenant collaborator Journeys."},
		{PermissionCollaboratorsSelfRead, "Read own collaborator journeys", "Read current and historical collaborator journeys for the actor's tenant Membership."},
		{PermissionPlanningRead, "Read planning", "Read tenant planning records."},
		{PermissionPlanningCreate, "Create planning", "Create tenant planning records."},
		{PermissionPlanningUpdate, "Update planning", "Update tenant planning records."},
		{PermissionEarningsRead, "Read earnings", "Read tenant earning records."},
		{PermissionEarningsCreate, "Create earnings", "Create tenant earning records."},
		{PermissionEarningsUpdate, "Update earnings", "Update tenant earning records."},
		{PermissionPriceListsRead, "Read price lists", "Read tenant price list records."},
		{PermissionPriceListsCreate, "Create price lists", "Create tenant price list records."},
		{PermissionPriceListsUpdate, "Update price lists", "Update tenant price list records."},
		{PermissionGoldPricesManage, "Manage gold prices", "List, record, replace, and deactivate sensitive tenant gold-price administration records."},
		{PermissionGoldProductionManage, "Manage gold production", "Record, edit, deactivate, and delete tenant Gold Production entries."},
		{PermissionReferenceDataRead, "Read reference data", "Read tenant reference data records."},
		{PermissionReferenceDataManage, "Manage reference data", "Create, update, deactivate, and reactivate tenant reference data records."},
		{PermissionExpensesRead, "Read expenses", "Read tenant expense records."},
		{PermissionExpensesCreate, "Create expenses", "Create tenant expense records."},
		{PermissionExpensesUpdate, "Correct expenses", "Cancel incorrect tenant expense records and initiate the replacement workflow."},
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
		{PermissionLedgerReceiptsSelfAccept, "Accept own settlement receipts", "Accept the actor's own Tenant-to-Collaborator final-settlement receipts in-app."},
		{PermissionLedgerReceiptsTenantAccept, "Accept Tenant settlement receipts", "Accept Collaborator-to-Tenant final-settlement receipts on behalf of the Tenant."},
		{PermissionLedgerCorrectionsCreate, "Create ledger corrections", "Create tenant ledger correction records."},
		{PermissionJourneySettlementsPreview, "Preview journey settlements", "Preview tenant journey settlements."},
		{PermissionJourneySettlementsZeroGold, "Zero Gold settlement", "Post tenant Zero Gold settlements."},
		{PermissionJourneySettlementsPartialPayout, "Partial payout settlement", "Post tenant partial payout settlements."},
		{PermissionJourneySettlementsFinalTenantPayment, "Final Tenant payment", "Post the full positive Journey balance owed by the Tenant to the Collaborator."},
		{PermissionJourneySettlementsFinalCollaboratorPayment, "Final Collaborator payment", "Record the full negative Journey balance paid by the Collaborator to the Tenant."},
		{PermissionJourneySettlementsClose, "Close journey", "Close tenant journeys."},
	}
}

func stringValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

// TenantOption describes an active tenant context available to an authenticated
// Account. For ordinary Accounts the option names the exact active tenant Actor
// and Membership that will become effective when the tenant is selected. GLOBAL
// Application Administrator Accounts expose exactly one control-plane context
// (`*`) and never enumerate Tenants as implicit operating contexts.
type TenantOption struct {
	ID            string   `json:"id"`
	Code          string   `json:"code"`
	Name          string   `json:"name"`
	RoleCodes     []string `json:"roleCodes"`
	ActorRecordID string   `json:"actorRecordId"`
	ActorKey      string   `json:"actorKey"`
	ActorScope    string   `json:"actorScope"`
	MembershipID  string   `json:"membershipId,omitempty"`
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
		Where("authz_actor_role_grants.actor_id = ? AND authz_actor_role_grants.active = ? AND authz_actor_role_grants.lifecycle_suspended = ?", actorRecordID, true, false).
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

	if len(globalRoles) > 0 {
		roleCodes := make([]string, 0, len(globalRoles))
		for role := range globalRoles {
			roleCodes = append(roleCodes, role)
		}
		sort.Strings(roleCodes)
		return []TenantOption{{
			ID:            GlobalTenantScope,
			Code:          "GLOBAL",
			Name:          "Global administration",
			RoleCodes:     roleCodes,
			ActorRecordID: actor.ID,
			ActorKey:      actor.ActorKey,
			ActorScope:    string(ActorScopeApplication),
		}}, nil
	}

	type tenantProjection struct {
		ID   string
		Code string
		Name string
	}
	ids := make([]string, 0, len(tenantRoles))
	for tenantID := range tenantRoles {
		ids = append(ids, tenantID)
	}
	if len(ids) == 0 {
		return []TenantOption{}, nil
	}
	var tenants []tenantProjection
	if err := s.database.WithContext(ctx).
		Table("tenants").
		Select("id, code, name").
		Where("active = ? AND id IN ?", true, ids).
		Order("name ASC, code ASC, id ASC").
		Scan(&tenants).Error; err != nil {
		return nil, fmt.Errorf("find tenant options: %w", err)
	}

	options := make([]TenantOption, 0, len(tenants))
	for _, tenant := range tenants {
		roleCodes := make([]string, 0, len(tenantRoles[tenant.ID]))
		for role := range tenantRoles[tenant.ID] {
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
	AccountID    string
	ActorID      string
	ActorKey     string
	DisplayName  string
	ScopeType    string
	TenantID     *string
	MembershipID *string
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
	query := s.database.WithContext(ctx).
		Table("auth_account_actors aa").
		Select(`aa.account_id AS account_id,
			aa.actor_id AS actor_id,
			a.actor_key AS actor_key,
			a.display_name AS display_name,
			aa.scope_type AS scope_type,
			aa.tenant_id AS tenant_id,
			aa.membership_id AS membership_id`).
		Joins("JOIN authz_actors a ON a.id = aa.actor_id AND a.active = ?", true).
		Where("aa.account_id = ?", accountID)
	if tenantID == GlobalTenantScope {
		query = query.Where("aa.scope_type = ?", "GLOBAL")
	} else {
		query = query.Where("aa.scope_type = ? AND aa.tenant_id = ?", "TENANT", tenantID)
	}
	result := query.
		Order("aa.is_primary DESC").
		Limit(1).
		Scan(&binding)
	if result.Error != nil {
		return nil, fmt.Errorf("find authenticated Account Actor: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return nil, ErrTenantActorUnavailable
	}

	if binding.ScopeType == "GLOBAL" {
		roles, delegated, err := s.loadDelegatedAuthorization(ctx, binding.ActorID, GlobalTenantScope, ActorScopeApplication)
		if err != nil {
			return nil, err
		}
		if len(roles) == 0 {
			return nil, ErrTenantActorUnavailable
		}
		return &Actor{
			ID:                   binding.ActorKey,
			RecordID:             binding.ActorID,
			TenantID:             GlobalTenantScope,
			Source:               ActorSourceAuthenticatedSession,
			Scope:                ActorScopeApplication,
			RoleCodes:            roles,
			Permissions:          clonePermissionSet(delegated),
			DelegatedPermissions: delegated,
			IntrinsicPermissions: map[Permission]struct{}{},
		}, nil
	}

	return s.buildTenantBoundActor(ctx, binding, tenantID)
}

type intrinsicTenantIdentity struct {
	MembershipID   string
	GlobalPersonID string
	LegacyPersonID *string
}

func (s *GORMStore) buildTenantBoundActor(ctx context.Context, binding accountActorBindingProjection, tenantID string) (*Actor, error) {
	if binding.TenantID == nil || strings.TrimSpace(*binding.TenantID) != tenantID || binding.MembershipID == nil || strings.TrimSpace(*binding.MembershipID) == "" {
		return nil, ErrTenantActorUnavailable
	}

	var identity intrinsicTenantIdentity
	result := s.database.WithContext(ctx).
		Table("person_tenant_memberships m").
		Select("m.id AS membership_id, m.person_id AS global_person_id, m.legacy_person_id AS legacy_person_id").
		Joins("JOIN auth_account_people ap ON ap.account_id = ? AND ap.person_id = m.person_id", binding.AccountID).
		Joins("JOIN reference_data status ON status.id = m.status_id AND status.tenant_id = m.tenant_id AND status.type = ? AND status.active = ?", "person_status", true).
		Where("m.id = ? AND m.tenant_id = ? AND status.code = ?", strings.TrimSpace(*binding.MembershipID), tenantID, "ACTIVE").
		Limit(1).
		Scan(&identity)
	if result.Error != nil {
		return nil, fmt.Errorf("resolve intrinsic tenant identity: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return nil, ErrTenantActorUnavailable
	}

	personID := stringValue(identity.LegacyPersonID)
	collaboratorID := ""
	hasCollaboratorHistory := false
	if strings.TrimSpace(identity.MembershipID) != "" {
		type collaboratorProjection struct{ ID string }
		var collaborator collaboratorProjection
		if err := s.database.WithContext(ctx).
			Table("collaborator_journeys").
			Select("id").
			Where("tenant_id = ? AND membership_id = ? AND closed_at IS NULL", tenantID, identity.MembershipID).
			Order("journey_start_date DESC, created_at DESC").
			Limit(1).
			Scan(&collaborator).Error; err != nil {
			return nil, fmt.Errorf("resolve intrinsic collaborator identity: %w", err)
		}
		collaboratorID = strings.TrimSpace(collaborator.ID)

		var journeyCount int64
		if err := s.database.WithContext(ctx).
			Table("collaborator_journeys").
			Where("tenant_id = ? AND membership_id = ?", tenantID, identity.MembershipID).
			Count(&journeyCount).Error; err != nil {
			return nil, fmt.Errorf("resolve intrinsic collaborator history: %w", err)
		}
		hasCollaboratorHistory = journeyCount > 0
	}

	intrinsic := intrinsicSelfServicePermissions(hasCollaboratorHistory, collaboratorID != "")
	roles, delegated, err := s.loadDelegatedAuthorization(ctx, binding.ActorID, tenantID, ActorScopeTenant)
	if err != nil {
		return nil, err
	}
	permissions := mergePermissionSets(intrinsic, delegated)

	return &Actor{
		ID:                   binding.ActorKey,
		RecordID:             binding.ActorID,
		TenantID:             tenantID,
		PersonID:             personID,
		GlobalPersonID:       identity.GlobalPersonID,
		MembershipID:         identity.MembershipID,
		CollaboratorID:       collaboratorID,
		Source:               ActorSourceAuthenticatedSession,
		Scope:                ActorScopeTenant,
		RoleCodes:            roles,
		Permissions:          permissions,
		IntrinsicPermissions: intrinsic,
		DelegatedPermissions: delegated,
	}, nil
}

func intrinsicSelfServicePermissions(hasCollaboratorHistory bool, activeCollaborator bool) map[Permission]struct{} {
	permissions := map[Permission]struct{}{
		PermissionAuthzSelfRead:     {},
		PermissionTenantsRead:       {},
		PermissionReferenceDataRead: {},
		PermissionPeopleSelfRead:    {},
		PermissionPeopleSelfUpdate:  {},
	}
	if hasCollaboratorHistory {
		permissions[PermissionCollaboratorsSelfRead] = struct{}{}
	}
	if activeCollaborator {
		for _, permission := range []Permission{
			PermissionCurrentAccountsSelfSummaryRead,
			PermissionCurrentAccountsSelfLedgerRead,
			PermissionAssignmentsSelfCurrentRead,
			PermissionLedgerReceiptsSelfRead,
			PermissionLedgerReceiptsSelfAccept,
		} {
			permissions[permission] = struct{}{}
		}
	}
	return permissions
}

func mergePermissionSets(sets ...map[Permission]struct{}) map[Permission]struct{} {
	merged := map[Permission]struct{}{}
	for _, set := range sets {
		for permission := range set {
			merged[permission] = struct{}{}
		}
	}
	return merged
}

func clonePermissionSet(source map[Permission]struct{}) map[Permission]struct{} {
	return mergePermissionSets(source)
}

func (s *GORMStore) ListAccountTenantOptions(ctx context.Context, accountID string) ([]TenantOption, error) {
	if s == nil || s.database == nil || strings.TrimSpace(accountID) == "" {
		return nil, ErrAuthenticationRequired
	}
	if !s.database.Migrator().HasTable("auth_account_actors") {
		return nil, ErrAccountActorFoundationUnavailable
	}
	accountID = strings.TrimSpace(accountID)

	// A GLOBAL Account exposes one explicit application control-plane context.
	// It never enumerates active Tenants because Tenant identifiers are not
	// authorization grants.
	var globalBinding accountActorBindingProjection
	globalResult := s.database.WithContext(ctx).
		Table("auth_account_actors aa").
		Select(`aa.account_id AS account_id,
			aa.actor_id AS actor_id,
			a.actor_key AS actor_key,
			a.display_name AS display_name,
			aa.scope_type AS scope_type,
			aa.tenant_id AS tenant_id,
			aa.membership_id AS membership_id`).
		Joins("JOIN authz_actors a ON a.id = aa.actor_id AND a.active = ?", true).
		Where("aa.account_id = ? AND aa.scope_type = ?", accountID, "GLOBAL").
		Limit(1).
		Scan(&globalBinding)
	if globalResult.Error != nil {
		return nil, fmt.Errorf("find global Account Actor: %w", globalResult.Error)
	}
	if globalResult.RowsAffected > 0 {
		var roleCodes []string
		if err := s.database.WithContext(ctx).
			Table("authz_actor_role_grants g").
			Select("DISTINCT r.code").
			Joins("JOIN authz_roles r ON r.id = g.role_id AND r.active = ?", true).
			Where("g.actor_id = ? AND g.active = ? AND g.lifecycle_suspended = ? AND g.tenant_id = ?", globalBinding.ActorID, true, false, GlobalTenantScope).
			Order("r.code").
			Pluck("r.code", &roleCodes).Error; err != nil {
			return nil, fmt.Errorf("find global Account Actor roles: %w", err)
		}
		if len(roleCodes) == 0 {
			return []TenantOption{}, nil
		}
		return []TenantOption{{
			ID:            GlobalTenantScope,
			Code:          "GLOBAL",
			Name:          "Global administration",
			RoleCodes:     roleCodes,
			ActorRecordID: globalBinding.ActorID,
			ActorKey:      globalBinding.ActorKey,
			ActorScope:    string(ActorScopeApplication),
		}}, nil
	}

	// Ordinary tenant options are identity options, not Role-Grant options. A
	// Person with an active Account-owned Actor and active Membership may select
	// the tenant even when the Actor currently has zero delegated Roles, because
	// Bite 30D self-service authority is intrinsic to that identity chain.
	type tenantBinding struct {
		TenantID     string
		TenantCode   string
		TenantName   string
		ActorID      string
		ActorKey     string
		MembershipID string
	}
	var bindings []tenantBinding
	if err := s.database.WithContext(ctx).
		Table("auth_account_actors aa").
		Select(`aa.tenant_id AS tenant_id,
			t.code AS tenant_code,
			t.name AS tenant_name,
			aa.actor_id AS actor_id,
			a.actor_key AS actor_key,
			aa.membership_id AS membership_id`).
		Joins("JOIN authz_actors a ON a.id = aa.actor_id AND a.active = ?", true).
		Joins("JOIN tenants t ON t.id = aa.tenant_id AND t.active = ?", true).
		Joins("JOIN person_tenant_memberships m ON m.id = aa.membership_id AND m.tenant_id = aa.tenant_id").
		Joins("JOIN auth_account_people ap ON ap.account_id = aa.account_id AND ap.person_id = m.person_id").
		Joins("JOIN reference_data status ON status.id = m.status_id AND status.tenant_id = m.tenant_id AND status.type = ? AND status.active = ? AND status.code = ?", "person_status", true, "ACTIVE").
		Where("aa.account_id = ? AND aa.scope_type = ?", accountID, "TENANT").
		Order("t.name ASC, t.code ASC, t.id ASC").
		Scan(&bindings).Error; err != nil {
		return nil, fmt.Errorf("list Account tenant Actors: %w", err)
	}

	options := make([]TenantOption, 0, len(bindings))
	for _, binding := range bindings {
		var roleCodes []string
		if err := s.database.WithContext(ctx).
			Table("authz_actor_role_grants g").
			Select("r.code").
			Joins("JOIN authz_roles r ON r.id = g.role_id AND r.active = ?", true).
			Where("g.actor_id = ? AND g.tenant_id = ? AND g.active = ? AND g.lifecycle_suspended = ?", binding.ActorID, binding.TenantID, true, false).
			Order("r.code").
			Pluck("r.code", &roleCodes).Error; err != nil {
			return nil, fmt.Errorf("list Account tenant Actor roles: %w", err)
		}
		options = append(options, TenantOption{
			ID:            binding.TenantID,
			Code:          binding.TenantCode,
			Name:          binding.TenantName,
			RoleCodes:     roleCodes,
			ActorRecordID: binding.ActorID,
			ActorKey:      binding.ActorKey,
			ActorScope:    string(ActorScopeTenant),
			MembershipID:  binding.MembershipID,
		})
	}
	return options, nil
}
