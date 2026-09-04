package authz

import (
	"context"
	"errors"
	"testing"
	"time"

	"gorm.io/gorm"
)

func TestTenantSupportAccessLeaseLifecycleGrantsAndRemovesTenantAuthority(t *testing.T) {
	database := newAuthzTestDB(t)
	installSupportAccessLeaseFixtureTables(t, database)
	seedSupportAccessLeaseTenant(t, database, "tenant-a", "Tenant A")

	applicationActorID := seedSupportApplicationAdministrator(t, database, "support-app-admin@example.test", "account-support-app")
	tenantAdminActorID := seedSupportTenantAdministrator(t, database, "tenant-a", "support-tenant-admin-a@example.test", "account-tenant-admin-a", "person-tenant-admin-a")
	store := NewGORMStore(database)

	applicationActor, err := store.FindAccountActor(context.Background(), "account-support-app", GlobalTenantScope)
	if err != nil {
		t.Fatalf("resolve Application Administrator: %v", err)
	}
	tenantAdminActor, err := store.FindActor(context.Background(), ActorLookup{ActorID: "support-tenant-admin-a@example.test", TenantID: "tenant-a"})
	if err != nil {
		t.Fatalf("resolve Tenant Administrator: %v", err)
	}

	beforeActors := countRows(t, database, "authz_actors")
	beforeBindings := countRows(t, database, "auth_account_actors")
	beforeMemberships := countRows(t, database, "person_tenant_memberships")
	beforeGrants := countRows(t, database, "authz_actor_role_grants")

	lease, err := store.CreateSupportAccessLease(context.Background(), applicationActor, CreateSupportAccessLeaseRequest{
		TenantID:  "tenant-a",
		ExpiresAt: time.Now().UTC().Add(2 * time.Hour).Format(time.RFC3339),
		Reason:    "Investigate Tenant A support incident",
		Permissions: []string{
			string(PermissionPeopleRead),
			string(PermissionExpensesRead),
		},
	})
	if err != nil {
		t.Fatalf("request support access lease: %v", err)
	}
	if lease.Status != SupportAccessLeaseStatusPending || lease.EffectiveStatus != SupportAccessLeaseStatusPending {
		t.Fatalf("unexpected requested lease: %#v", lease)
	}
	if lease.ApplicationActorID != applicationActorID || lease.RequestedByActorID != applicationActorID {
		t.Fatalf("lease must remain attached to requesting GLOBAL Actor: %#v", lease)
	}

	if got := countRows(t, database, "authz_actors"); got != beforeActors {
		t.Fatalf("support lease must not create Actor: before=%d after=%d", beforeActors, got)
	}
	if got := countRows(t, database, "auth_account_actors"); got != beforeBindings {
		t.Fatalf("support lease must not create Account/Actor binding: before=%d after=%d", beforeBindings, got)
	}
	if got := countRows(t, database, "person_tenant_memberships"); got != beforeMemberships {
		t.Fatalf("support lease must not create Membership: before=%d after=%d", beforeMemberships, got)
	}
	if got := countRows(t, database, "authz_actor_role_grants"); got != beforeGrants {
		t.Fatalf("support lease must not create Role Grant: before=%d after=%d", beforeGrants, got)
	}

	if _, err := store.FindAccountActor(context.Background(), "account-support-app", "tenant-a"); !errors.Is(err, ErrTenantActorUnavailable) {
		t.Fatalf("pending lease must not authorize Tenant access, got %v", err)
	}

	approved, err := store.ApproveSupportAccessLease(context.Background(), tenantAdminActor, lease.ID)
	if err != nil {
		t.Fatalf("approve support access lease: %v", err)
	}
	if approved.Status != SupportAccessLeaseStatusApproved || approved.ApprovedByActorID != tenantAdminActorID {
		t.Fatalf("unexpected approved lease: %#v", approved)
	}

	supportActor, err := store.FindAccountActor(context.Background(), "account-support-app", "tenant-a")
	if err != nil {
		t.Fatalf("resolve leased Tenant support Actor: %v", err)
	}
	if supportActor.RecordID != applicationActorID || supportActor.Scope != ActorScopeApplication || supportActor.TenantID != "tenant-a" {
		t.Fatalf("lease must preserve GLOBAL Actor identity in application scope: %#v", supportActor)
	}
	if supportActor.SupportLeaseID != lease.ID || supportActor.SupportLeaseExpiresAt == "" {
		t.Fatalf("effective Actor must expose lease provenance: %#v", supportActor)
	}
	if supportActor.PersonID != "" || supportActor.MembershipID != "" || supportActor.CollaboratorID != "" {
		t.Fatalf("support lease must not synthesize Tenant identity: %#v", supportActor)
	}
	if !supportActor.HasPermission(PermissionPeopleRead) || !supportActor.HasPermission(PermissionExpensesRead) {
		t.Fatalf("approved lease permissions missing: %#v", PermissionNames(supportActor.Permissions))
	}
	if supportActor.HasPermission(PermissionExpensesCreate) {
		t.Fatalf("unrequested Tenant permission must not be granted: %#v", PermissionNames(supportActor.Permissions))
	}
	if !supportActor.HasPermission(PermissionAuthzManage) {
		t.Fatalf("standing global control-plane permissions should remain present: %#v", PermissionNames(supportActor.Permissions))
	}
	if err := RequireTenantScope(supportActor, "tenant-a"); err != nil {
		t.Fatalf("approved lease should satisfy exact Tenant scope: %v", err)
	}
	if err := RequireTenantScope(supportActor, "tenant-b"); !errors.Is(err, ErrForbidden) {
		t.Fatalf("lease must not cross Tenant boundary, got %v", err)
	}

	options, err := store.ListAccountTenantOptions(context.Background(), "account-support-app")
	if err != nil {
		t.Fatalf("list Application Administrator options: %v", err)
	}
	if len(options) != 2 || options[0].ID != GlobalTenantScope || options[1].ID != "tenant-a" || options[1].SupportLeaseID != lease.ID || options[1].ActorScope != string(ActorScopeApplication) {
		t.Fatalf("expected global plus leased Tenant option, got %#v", options)
	}

	terminated, err := store.TerminateSupportAccessLease(context.Background(), tenantAdminActor, lease.ID, "Support session complete")
	if err != nil {
		t.Fatalf("terminate support access lease: %v", err)
	}
	if terminated.Status != SupportAccessLeaseStatusTerminated || terminated.TerminatedByActorID != tenantAdminActorID {
		t.Fatalf("unexpected terminated lease: %#v", terminated)
	}
	if _, err := store.FindAccountActor(context.Background(), "account-support-app", "tenant-a"); !errors.Is(err, ErrTenantActorUnavailable) {
		t.Fatalf("terminated lease must immediately remove Tenant authority, got %v", err)
	}

	var eventCount int64
	if err := database.Model(&TenantSupportAccessLeaseEvent{}).Where("lease_id = ?", lease.ID).Count(&eventCount).Error; err != nil {
		t.Fatalf("count lease events: %v", err)
	}
	if eventCount != 3 {
		t.Fatalf("expected immutable request/approval/termination history, got %d events", eventCount)
	}
}

