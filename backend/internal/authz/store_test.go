package authz

import (
	"context"
	"errors"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"

	appdb "enterpriseremotesystems/backend/internal/db"
	"gorm.io/gorm"
)

func TestSeedAuthorizationCatalogCreatesCoreRolesAndGrants(t *testing.T) {
	database := newAuthzTestDB(t)

	var roles int64
	if err := database.Model(&AuthzRole{}).Count(&roles).Error; err != nil {
		t.Fatalf("count roles: %v", err)
	}
	if roles != 4 {
		t.Fatalf("expected 4 delegated roles after removal of PERSON self-service role, got %d", roles)
	}

	var personRoles int64
	if err := database.Model(&AuthzRole{}).Where("code = ?", string(RolePerson)).Count(&personRoles).Error; err != nil {
		t.Fatalf("count legacy Person roles: %v", err)
	}
	if personRoles != 0 {
		t.Fatalf("fresh 30D catalog must not seed PERSON as a delegable role, got %d rows", personRoles)
	}

	var expenseReceiptBackfill int64
	if err := database.Model(&AuthzRolePermission{}).
		Joins("JOIN authz_roles ON authz_roles.id = authz_role_permissions.role_id").
		Where("authz_roles.code = ? AND permission_code = ?", string(RoleExpenseOperator), string(PermissionLedgerReceiptsBackfill)).
		Count(&expenseReceiptBackfill).Error; err != nil {
		t.Fatalf("count expense backfill permission: %v", err)
	}
	if expenseReceiptBackfill != 0 {
		t.Fatalf("expense operator must not receive receipt backfill permission")
	}

	var expenseReceiptReturn int64
	if err := database.Model(&AuthzRolePermission{}).
		Joins("JOIN authz_roles ON authz_roles.id = authz_role_permissions.role_id").
		Where("authz_roles.code = ? AND permission_code = ?", string(RoleExpenseOperator), string(PermissionLedgerReceiptsReturn)).
		Count(&expenseReceiptReturn).Error; err != nil {
		t.Fatalf("count expense return permission: %v", err)
	}
	if expenseReceiptReturn != 1 {
		t.Fatalf("expected expense operator to receive receipt return permission, got %d", expenseReceiptReturn)
	}

	var expenseGoldPriceManage int64
	if err := database.Model(&AuthzRolePermission{}).
		Joins("JOIN authz_roles ON authz_roles.id = authz_role_permissions.role_id").
		Where("authz_roles.code = ? AND permission_code = ?", string(RoleExpenseOperator), string(PermissionGoldPricesManage)).
		Count(&expenseGoldPriceManage).Error; err != nil {
		t.Fatalf("count expense gold-price administration permission: %v", err)
	}
	if expenseGoldPriceManage != 0 {
		t.Fatalf("expense operator must not receive sensitive gold-price administration permission")
	}

	for _, role := range []RoleCode{RoleEarningsOperator, RoleExpenseOperator} {
		var operatorGoldProductionManage int64
		if err := database.Model(&AuthzRolePermission{}).
			Joins("JOIN authz_roles ON authz_roles.id = authz_role_permissions.role_id").
			Where("authz_roles.code = ? AND permission_code = ?", string(role), string(PermissionGoldProductionManage)).
			Count(&operatorGoldProductionManage).Error; err != nil {
			t.Fatalf("count %s gold-production administration permission: %v", role, err)
		}
		if operatorGoldProductionManage != 0 {
			t.Fatalf("%s must not receive Gold Production administration permission", role)
		}
	}

	var applicationAdminGoldProductionManage int64
	if err := database.Model(&AuthzRolePermission{}).
		Joins("JOIN authz_roles ON authz_roles.id = authz_role_permissions.role_id").
		Where("authz_roles.code = ? AND permission_code = ?", string(RoleApplicationAdmin), string(PermissionGoldProductionManage)).
		Count(&applicationAdminGoldProductionManage).Error; err != nil {
		t.Fatalf("count Application Administrator gold-production permission: %v", err)
	}
	if applicationAdminGoldProductionManage != 1 {
		t.Fatalf("Application Administrator must receive Gold Production administration permission")
	}

	var tenantAdminPermissions []AuthzRolePermission
	if err := database.
		Joins("JOIN authz_roles ON authz_roles.id = authz_role_permissions.role_id").
		Where("authz_roles.code = ?", string(RoleTenantAdmin)).
		Find(&tenantAdminPermissions).Error; err != nil {
		t.Fatalf("list Tenant Administrator permissions: %v", err)
	}
	if got, want := len(tenantAdminPermissions), len(tenantAdministratorDelegatedPermissions()); got != want {
		t.Fatalf("Tenant Administrator permission count = %d, want %d", got, want)
	}
	tenantAdminPermissionSet := map[string]struct{}{}
	for _, row := range tenantAdminPermissions {
		tenantAdminPermissionSet[row.PermissionCode] = struct{}{}
	}
	for _, permission := range tenantAdministratorDelegatedPermissions() {
		if _, ok := tenantAdminPermissionSet[string(permission)]; !ok {
			t.Fatalf("Tenant Administrator missing explicit permission %q", permission)
		}
	}
	for _, forbidden := range []Permission{
		PermissionAll,
		PermissionAuthzRead,
		PermissionAuthzManage,
		PermissionTenantsCreate,
		PermissionTenantsUpdate,
		PermissionPeopleSelfRead,
		PermissionPeopleSelfUpdate,
	} {
		if _, ok := tenantAdminPermissionSet[string(forbidden)]; ok {
			t.Fatalf("Tenant Administrator must not receive %q as delegated authority", forbidden)
		}
	}

	for _, tc := range []struct {
		role       RoleCode
		permission Permission
	}{
		{RoleEarningsOperator, PermissionAuthzSelfRead},
		{RoleExpenseOperator, PermissionAuthzSelfRead},
		{RoleEarningsOperator, PermissionTenantsRead},
		{RoleEarningsOperator, PermissionReferenceDataRead},
		{RoleExpenseOperator, PermissionTenantsRead},
		{RoleExpenseOperator, PermissionReferenceDataRead},
	} {
		var count int64
		if err := database.Model(&AuthzRolePermission{}).
			Joins("JOIN authz_roles ON authz_roles.id = authz_role_permissions.role_id").
			Where("authz_roles.code = ? AND permission_code = ?", string(tc.role), string(tc.permission)).
			Count(&count).Error; err != nil {
			t.Fatalf("count %s permission for %s: %v", tc.permission, tc.role, err)
		}
		if count != 1 {
			t.Fatalf("expected %s to receive %s, got %d grants", tc.role, tc.permission, count)
		}
	}
}

