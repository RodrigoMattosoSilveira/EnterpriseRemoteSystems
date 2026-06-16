package authz

import (
	"context"
	"errors"
	"path/filepath"
	"reflect"
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
	if roles != 5 {
		t.Fatalf("expected 5 roles, got %d", roles)
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

func TestGORMStoreFindActorLoadsApplicationScopedWildcard(t *testing.T) {
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
	if err := RequirePermission(actor, PermissionJourneySettlementsClose); err != nil {
		t.Fatalf("expected wildcard permission, got %v", err)
	}
	if err := RequireTenantScope(actor, "tenant-b"); err != nil {
		t.Fatalf("expected application actor to access tenant-b, got %v", err)
	}
}

func TestGORMStoreFindActorLoadsPersonSelfPermissions(t *testing.T) {
	database := newAuthzTestDB(t)
	personID := "person-123"
	collaboratorID := "collaborator-123"
	actorID := createAuthzActor(t, database, "person@example.com", &personID, &collaboratorID)
	grantAuthzRole(t, database, actorID, RolePerson, "tenant-a")

	actor, err := NewGORMStore(database).FindActor(context.Background(), ActorLookup{ActorID: "person@example.com", TenantID: "tenant-a"})
	if err != nil {
		t.Fatalf("find actor: %v", err)
	}

	if actor.Scope != ActorScopeSelf || actor.PersonID != personID || actor.CollaboratorID != collaboratorID {
		t.Fatalf("unexpected self-scoped actor: %#v", actor)
	}
	if !actor.HasPermission(PermissionPeopleSelfUpdate) {
		t.Fatalf("expected self person update permission")
	}
	if actor.HasPermission(PermissionPeopleUpdate) {
		t.Fatalf("person actor must not have tenant-wide people update permission")
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
		t.Fatalf("expected tenant admin wildcard permission, got %v", err)
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

func TestResolveActorKeepsTemporaryHeaderPermissionsForUnpersistedActors(t *testing.T) {
	database := newAuthzTestDB(t)

	actor, err := ResolveActor(context.Background(), NewGORMStore(database), headerGetter(map[string]string{
		HeaderActorID:          "temporary-tests@example.com",
		HeaderTenantID:         "tenant-a",
		HeaderActorPermissions: string(PermissionLedgerReceiptsPrint),
	}))
	if err != nil {
		t.Fatalf("resolve actor: %v", err)
	}

	if actor.Source != ActorSourceHeaderActorID {
		t.Fatalf("expected temporary header actor source, got %q", actor.Source)
	}
	if !actor.HasPermission(PermissionLedgerReceiptsPrint) {
		t.Fatalf("expected temporary header permission")
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