func TestTenantSupportAccessLeaseExpiresWithoutLifecycleRewrite(t *testing.T) {
	database := newAuthzTestDB(t)
	installSupportAccessLeaseFixtureTables(t, database)
	seedSupportAccessLeaseTenant(t, database, "tenant-a", "Tenant A")
	seedSupportApplicationAdministrator(t, database, "support-expiry-app@example.test", "account-support-expiry")
	seedSupportTenantAdministrator(t, database, "tenant-a", "support-expiry-admin@example.test", "account-expiry-admin", "person-expiry-admin")
	store := NewGORMStore(database)

	applicationActor, err := store.FindAccountActor(context.Background(), "account-support-expiry", GlobalTenantScope)
	if err != nil {
		t.Fatalf("resolve Application Administrator: %v", err)
	}
	tenantAdminActor, err := store.FindActor(context.Background(), ActorLookup{ActorID: "support-expiry-admin@example.test", TenantID: "tenant-a"})
	if err != nil {
		t.Fatalf("resolve Tenant Administrator: %v", err)
	}
	lease, err := store.CreateSupportAccessLease(context.Background(), applicationActor, CreateSupportAccessLeaseRequest{
		TenantID:    "tenant-a",
		ExpiresAt:   time.Now().UTC().Add(time.Hour).Format(time.RFC3339),
		Reason:      "Time-limited support",
		Permissions: []string{string(PermissionPeopleRead)},
	})
	if err != nil {
		t.Fatalf("request lease: %v", err)
	}
	if _, err := store.ApproveSupportAccessLease(context.Background(), tenantAdminActor, lease.ID); err != nil {
		t.Fatalf("approve lease: %v", err)
	}

	past := time.Now().UTC().Add(-time.Minute)
	if err := database.Model(&TenantSupportAccessLease{}).Where("id = ?", lease.ID).Update("expires_at", past).Error; err != nil {
		t.Fatalf("force expired fixture: %v", err)
	}
	if _, err := store.FindAccountActor(context.Background(), "account-support-expiry", "tenant-a"); !errors.Is(err, ErrTenantActorUnavailable) {
		t.Fatalf("expired lease must not authorize Tenant access, got %v", err)
	}
	leases, err := store.ListSupportAccessLeases(context.Background(), applicationActor, SupportAccessLeaseFilter{Status: SupportAccessLeaseStatusExpired})
	if err != nil {
		t.Fatalf("list expired leases: %v", err)
	}
	if len(leases) != 1 || leases[0].Status != SupportAccessLeaseStatusApproved || leases[0].EffectiveStatus != SupportAccessLeaseStatusExpired {
		t.Fatalf("expiration must be derived without rewriting approval history: %#v", leases)
	}
	options, err := store.ListAccountTenantOptions(context.Background(), "account-support-expiry")
	if err != nil {
		t.Fatalf("list options after expiry: %v", err)
	}
	if len(options) != 1 || options[0].ID != GlobalTenantScope {
		t.Fatalf("expired lease must disappear from effective Tenant options: %#v", options)
	}
}