func TestGORMStoreListsActorTenantOptions(t *testing.T) {
	database := newAuthzTestDB(t)
	if err := database.AutoMigrate(&appdb.Tenant{}); err != nil {
		t.Fatalf("migrate tenants: %v", err)
	}
	now := time.Now().UTC()
	for _, tenant := range []appdb.Tenant{
		{BaseModel: appdb.BaseModel{ID: "tenant-a", CreatedAt: now, UpdatedAt: now}, Code: "A", Name: "Alpha", Active: true},
		{BaseModel: appdb.BaseModel{ID: "tenant-b", CreatedAt: now, UpdatedAt: now}, Code: "B", Name: "Beta", Active: true},
		{BaseModel: appdb.BaseModel{ID: "tenant-c", CreatedAt: now, UpdatedAt: now}, Code: "C", Name: "Inactive", Active: true},
	} {
		if err := database.Create(&tenant).Error; err != nil {
			t.Fatalf("create tenant: %v", err)
		}
	}
	// Tenant.Active declares a database default of true, so GORM substitutes
	// that default when Create receives the zero-value false. Deactivate the
	// fixture explicitly to exercise the tenant-option active filter.
	if err := database.Model(&appdb.Tenant{}).
		Where("id = ?", "tenant-c").
		Update("active", false).Error; err != nil {
		t.Fatalf("deactivate tenant: %v", err)
	}

	tenantActorID := createAuthzActor(t, database, "tenant-user@example.com", nil, nil)
	grantAuthzRole(t, database, tenantActorID, RoleExpenseOperator, "tenant-b")
	options, err := NewGORMStore(database).ListActorTenantOptions(context.Background(), tenantActorID)
	if err != nil {
		t.Fatalf("list tenant options: %v", err)
	}
	if got, want := options, []TenantOption{{ID: "tenant-b", Code: "B", Name: "Beta", RoleCodes: []string{string(RoleExpenseOperator)}}}; !reflect.DeepEqual(got, want) {
		t.Fatalf("tenant options = %#v, want %#v", got, want)
	}

	applicationActorID := createAuthzActor(t, database, "application-user@example.com", nil, nil)
	grantAuthzRole(t, database, applicationActorID, RoleApplicationAdmin, GlobalTenantScope)
	options, err = NewGORMStore(database).ListActorTenantOptions(context.Background(), applicationActorID)
	if err != nil {
		t.Fatalf("list application tenant options: %v", err)
	}
	if len(options) != 2 || options[0].ID != "tenant-a" || options[1].ID != "tenant-b" {
		t.Fatalf("expected all active tenants, got %#v", options)
	}
}

func TestGORMStoreFindActorLoadsTenantScopedRolePermissions(t *testing.T) {
	database := newAuthzTestDB(t)
	actorID := createAuthzActor(t, database, "expense-operator@example.com", nil, nil)
	grantAuthzRole(t, database, actorID, RoleExpenseOperator, "tenant-a")

	actor, err := NewGORMStore(database).FindActor(context.Background(), ActorLookup{ActorID: "expense-operator@example.com", TenantID: "tenant-a"})
	if err != nil {
		t.Fatalf("find actor: %v", err)
	}

	if actor.ID != "expense-operator@example.com" || actor.RecordID != actorID {
		t.Fatalf("unexpected actor identity: %#v", actor)
	}
	if actor.TenantID != "tenant-a" || actor.Scope != ActorScopeTenant {
		t.Fatalf("expected tenant-scoped actor, got %#v", actor)
	}
	if !actor.HasPermission(PermissionLedgerReceiptsReturn) {
		t.Fatalf("expected receipt return permission")
	}
	if actor.HasPermission(PermissionLedgerReceiptsBackfill) {
		t.Fatalf("expense operator must not have receipt backfill permission")
	}
	if got, want := actor.RoleCodes, []string{string(RoleExpenseOperator)}; !reflect.DeepEqual(got, want) {
		t.Fatalf("RoleCodes = %#v, want %#v", got, want)
	}
}

func TestGORMStoreFindActorEnforcesTenantGrantScope(t *testing.T) {
	database := newAuthzTestDB(t)
	actorID := createAuthzActor(t, database, "earnings-operator@example.com", nil, nil)
	grantAuthzRole(t, database, actorID, RoleEarningsOperator, "tenant-a")

	actor, err := NewGORMStore(database).FindActor(context.Background(), ActorLookup{ActorID: "earnings-operator@example.com", TenantID: "tenant-b"})
	if err != nil {
		t.Fatalf("find actor: %v", err)
	}

	if actor.HasPermission(PermissionPlanningCreate) {
		t.Fatalf("actor must not receive tenant-a permissions while acting in tenant-b")
	}
	if len(actor.RoleCodes) != 0 {
		t.Fatalf("expected no roles in tenant-b, got %#v", actor.RoleCodes)
	}
}

func TestGORMStoreFindActorLoadsApplicationControlPlaneAndTransitionalWildcard(t *testing.T) {
	database := newAuthzTestDB(t)
	actorID := createAuthzActor(t, database, "app-admin@example.com", nil, nil)
	grantAuthzRole(t, database, actorID, RoleApplicationAdmin, GlobalTenantScope)

	actor, err := NewGORMStore(database).FindActor(context.Background(), ActorLookup{ActorID: "app-admin@example.com", TenantID: "tenant-b"})
	if err != nil {
		t.Fatalf("find actor: %v", err)
	}

	if actor.Scope != ActorScopeApplication {
		t.Fatalf("expected application scope, got %q", actor.Scope)
	}
	if err := RequirePermission(actor, PermissionAuthzManage); err != nil {
		t.Fatalf("expected explicit application control-plane permission, got %v", err)
	}
	if err := RequirePermission(actor, PermissionJourneySettlementsClose); err != nil {
		t.Fatalf("expected transitional Application Administrator wildcard compatibility until Bite 30H, got %v", err)
	}
	if err := RequireTenantScope(actor, "tenant-b"); err != nil {
		t.Fatalf("expected application actor to access tenant-b, got %v", err)
	}
}

func TestGORMStoreFindActorDoesNotMergeGlobalAndTenantRoleIdentities(t *testing.T) {
	database := newAuthzTestDB(t)
	actorID := createAuthzActor(t, database, "mixed-scope@example.com", nil, nil)
	grantAuthzRole(t, database, actorID, RoleApplicationAdmin, GlobalTenantScope)
	grantAuthzRole(t, database, actorID, RoleExpenseOperator, "tenant-a")

	actor, err := NewGORMStore(database).FindActor(context.Background(), ActorLookup{ActorID: "mixed-scope@example.com", TenantID: "tenant-a"})
	if err != nil {
		t.Fatalf("find mixed-scope legacy actor: %v", err)
	}
	if actor.Scope != ActorScopeApplication {
		t.Fatalf("global role must resolve a global Actor identity, got %q", actor.Scope)
	}
	if !reflect.DeepEqual(actor.RoleCodes, []string{string(RoleApplicationAdmin)}) {
		t.Fatalf("global Actor must not merge tenant Role Codes into one effective identity, got %#v", actor.RoleCodes)
	}
}

func TestGORMStoreFindActorDoesNotManufactureIntrinsicSelfServiceFromLegacyLinks(t *testing.T) {
	database := newAuthzTestDB(t)
	personID := "person-123"
	collaboratorID := "collaborator-123"
	createAuthzActor(t, database, "person@example.com", &personID, &collaboratorID)

	actor, err := NewGORMStore(database).FindActor(context.Background(), ActorLookup{ActorID: "person@example.com", TenantID: "tenant-a"})
	if err != nil {
		t.Fatalf("find actor: %v", err)
	}

	if actor.Scope != ActorScopeTenant || actor.PersonID != personID || actor.CollaboratorID != collaboratorID {
		t.Fatalf("unexpected legacy persisted actor: %#v", actor)
	}
	if actor.HasPermission(PermissionPeopleSelfUpdate) || actor.HasIntrinsicPermission(PermissionPeopleSelfUpdate) {
		t.Fatalf("legacy Actor links alone must not establish intrinsic self-service: %#v", actor)
	}
	if len(actor.RoleCodes) != 0 || len(actor.DelegatedPermissions) != 0 {
		t.Fatalf("expected no delegated authority without an active Role Grant, got roles=%#v permissions=%#v", actor.RoleCodes, PermissionNames(actor.DelegatedPermissions))
	}
}

func TestResolveActorLoadsPersistedActorForForwardCompatibleHeaders(t *testing.T) {
	database := newAuthzTestDB(t)
	actorID := createAuthzActor(t, database, "tenant-admin@example.com", nil, nil)
	grantAuthzRole(t, database, actorID, RoleTenantAdmin, "tenant-a")

	actor, err := ResolveActor(context.Background(), NewGORMStore(database), headerGetter(map[string]string{
		HeaderActorID:  "tenant-admin@example.com",
		HeaderTenantID: "tenant-a",
	}))
	if err != nil {
		t.Fatalf("resolve actor: %v", err)
	}

	if actor.Source != ActorSourcePersisted {
		t.Fatalf("expected persisted actor source, got %q", actor.Source)
	}
	if err := RequirePermission(actor, PermissionExpensesCreate); err != nil {
		t.Fatalf("expected explicit Tenant Administrator expense permission, got %v", err)
	}
	if actor.HasPermission(PermissionAll) {
		t.Fatalf("Tenant Administrator must not retain wildcard delegated authority")
	}
	if actor.HasPermission(PermissionAuthzManage) {
		t.Fatalf("Tenant Administrator must not receive application authorization administration")
	}
}

func TestResolveActorPreservesLegacyHeaderCompatibility(t *testing.T) {
	database := newAuthzTestDB(t)

	actor, err := ResolveActor(context.Background(), NewGORMStore(database), headerGetter(map[string]string{
		HeaderAuthorizedBy: "legacy-backfill",
	}))
	if err != nil {
		t.Fatalf("resolve legacy actor: %v", err)
	}

	if actor.Source != ActorSourceHeaderAuthorizedBy || actor.ID != "legacy-backfill" {
		t.Fatalf("unexpected legacy actor: %#v", actor)
	}
}

func TestResolveActorRequiresTenantScopeForPersistedActorLookup(t *testing.T) {
	database := newAuthzTestDB(t)
	actorID := createAuthzActor(t, database, "tenant-admin-no-scope@example.com", nil, nil)
	grantAuthzRole(t, database, actorID, RoleTenantAdmin, "tenant-a")

	actor, err := ResolveActor(context.Background(), NewGORMStore(database), headerGetter(map[string]string{
		HeaderActorID: "tenant-admin-no-scope@example.com",
	}))
	if actor != nil {
		t.Fatalf("expected no actor, got %#v", actor)
	}
	if !errors.Is(err, ErrMissingActor) {
		t.Fatalf("expected ErrMissingActor, got %v", err)
	}
}

func TestResolveActorPrefersPersistedGrantsOverHeaderPermissions(t *testing.T) {
	database := newAuthzTestDB(t)
	actorID := createAuthzActor(t, database, "expense-operator-override@example.com", nil, nil)
	grantAuthzRole(t, database, actorID, RoleExpenseOperator, "tenant-a")

	actor, err := ResolveActor(context.Background(), NewGORMStore(database), headerGetter(map[string]string{
		HeaderActorID:          "expense-operator-override@example.com",
		HeaderTenantID:         "tenant-a",
		HeaderActorPermissions: string(PermissionLedgerReceiptsBackfill),
	}))
	if err != nil {
		t.Fatalf("resolve actor: %v", err)
	}

	if actor.Source != ActorSourcePersisted {
		t.Fatalf("expected persisted actor source, got %q", actor.Source)
	}
	if actor.HasPermission(PermissionLedgerReceiptsBackfill) {
		t.Fatalf("persisted grants must override header-supplied permissions")
	}
	if !actor.HasPermission(PermissionLedgerReceiptsReturn) {
		t.Fatalf("expected persisted expense operator receipt return permission")
	}
}