func TestTenantSupportAccessLeaseAllowsNewRequestAfterPendingExpiration(t *testing.T) {
	database := newAuthzTestDB(t)
	installSupportAccessLeaseFixtureTables(t, database)
	seedSupportAccessLeaseTenant(t, database, "tenant-a", "Tenant A")
	seedSupportApplicationAdministrator(t, database, "support-pending-expiry-app@example.test", "account-support-pending-expiry")
	store := NewGORMStore(database)

	applicationActor, err := store.FindAccountActor(context.Background(), "account-support-pending-expiry", GlobalTenantScope)
	if err != nil {
		t.Fatalf("resolve Application Administrator: %v", err)
	}
	first, err := store.CreateSupportAccessLease(context.Background(), applicationActor, CreateSupportAccessLeaseRequest{
		TenantID:    "tenant-a",
		ExpiresAt:   time.Now().UTC().Add(time.Hour).Format(time.RFC3339),
		Reason:      "Initial support request",
		Permissions: []string{string(PermissionPeopleRead)},
	})
	if err != nil {
		t.Fatalf("request initial pending lease: %v", err)
	}

	if err := database.Model(&TenantSupportAccessLease{}).Where("id = ?", first.ID).Update("expires_at", time.Now().UTC().Add(-time.Minute)).Error; err != nil {
		t.Fatalf("force lapsed pending fixture: %v", err)
	}

	replacement, err := store.CreateSupportAccessLease(context.Background(), applicationActor, CreateSupportAccessLeaseRequest{
		TenantID:    "tenant-a",
		ExpiresAt:   time.Now().UTC().Add(2 * time.Hour).Format(time.RFC3339),
		Reason:      "Replacement support request",
		Permissions: []string{string(PermissionExpensesRead)},
	})
	if err != nil {
		t.Fatalf("lapsed pending request must not block replacement: %v", err)
	}
	if replacement.ID == first.ID || replacement.Status != SupportAccessLeaseStatusPending {
		t.Fatalf("unexpected replacement lease: %#v", replacement)
	}
}