func TestResolveActorRejectsUnknownPersistedActorWithoutTemporaryPermissions(t *testing.T) {
	database := newAuthzTestDB(t)

	actor, err := ResolveActor(context.Background(), NewGORMStore(database), headerGetter(map[string]string{
		HeaderActorID:  "missing-persisted@example.com",
		HeaderTenantID: "tenant-a",
	}))
	if actor != nil {
		t.Fatalf("expected no actor, got %#v", actor)
	}
	if !errors.Is(err, ErrMissingActor) {
		t.Fatalf("expected ErrMissingActor, got %v", err)
	}
}

func TestResolveActorRejectsTemporaryHeaderPermissionsForUnpersistedActors(t *testing.T) {
	database := newAuthzTestDB(t)

	actor, err := ResolveActor(context.Background(), NewGORMStore(database), headerGetter(map[string]string{
		HeaderActorID:          "temporary-tests@example.com",
		HeaderTenantID:         "tenant-a",
		HeaderActorPermissions: string(PermissionLedgerReceiptsPrint),
	}))
	if actor != nil {
		t.Fatalf("expected no actor, got %#v", actor)
	}
	if !errors.Is(err, ErrMissingActor) {
		t.Fatalf("expected persisted actor lookup to reject header permissions, got %v", err)
	}
}

func TestGORMStoreFindActorRejectsMissingPersistedActor(t *testing.T) {
	database := newAuthzTestDB(t)

	actor, err := NewGORMStore(database).FindActor(context.Background(), ActorLookup{ActorID: "missing@example.com", TenantID: "tenant-a"})
	if actor != nil {
		t.Fatalf("expected no actor, got %#v", actor)
	}
	if !errors.Is(err, ErrMissingActor) {
		t.Fatalf("expected ErrMissingActor, got %v", err)
	}
}

func TestGORMStoreValidatesRoleGrantScope(t *testing.T) {
	database := newAuthzTestDB(t)
	actorID := createAuthzActor(t, database, "scope-validation@example.com", nil, nil)
	store := NewGORMStore(database)

	_, err := store.GrantActorRole(context.Background(), actorID, GrantActorRoleRequest{
		RoleCode: string(RoleApplicationAdmin),
		TenantID: "tenant-a",
	})
	var validation ValidationError
	if !errors.As(err, &validation) || validation.ValidationFields()["tenantId"] == "" {
		t.Fatalf("expected application role tenant validation, got %T %v", err, err)
	}

	// A legacy PERSON row may exist in upgraded databases, but it is no longer
	// delegable in 30D.
	legacyPersonRole := AuthzRole{ID: "legacy-person-role", Code: string(RolePerson), Label: "Person", ScopeType: string(ActorScopeSelf), Active: true, CreatedAt: time.Now().UTC(), UpdatedAt: time.Now().UTC()}
	if err := database.Create(&legacyPersonRole).Error; err != nil {
		t.Fatalf("create legacy Person role fixture: %v", err)
	}
	_, err = store.GrantActorRole(context.Background(), actorID, GrantActorRoleRequest{
		RoleCode: string(RolePerson),
		TenantID: "tenant-a",
	})
	if !errors.As(err, &validation) || validation.ValidationFields()["roleCode"] == "" {
		t.Fatalf("expected intrinsic self-service role rejection, got %T %v", err, err)
	}

	_, err = store.GrantActorRole(context.Background(), actorID, GrantActorRoleRequest{
		RoleCode: string(RoleExpenseOperator),
		TenantID: GlobalTenantScope,
	})
	if !errors.As(err, &validation) || validation.ValidationFields()["tenantId"] == "" {
		t.Fatalf("expected tenant role scope validation, got %T %v", err, err)
	}
}

func TestGORMStoreAllowsDeactivatingNonAdministratorWhenOnlyOneApplicationAdministratorExists(t *testing.T) {
	database := newAuthzTestDB(t)
	adminID := createAuthzActor(t, database, "remaining-app-admin@example.com", nil, nil)
	grantAuthzRole(t, database, adminID, RoleApplicationAdmin, GlobalTenantScope)
	operatorID := createAuthzActor(t, database, "operator@example.com", nil, nil)
	grantAuthzRole(t, database, operatorID, RoleExpenseOperator, "default")

	updated, err := NewGORMStore(database).SetActorActive(context.Background(), operatorID, false)
	if err != nil {
		t.Fatalf("deactivate non-admin actor: %v", err)
	}
	if updated.Active {
		t.Fatalf("expected non-admin actor to be inactive")
	}
}

func TestGORMStorePreventsDeactivatingLastApplicationAdministrator(t *testing.T) {
	database := newAuthzTestDB(t)
	actorID := createAuthzActor(t, database, "only-app-admin@example.com", nil, nil)
	grantAuthzRole(t, database, actorID, RoleApplicationAdmin, GlobalTenantScope)

	_, err := NewGORMStore(database).SetActorActive(context.Background(), actorID, false)
	if err == nil {
		t.Fatalf("expected last application administrator deactivation to be rejected")
	}
	var validation ValidationError
	if !errors.As(err, &validation) || validation.ValidationFields()["active"] == "" {
		t.Fatalf("expected active validation error, got %T %v", err, err)
	}
}

func TestGORMStoreAllowsDeactivatingApplicationAdministratorWhenAnotherRemains(t *testing.T) {
	database := newAuthzTestDB(t)
	firstID := createAuthzActor(t, database, "first-app-admin@example.com", nil, nil)
	secondID := createAuthzActor(t, database, "second-app-admin@example.com", nil, nil)
	grantAuthzRole(t, database, firstID, RoleApplicationAdmin, GlobalTenantScope)
	grantAuthzRole(t, database, secondID, RoleApplicationAdmin, GlobalTenantScope)

	updated, err := NewGORMStore(database).SetActorActive(context.Background(), firstID, false)
	if err != nil {
		t.Fatalf("deactivate application administrator: %v", err)
	}
	if updated.Active {
		t.Fatalf("expected actor to be inactive: %#v", updated)
	}
}

func TestGORMStorePreventsRevokingLastApplicationAdministratorGrant(t *testing.T) {
	database := newAuthzTestDB(t)
	actorID := createAuthzActor(t, database, "only-granted-app-admin@example.com", nil, nil)
	grantAuthzRole(t, database, actorID, RoleApplicationAdmin, GlobalTenantScope)

	var grant AuthzActorRoleGrant
	if err := database.Where("actor_id = ? AND active = ?", actorID, true).First(&grant).Error; err != nil {
		t.Fatalf("find application administrator grant: %v", err)
	}
	_, err := NewGORMStore(database).RevokeActorRoleGrant(context.Background(), actorID, grant.ID)
	if err == nil {
		t.Fatalf("expected last application administrator grant revocation to be rejected")
	}
	var validation ValidationError
	if !errors.As(err, &validation) || validation.ValidationFields()["grantId"] == "" {
		t.Fatalf("expected grantId validation error, got %T %v", err, err)
	}
}

func TestGORMStoreListTenantActorsFiltersByTenantAndActiveDelegatedAuthority(t *testing.T) {
	database := newAuthzTestDB(t)
	store := NewGORMStore(database)

	tenantAdminID := createAuthzActor(t, database, "tenant-admin@example.com", nil, nil)
	grantAuthzRole(t, database, tenantAdminID, RoleTenantAdmin, "tenant-a")
	earningsID := createAuthzActor(t, database, "earnings@example.com", nil, nil)
	grantAuthzRole(t, database, earningsID, RoleEarningsOperator, "tenant-a")
	otherTenantID := createAuthzActor(t, database, "other-tenant@example.com", nil, nil)
	grantAuthzRole(t, database, otherTenantID, RoleEarningsOperator, "tenant-b")
	createAuthzActor(t, database, "person-only@example.com", nil, nil)
	inactiveID := createAuthzActor(t, database, "inactive@example.com", nil, nil)
	grantAuthzRole(t, database, inactiveID, RoleExpenseOperator, "tenant-a")
	if err := database.Model(&AuthzActor{}).Where("id = ?", inactiveID).Update("active", false).Error; err != nil {
		t.Fatalf("deactivate actor: %v", err)
	}

	actors, err := store.ListTenantActors(context.Background(), "tenant-a")
	if err != nil {
		t.Fatalf("list tenant actors: %v", err)
	}
	if got, want := len(actors), 2; got != want {
		t.Fatalf("expected %d tenant actors, got %#v", want, actors)
	}
	if actors[0].ActorKey != "earnings@example.com" || actors[1].ActorKey != "tenant-admin@example.com" {
		t.Fatalf("unexpected tenant actor projection: %#v", actors)
	}
	for _, actor := range actors {
		if len(actor.RoleGrants) != 0 {
			t.Fatalf("tenant actor directory must not expose role grants, got %#v", actor)
		}
	}
}

func TestGORMStoreTenantRoleDelegationListsMembersWithNoRoleAndOnlyOperatorGrants(t *testing.T) {
	database := newAuthzTestDB(t)
	installTenantRoleDelegationFixtureTables(t, database)
	store := NewGORMStore(database)

	personOnlyID := createAuthzActor(t, database, "person-only-member@example.com", nil, nil)
	bindActiveTenantMemberActor(t, database, personOnlyID, "tenant-a")

	expenseID := createAuthzActor(t, database, "expense-member@example.com", nil, nil)
	bindActiveTenantMemberActor(t, database, expenseID, "tenant-a")
	grantAuthzRole(t, database, expenseID, RoleExpenseOperator, "tenant-a")

	tenantAdminID := createAuthzActor(t, database, "tenant-admin-member@example.com", nil, nil)
	bindActiveTenantMemberActor(t, database, tenantAdminID, "tenant-a")
	grantAuthzRole(t, database, tenantAdminID, RoleTenantAdmin, "tenant-a")

	otherTenantID := createAuthzActor(t, database, "other-tenant-member@example.com", nil, nil)
	bindActiveTenantMemberActor(t, database, otherTenantID, "tenant-b")

	inactiveID := createAuthzActor(t, database, "inactive-member@example.com", nil, nil)
	bindActiveTenantMemberActor(t, database, inactiveID, "tenant-a")
	if err := database.Model(&AuthzActor{}).Where("id = ?", inactiveID).Update("active", false).Error; err != nil {
		t.Fatalf("deactivate tenant member Actor: %v", err)
	}

	actors, err := store.ListTenantRoleActors(context.Background(), "tenant-a")
	if err != nil {
		t.Fatalf("list tenant role actors: %v", err)
	}
	if got, want := len(actors), 4; got != want {
		t.Fatalf("expected %d tenant member actors, got %#v", want, actors)
	}

	byKey := map[string]ActorResponse{}
	for _, actor := range actors {
		byKey[actor.ActorKey] = actor
	}
	if got := byKey["person-only-member@example.com"].RoleGrants; len(got) != 0 {
		t.Fatalf("person-only member must be delegable before any role is granted, got %#v", got)
	}
	if got := byKey["expense-member@example.com"].RoleGrants; len(got) != 1 || got[0].RoleCode != string(RoleExpenseOperator) {
		t.Fatalf("expected only expense operator grant, got %#v", got)
	}
	if got := byKey["tenant-admin-member@example.com"].RoleGrants; len(got) != 0 {
		t.Fatalf("tenant delegation projection must not expose TENANT_ADMIN grants, got %#v", got)
	}
	if inactive := byKey["inactive-member@example.com"]; inactive.ID == "" || inactive.Active {
		t.Fatalf("expected inactive tenant Actor to remain visible for lifecycle management, got %#v", inactive)
	} else if inactive.Binding == nil || !inactive.Binding.MembershipActive || inactive.Binding.TenantID != "tenant-a" {
		t.Fatalf("expected inactive Actor to retain same-tenant Membership facts, got %#v", inactive.Binding)
	}
	if _, ok := byKey["other-tenant-member@example.com"]; ok {
		t.Fatalf("cross-tenant member leaked into tenant-a delegation projection")
	}
}