func TestTenantSupportAccessLeaseFallsBackWhenOrdinaryTenantMembershipIsInactive(t *testing.T) {
	database := newAuthzTestDB(t)
	installSupportAccessLeaseFixtureTables(t, database)
	seedSupportAccessLeaseTenant(t, database, "tenant-a", "Tenant A")

	applicationActorID := seedSupportApplicationAdministrator(t, database, "support-fallback-app@example.test", "account-support-fallback")
	staleTenantActorID := seedSupportTenantAdministrator(t, database, "tenant-a", "support-fallback-stale@example.test", "account-support-fallback", "person-support-fallback")
	seedSupportTenantAdministrator(t, database, "tenant-a", "support-fallback-approver@example.test", "account-support-fallback-approver", "person-support-fallback-approver")
	store := NewGORMStore(database)

	now := time.Now().UTC()
	if err := database.Exec(`INSERT INTO reference_data(id, type, code, label, active, tenant_id, created_at, updated_at) VALUES (?, 'person_status', 'INACTIVE', 'Inactive', 1, ?, ?, ?)`, "status-inactive-tenant-a", "tenant-a", now, now).Error; err != nil {
		t.Fatalf("seed inactive Person status: %v", err)
	}
	if err := database.Exec(`UPDATE person_tenant_memberships SET status_id = ? WHERE id = ?`, "status-inactive-tenant-a", "membership-"+staleTenantActorID).Error; err != nil {
		t.Fatalf("deactivate ordinary Tenant Membership: %v", err)
	}

	applicationActor, err := store.FindAccountActor(context.Background(), "account-support-fallback", GlobalTenantScope)
	if err != nil {
		t.Fatalf("resolve Application Administrator: %v", err)
	}
	approver, err := store.FindActor(context.Background(), ActorLookup{ActorID: "support-fallback-approver@example.test", TenantID: "tenant-a"})
	if err != nil {
		t.Fatalf("resolve approving Tenant Administrator: %v", err)
	}
	lease, err := store.CreateSupportAccessLease(context.Background(), applicationActor, CreateSupportAccessLeaseRequest{
		TenantID:    "tenant-a",
		ExpiresAt:   time.Now().UTC().Add(time.Hour).Format(time.RFC3339),
		Reason:      "Support despite inactive ordinary membership",
		Permissions: []string{string(PermissionPeopleRead)},
	})
	if err != nil {
		t.Fatalf("request support lease: %v", err)
	}
	if _, err := store.ApproveSupportAccessLease(context.Background(), approver, lease.ID); err != nil {
		t.Fatalf("approve support lease: %v", err)
	}

	supportActor, err := store.FindAccountActor(context.Background(), "account-support-fallback", "tenant-a")
	if err != nil {
		t.Fatalf("inactive ordinary Tenant Membership must fall back to active support lease: %v", err)
	}
	if supportActor.RecordID != applicationActorID || supportActor.Scope != ActorScopeApplication || supportActor.SupportLeaseID != lease.ID {
		t.Fatalf("expected lease-backed GLOBAL Application Administrator Actor, got %#v", supportActor)
	}
}

func TestTenantSupportAccessLeaseRequiresExactCanonicalTenantAdministrator(t *testing.T) {
	database := newAuthzTestDB(t)
	installSupportAccessLeaseFixtureTables(t, database)
	seedSupportAccessLeaseTenant(t, database, "tenant-a", "Tenant A")
	seedSupportAccessLeaseTenant(t, database, "tenant-b", "Tenant B")
	seedSupportApplicationAdministrator(t, database, "support-boundary-app@example.test", "account-support-boundary")
	seedSupportTenantAdministrator(t, database, "tenant-b", "support-admin-b@example.test", "account-admin-b", "person-admin-b")
	store := NewGORMStore(database)

	applicationActor, err := store.FindAccountActor(context.Background(), "account-support-boundary", GlobalTenantScope)
	if err != nil {
		t.Fatalf("resolve Application Administrator: %v", err)
	}
	lease, err := store.CreateSupportAccessLease(context.Background(), applicationActor, CreateSupportAccessLeaseRequest{
		TenantID:    "tenant-a",
		ExpiresAt:   time.Now().UTC().Add(time.Hour).Format(time.RFC3339),
		Reason:      "Tenant boundary test",
		Permissions: []string{string(PermissionPeopleRead)},
	})
	if err != nil {
		t.Fatalf("request lease: %v", err)
	}
	tenantBAdmin, err := store.FindActor(context.Background(), ActorLookup{ActorID: "support-admin-b@example.test", TenantID: "tenant-b"})
	if err != nil {
		t.Fatalf("resolve Tenant B administrator: %v", err)
	}
	if _, err := store.ApproveSupportAccessLease(context.Background(), tenantBAdmin, lease.ID); !errors.Is(err, ErrForbidden) {
		t.Fatalf("Tenant B administrator must not approve Tenant A lease, got %v", err)
	}
}

func TestTenantSupportAccessLeaseRejectsControlPlanePermission(t *testing.T) {
	database := newAuthzTestDB(t)
	installSupportAccessLeaseFixtureTables(t, database)
	seedSupportAccessLeaseTenant(t, database, "tenant-a", "Tenant A")
	seedSupportApplicationAdministrator(t, database, "support-permission-app@example.test", "account-support-permission")
	store := NewGORMStore(database)
	applicationActor, err := store.FindAccountActor(context.Background(), "account-support-permission", GlobalTenantScope)
	if err != nil {
		t.Fatalf("resolve Application Administrator: %v", err)
	}
	_, err = store.CreateSupportAccessLease(context.Background(), applicationActor, CreateSupportAccessLeaseRequest{
		TenantID:    "tenant-a",
		ExpiresAt:   time.Now().UTC().Add(time.Hour).Format(time.RFC3339),
		Reason:      "Invalid permission test",
		Permissions: []string{string(PermissionAuthzManage)},
	})
	var validation ValidationError
	if !errors.As(err, &validation) || validation.ValidationFields()["permissions"] == "" {
		t.Fatalf("expected lease allowlist validation, got %v", err)
	}
}

func installSupportAccessLeaseFixtureTables(t *testing.T, database *gorm.DB) {
	t.Helper()
	statements := []string{
		`CREATE TABLE IF NOT EXISTS tenants (id TEXT PRIMARY KEY, code TEXT NOT NULL, name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS reference_data (id TEXT PRIMARY KEY, type TEXT NOT NULL, code TEXT NOT NULL, label TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, tenant_id TEXT NOT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS person_tenant_memberships (id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, person_id TEXT NOT NULL, status_id TEXT NOT NULL, legacy_person_id TEXT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL)`,
		`CREATE TABLE IF NOT EXISTS auth_account_actors (account_id TEXT NOT NULL, actor_id TEXT NOT NULL, scope_type TEXT NOT NULL, tenant_id TEXT NULL, membership_id TEXT NULL, is_primary INTEGER NOT NULL DEFAULT 0, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, PRIMARY KEY(account_id, actor_id))`,
		`CREATE TABLE IF NOT EXISTS auth_account_people (account_id TEXT NOT NULL, person_id TEXT NOT NULL, created_at DATETIME NOT NULL, updated_at DATETIME NOT NULL, PRIMARY KEY(account_id, person_id))`,
	}
	for _, statement := range statements {
		if err := database.Exec(statement).Error; err != nil {
			t.Fatalf("install support access lease fixture table: %v", err)
		}
	}
}

func seedSupportAccessLeaseTenant(t *testing.T, database *gorm.DB, tenantID string, name string) {
	t.Helper()
	now := time.Now().UTC()
	if err := database.Exec(`INSERT INTO tenants(id, code, name, active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)`, tenantID, tenantID, name, now, now).Error; err != nil {
		t.Fatalf("seed Tenant %s: %v", tenantID, err)
	}
}

func seedSupportApplicationAdministrator(t *testing.T, database *gorm.DB, actorKey string, accountID string) string {
	t.Helper()
	actorID := createAuthzActor(t, database, actorKey, nil, nil)
	grantAuthzRole(t, database, actorID, RoleApplicationAdmin, GlobalTenantScope)
	now := time.Now().UTC()
	if err := database.Exec(`INSERT INTO auth_account_actors(account_id, actor_id, scope_type, tenant_id, membership_id, is_primary, created_at, updated_at) VALUES (?, ?, 'GLOBAL', NULL, NULL, 1, ?, ?)`, accountID, actorID, now, now).Error; err != nil {
		t.Fatalf("bind GLOBAL Application Administrator: %v", err)
	}
	return actorID
}

func seedSupportTenantAdministrator(t *testing.T, database *gorm.DB, tenantID string, actorKey string, accountID string, personID string) string {
	t.Helper()
	actorID := createAuthzActor(t, database, actorKey, nil, nil)
	grantAuthzRole(t, database, actorID, RoleTenantAdmin, tenantID)
	now := time.Now().UTC()
	statusID := "status-active-" + tenantID
	membershipID := "membership-" + actorID
	if err := database.Exec(`INSERT OR IGNORE INTO reference_data(id, type, code, label, active, tenant_id, created_at, updated_at) VALUES (?, 'person_status', 'ACTIVE', 'Active', 1, ?, ?, ?)`, statusID, tenantID, now, now).Error; err != nil {
		t.Fatalf("seed active Person status: %v", err)
	}
	if err := database.Exec(`INSERT INTO person_tenant_memberships(id, tenant_id, person_id, status_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`, membershipID, tenantID, personID, statusID, now, now).Error; err != nil {
		t.Fatalf("seed Tenant Administrator Membership: %v", err)
	}
	if err := database.Exec(`INSERT INTO auth_account_actors(account_id, actor_id, scope_type, tenant_id, membership_id, is_primary, created_at, updated_at) VALUES (?, ?, 'TENANT', ?, ?, 1, ?, ?)`, accountID, actorID, tenantID, membershipID, now, now).Error; err != nil {
		t.Fatalf("bind Tenant Administrator Actor: %v", err)
	}
	if err := database.Exec(`INSERT INTO auth_account_people(account_id, person_id, created_at, updated_at) VALUES (?, ?, ?, ?)`, accountID, personID, now, now).Error; err != nil {
		t.Fatalf("bind Tenant Administrator Person: %v", err)
	}
	return actorID
}

func countRows(t *testing.T, database *gorm.DB, table string) int64 {
	t.Helper()
	var count int64
	if err := database.Table(table).Count(&count).Error; err != nil {
		t.Fatalf("count %s: %v", table, err)
	}
	return count
}