func TestGORMStoreTenantActorLifecycleIsTenantScopedAndRequiresActiveMembershipForActivation(t *testing.T) {
	database := newAuthzTestDB(t)
	installTenantRoleDelegationFixtureTables(t, database)
	store := NewGORMStore(database)

	actorID := createAuthzActor(t, database, "identity-d@example.test", nil, nil)
	bindActiveTenantMemberActor(t, database, actorID, "tenant-a")

	deactivated, err := store.SetTenantActorActive(context.Background(), "tenant-a", actorID, false)
	if err != nil {
		t.Fatalf("deactivate tenant Actor: %v", err)
	}
	if deactivated.Active {
		t.Fatalf("expected tenant Actor inactive, got %#v", deactivated)
	}

	listed, err := store.ListTenantRoleActors(context.Background(), "tenant-a")
	if err != nil {
		t.Fatalf("list tenant Actors after deactivation: %v", err)
	}
	if len(listed) != 1 || listed[0].ID != actorID || listed[0].Active {
		t.Fatalf("expected inactive Actor to remain tenant-visible, got %#v", listed)
	}

	reactivated, err := store.SetTenantActorActive(context.Background(), "tenant-a", actorID, true)
	if err != nil {
		t.Fatalf("reactivate tenant Actor: %v", err)
	}
	if !reactivated.Active {
		t.Fatalf("expected tenant Actor active, got %#v", reactivated)
	}

	if _, err := store.SetTenantActorActive(context.Background(), "tenant-b", actorID, false); err == nil {
		t.Fatal("expected cross-tenant Actor lifecycle action to be rejected")
	}

	if err := database.Exec(
		"INSERT OR IGNORE INTO reference_data (id, tenant_id, type, code, active) VALUES (?, ?, ?, ?, ?)",
		"status-inactive-tenant-a", "tenant-a", "person_status", "INACTIVE", true,
	).Error; err != nil {
		t.Fatalf("create inactive Membership status: %v", err)
	}
	if err := database.Exec(
		"UPDATE person_tenant_memberships SET status_id = ? WHERE id = ?",
		"status-inactive-tenant-a", "membership-"+actorID,
	).Error; err != nil {
		t.Fatalf("deactivate Membership: %v", err)
	}
	if _, err := store.SetTenantActorActive(context.Background(), "tenant-a", actorID, false); err != nil {
		t.Fatalf("deactivate Actor with inactive Membership: %v", err)
	}
	if _, err := store.SetTenantActorActive(context.Background(), "tenant-a", actorID, true); err == nil {
		t.Fatal("expected Actor activation with inactive Membership to be rejected")
	}
}

func TestGORMStoreTenantRoleDelegationRestrictsRoleAndTenant(t *testing.T) {
	database := newAuthzTestDB(t)
	installTenantRoleDelegationFixtureTables(t, database)
	store := NewGORMStore(database)

	actorID := createAuthzActor(t, database, "delegation-target@example.com", nil, nil)
	bindActiveTenantMemberActor(t, database, actorID, "tenant-a")

	grant, err := store.GrantTenantOperatorRole(context.Background(), "tenant-a", actorID, string(RoleEarningsOperator))
	if err != nil {
		t.Fatalf("grant tenant earnings operator: %v", err)
	}
	if grant.RoleCode != string(RoleEarningsOperator) || grant.TenantID != "tenant-a" || !grant.Active {
		t.Fatalf("unexpected tenant operator grant: %#v", grant)
	}

	if _, err := store.GrantTenantOperatorRole(context.Background(), "tenant-a", actorID, string(RoleTenantAdmin)); err == nil {
		t.Fatal("expected tenant administrator delegation to be rejected")
	}
	if _, err := store.GrantTenantOperatorRole(context.Background(), "tenant-b", actorID, string(RoleExpenseOperator)); err == nil {
		t.Fatal("expected cross-tenant operator delegation to be rejected")
	}

	revoked, err := store.RevokeTenantOperatorRoleGrant(context.Background(), "tenant-a", actorID, grant.ID)
	if err != nil {
		t.Fatalf("revoke tenant earnings operator: %v", err)
	}
	if revoked.Active {
		t.Fatalf("expected revoked tenant operator grant, got %#v", revoked)
	}
}

func TestGORMStoreListActorsIncludesAuthoritativeTenantBinding(t *testing.T) {
	database := newAuthzTestDB(t)
	installTenantRoleDelegationFixtureTables(t, database)
	store := NewGORMStore(database)

	actorID := createAuthzActor(t, database, "bound-tenant-admin@example.com", nil, nil)
	bindActiveTenantMemberActor(t, database, actorID, "tenant-a")

	actors, err := store.ListActors(context.Background())
	if err != nil {
		t.Fatalf("list authorization actors: %v", err)
	}

	var found *ActorResponse
	for index := range actors {
		if actors[index].ID == actorID {
			found = &actors[index]
			break
		}
	}
	if found == nil {
		t.Fatalf("expected bound Actor %s in authorization catalog, got %#v", actorID, actors)
	}
	if found.Binding == nil {
		t.Fatalf("expected authoritative Account -> Actor binding, got %#v", found)
	}
	if found.Binding.AccountID != "account-"+actorID ||
		found.Binding.AccountLogin != "login-"+actorID+"@example.test" {
		t.Fatalf("unexpected Authentication Account binding: %#v", found.Binding)
	}
	if found.Binding.ScopeType != "TENANT" || found.Binding.TenantID != "tenant-a" {
		t.Fatalf("unexpected tenant binding: %#v", found.Binding)
	}
	if found.Binding.MembershipID == "" ||
		found.Binding.MembershipTenantID != "tenant-a" ||
		!found.Binding.MembershipActive ||
		!found.Binding.MembershipSameTenant {
		t.Fatalf("expected active same-tenant Membership-backed binding, got %#v", found.Binding)
	}
}

func TestGORMStoreListActorsDistinguishesActiveCrossTenantMembershipMismatch(t *testing.T) {
	database := newAuthzTestDB(t)
	installTenantRoleDelegationFixtureTables(t, database)
	store := NewGORMStore(database)

	actorID := createAuthzActor(t, database, "mismatched-membership@example.com", nil, nil)
	accountID := "account-" + actorID
	membershipID := "membership-" + actorID
	if err := database.Exec(
		"INSERT INTO auth_user_accounts (id, login) VALUES (?, ?)",
		accountID,
		"login-"+actorID+"@example.test",
	).Error; err != nil {
		t.Fatalf("create Authentication Account fixture: %v", err)
	}
	if err := database.Exec(
		"INSERT INTO reference_data (id, tenant_id, type, code, active) VALUES (?, ?, ?, ?, ?)",
		"status-active-tenant-b",
		"tenant-b",
		"person_status",
		"ACTIVE",
		true,
	).Error; err != nil {
		t.Fatalf("create tenant-b active membership status: %v", err)
	}
	if err := database.Exec(
		"INSERT INTO person_tenant_memberships (id, tenant_id, status_id) VALUES (?, ?, ?)",
		membershipID,
		"tenant-b",
		"status-active-tenant-b",
	).Error; err != nil {
		t.Fatalf("create tenant-b Membership fixture: %v", err)
	}
	if err := database.Exec(
		"INSERT INTO auth_account_actors (account_id, actor_id, scope_type, tenant_id, membership_id) VALUES (?, ?, ?, ?, ?)",
		accountID,
		actorID,
		"TENANT",
		"tenant-a",
		membershipID,
	).Error; err != nil {
		t.Fatalf("bind mismatched tenant actor fixture: %v", err)
	}

	actors, err := store.ListActors(context.Background())
	if err != nil {
		t.Fatalf("list authorization actors: %v", err)
	}

	for _, actor := range actors {
		if actor.ID != actorID {
			continue
		}
		if actor.Binding == nil {
			t.Fatalf("expected Account -> Actor binding, got %#v", actor)
		}
		if !actor.Binding.MembershipActive {
			t.Fatalf("expected Membership itself to remain ACTIVE, got %#v", actor.Binding)
		}
		if actor.Binding.MembershipTenantID != "tenant-b" || actor.Binding.MembershipSameTenant {
			t.Fatalf("expected active Membership to be identified as cross-tenant, got %#v", actor.Binding)
		}
		return
	}

	t.Fatalf("expected mismatched Actor %s in authorization catalog", actorID)
}

func TestGORMStoreApplicationAdminTenantRoleGrantPersistsForBoundActor(t *testing.T) {
	database := newAuthzTestDB(t)
	installTenantRoleDelegationFixtureTables(t, database)
	store := NewGORMStore(database)

	actorID := createAuthzActor(t, database, "application-admin-target@example.com", nil, nil)
	bindActiveTenantMemberActor(t, database, actorID, "tenant-a")

	grant, err := store.GrantActorRole(context.Background(), actorID, GrantActorRoleRequest{
		RoleCode: string(RoleTenantAdmin),
		TenantID: "tenant-a",
	})
	if err != nil {
		t.Fatalf("grant TENANT_ADMIN to active tenant-bound Actor: %v", err)
	}
	if !grant.Active || grant.RoleCode != string(RoleTenantAdmin) || grant.TenantID != "tenant-a" {
		t.Fatalf("unexpected TENANT_ADMIN grant: %#v", grant)
	}

	actors, err := store.ListActors(context.Background())
	if err != nil {
		t.Fatalf("list authorization actors after TENANT_ADMIN grant: %v", err)
	}
	for _, actor := range actors {
		if actor.ID != actorID {
			continue
		}
		if actor.Binding == nil || actor.Binding.TenantID != "tenant-a" || !actor.Binding.MembershipActive {
			t.Fatalf("expected active tenant binding after grant, got %#v", actor.Binding)
		}
		if len(actor.RoleGrants) != 1 || actor.RoleGrants[0].RoleCode != string(RoleTenantAdmin) || actor.RoleGrants[0].TenantID != "tenant-a" || !actor.RoleGrants[0].Active {
			t.Fatalf("expected persisted TENANT_ADMIN grant in Actor catalog, got %#v", actor.RoleGrants)
		}
		return
	}
	t.Fatalf("expected granted Actor %s in authorization catalog", actorID)
}

func installTenantRoleDelegationFixtureTables(t *testing.T, database *gorm.DB) {
	t.Helper()
	for _, statement := range []string{
		`CREATE TABLE IF NOT EXISTS auth_user_accounts (
			id TEXT PRIMARY KEY,
			login TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS auth_account_actors (
			account_id TEXT NOT NULL,
			actor_id TEXT NOT NULL,
			scope_type TEXT NOT NULL,
			tenant_id TEXT,
			membership_id TEXT
		)`,
		`CREATE TABLE IF NOT EXISTS person_tenant_memberships (
			id TEXT PRIMARY KEY,
			tenant_id TEXT NOT NULL,
			status_id TEXT NOT NULL
		)`,
		`CREATE TABLE IF NOT EXISTS reference_data (
			id TEXT PRIMARY KEY,
			tenant_id TEXT NOT NULL,
			type TEXT NOT NULL,
			code TEXT NOT NULL,
			active INTEGER NOT NULL
		)`,
	} {
		if err := database.Exec(statement).Error; err != nil {
			t.Fatalf("install tenant role delegation fixture table: %v", err)
		}
	}
}

func bindActiveTenantMemberActor(t *testing.T, database *gorm.DB, actorID string, tenantID string) {
	t.Helper()
	accountID := "account-" + actorID
	membershipID := "membership-" + actorID
	statusID := "status-active-" + tenantID
	if err := database.Exec(
		"INSERT OR IGNORE INTO auth_user_accounts (id, login) VALUES (?, ?)",
		accountID,
		"login-"+actorID+"@example.test",
	).Error; err != nil {
		t.Fatalf("create Authentication Account fixture: %v", err)
	}
	if err := database.Exec(
		"INSERT OR IGNORE INTO reference_data (id, tenant_id, type, code, active) VALUES (?, ?, ?, ?, ?)",
		statusID,
		tenantID,
		"person_status",
		"ACTIVE",
		true,
	).Error; err != nil {
		t.Fatalf("create tenant-local active membership status: %v", err)
	}
	if err := database.Exec(
		"INSERT INTO person_tenant_memberships (id, tenant_id, status_id) VALUES (?, ?, ?)",
		membershipID,
		tenantID,
		statusID,
	).Error; err != nil {
		t.Fatalf("create active tenant membership: %v", err)
	}
	if err := database.Exec(
		"INSERT INTO auth_account_actors (account_id, actor_id, scope_type, tenant_id, membership_id) VALUES (?, ?, ?, ?, ?)",
		accountID,
		actorID,
		"TENANT",
		tenantID,
		membershipID,
	).Error; err != nil {
		t.Fatalf("bind tenant actor: %v", err)
	}
}

func newAuthzTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	database, err := appdb.Open(filepath.Join(t.TempDir(), "authz.db"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	if err := AutoMigrate(database); err != nil {
		t.Fatalf("auto migrate authz: %v", err)
	}
	if err := SeedAuthorizationCatalog(database); err != nil {
		t.Fatalf("seed authorization catalog: %v", err)
	}
	return database
}

func createAuthzActor(t *testing.T, database *gorm.DB, actorKey string, personID *string, collaboratorID *string) string {
	t.Helper()
	now := time.Now().UTC()
	actor := AuthzActor{ID: "authz-actor-" + actorKey, ActorKey: actorKey, DisplayName: actorKey, PersonID: personID, CollaboratorID: collaboratorID, Active: true, CreatedAt: now, UpdatedAt: now}
	if err := database.Create(&actor).Error; err != nil {
		t.Fatalf("create authz actor: %v", err)
	}
	return actor.ID
}

func grantAuthzRole(t *testing.T, database *gorm.DB, actorID string, role RoleCode, tenantID string) {
	t.Helper()
	if err := GrantRole(database, actorID, role, tenantID); err != nil {
		t.Fatalf("grant role %s: %v", role, err)
	}
}

func TestGORMStoreRecordsAndListsAuthorizationAuditLogs(t *testing.T) {
	database := newAuthzTestDB(t)
	store := NewGORMStore(database)

	actor := &Actor{ID: "auditor@example.com", RecordID: "authz-actor-auditor", TenantID: "tenant-a"}
	if err := store.RecordAuthorizationAudit(context.Background(), AuthorizationAuditEntry{
		Actor:         actor,
		Permission:    PermissionLedgerCorrectionsCreate,
		Operation:     "ledger_entries.reverse",
		TargetType:    "ledger_entry",
		TargetID:      "entry-1",
		Decision:      AuditDecisionAuthorized,
		RequestMethod: "POST",
		RequestPath:   "/api/v1/ledger-entries/entry-1/reverse",
	}); err != nil {
		t.Fatalf("record audit log: %v", err)
	}

	logs, err := store.ListAuthorizationAuditLogs(context.Background(), AuditLogFilter{ActorID: "auditor@example.com"})
	if err != nil {
		t.Fatalf("list audit logs: %v", err)
	}
	if len(logs) != 1 {
		t.Fatalf("expected 1 audit log, got %#v", logs)
	}
	got := logs[0]
	if got.ActorID != "auditor@example.com" || got.PermissionCode != string(PermissionLedgerCorrectionsCreate) || got.Operation != "ledger_entries.reverse" || got.TargetID != "entry-1" || got.Decision != AuditDecisionAuthorized {
		t.Fatalf("unexpected audit log: %#v", got)
	}
}

func TestAuthorizationAuditLogsAreAppendOnly(t *testing.T) {
	database := newAuthzTestDB(t)
	store := NewGORMStore(database)

	if err := store.RecordAuthorizationAudit(context.Background(), AuthorizationAuditEntry{
		FallbackActorID: "audit-admin@example.com",
		TenantID:        "tenant-a",
		Permission:      PermissionAuthzManage,
		Operation:       "authz.actors.create",
		TargetType:      "authz_actor",
		TargetID:        "actor-1",
		Decision:        AuditDecisionAuthorized,
	}); err != nil {
		t.Fatalf("record audit log: %v", err)
	}

	var row AuthzAuditLog
	if err := database.Where("operation = ?", "authz.actors.create").First(&row).Error; err != nil {
		t.Fatalf("load audit log: %v", err)
	}

	if err := database.Exec("UPDATE authz_audit_logs SET decision = ? WHERE id = ?", AuditDecisionDenied, row.ID).Error; err == nil {
		t.Fatalf("expected raw SQL update to be rejected")
	} else if !strings.Contains(err.Error(), "immutable") {
		t.Fatalf("expected immutable update error, got %v", err)
	}

	if err := database.Exec("DELETE FROM authz_audit_logs WHERE id = ?", row.ID).Error; err == nil {
		t.Fatalf("expected raw SQL delete to be rejected")
	} else if !strings.Contains(err.Error(), "immutable") {
		t.Fatalf("expected immutable delete error, got %v", err)
	}

	var after AuthzAuditLog
	if err := database.First(&after, "id = ?", row.ID).Error; err != nil {
		t.Fatalf("audit log must remain after rejected delete: %v", err)
	}
	if after.Decision != AuditDecisionAuthorized {
		t.Fatalf("audit log decision changed despite rejected update: got %q", after.Decision)
	}
}

func TestAuthorizationAuditLogModelRejectsORMMutation(t *testing.T) {
	database := newAuthzTestDB(t)
	store := NewGORMStore(database)

	if err := store.RecordAuthorizationAudit(context.Background(), AuthorizationAuditEntry{
		FallbackActorID: "audit-admin@example.com",
		TenantID:        "tenant-a",
		Permission:      PermissionAuthzManage,
		Operation:       "authz.role_grants.create",
		TargetType:      "authz_actor_role_grant",
		TargetID:        "grant-1",
		Decision:        AuditDecisionAuthorized,
	}); err != nil {
		t.Fatalf("record audit log: %v", err)
	}

	var row AuthzAuditLog
	if err := database.Where("operation = ?", "authz.role_grants.create").First(&row).Error; err != nil {
		t.Fatalf("load audit log: %v", err)
	}

	row.Decision = AuditDecisionDenied
	if err := database.Save(&row).Error; !errors.Is(err, ErrImmutableAuditLog) {
		t.Fatalf("expected ErrImmutableAuditLog for ORM update, got %v", err)
	}

	if err := database.Delete(&row).Error; !errors.Is(err, ErrImmutableAuditLog) {
		t.Fatalf("expected ErrImmutableAuditLog for ORM delete, got %v", err)
	}
}
