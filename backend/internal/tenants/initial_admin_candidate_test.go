package tenants_test

import (
	"context"
	"net/http"
	"testing"

	"enterpriseremotesystems/backend/internal/authentication"
	"enterpriseremotesystems/backend/internal/authz"
	dbpkg "enterpriseremotesystems/backend/internal/db"
	"enterpriseremotesystems/backend/internal/tenants"
	"golang.org/x/crypto/bcrypt"
)

func TestInitialTenantAdminCandidateBuildsCanonicalIdentityWithoutPrivilege(t *testing.T) {
	server, dbPath, cleanup := newTestServer(t, true)
	defer cleanup()
	tenant := createTenant(t, server, "TRNBOOT", "Training Bootstrap")
	database, err := dbpkg.Open(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer closeDatabase(t, database)
	service := tenants.NewService(tenants.NewRepository(database))
	input := tenants.CreateInitialTenantAdminCandidateRequest{
		ActorKey: "TRN_FIRST_ADMIN", FirstName: "Training", LastName: "Administrator",
		Nickname: "Trainer", CPF: "52998224725", RG: "12345678",
		Cellular: "11912345678", Email: "first.admin@example.test",
		TemporaryPassword: "a-secure-initial-password-2026",
	}
	ctx := context.Background()
	created, err := service.CreateInitialTenantAdminCandidate(ctx, tenant.ID, input, "operator-account-id", "operator-actor-id", "test-first-admin")
	if err != nil {
		t.Fatalf("create initial tenant candidate: %v", err)
	}
	if created.TenantID != tenant.ID || created.AccountID == "" || created.MembershipID == "" || created.ActorID == "" || created.GlobalPersonID == "" {
		t.Fatalf("expected all canonical identity IDs, got %+v", created)
	}
	var personCount, membershipCount, accountPersonCount, actorBindingCount, grantCount, auditCount int64
	for _, item := range []struct {
		table string
		where string
		args  []any
		count *int64
	}{
		{"global_people", "id = ?", []any{created.GlobalPersonID}, &personCount},
		{"person_tenant_memberships", "id = ? AND person_id = ? AND tenant_id = ?", []any{created.MembershipID, created.GlobalPersonID, tenant.ID}, &membershipCount},
		{"auth_account_people", "account_id = ? AND person_id = ?", []any{created.AccountID, created.GlobalPersonID}, &accountPersonCount},
		{"auth_account_actors", "account_id = ? AND actor_id = ? AND tenant_id = ? AND membership_id = ? AND scope_type = ?", []any{created.AccountID, created.ActorID, tenant.ID, created.MembershipID, "TENANT"}, &actorBindingCount},
		{"authz_actor_role_grants", "actor_id = ?", []any{created.ActorID}, &grantCount},
		{"authz_audit_logs", "operation = ? AND target_id = ?", []any{"tenants.initial_admin_candidate.create", created.ActorID}, &auditCount},
	} {
		if err := database.Table(item.table).Where(item.where, item.args...).Count(item.count).Error; err != nil {
			t.Fatalf("count %s: %v", item.table, err)
		}
	}
	if personCount != 1 || membershipCount != 1 || accountPersonCount != 1 || actorBindingCount != 1 || grantCount != 0 || auditCount != 1 {
		t.Fatalf("canonical foundation mismatch: person=%d membership=%d accountPerson=%d actorBinding=%d roleGrant=%d audit=%d", personCount, membershipCount, accountPersonCount, actorBindingCount, grantCount, auditCount)
	}
	var account authentication.Account
	if err := database.Where("id = ?", created.AccountID).First(&account).Error; err != nil {
		t.Fatal(err)
	}
	if !account.MustChangePassword || !account.Active || bcrypt.CompareHashAndPassword([]byte(account.PasswordHash), []byte(input.TemporaryPassword)) != nil {
		t.Fatalf("expected active ordinary Account requiring first-password change")
	}
	if _, err := service.CreateInitialTenantAdminCandidate(ctx, tenant.ID, input, "operator-account-id", "operator-actor-id", "repeat"); err == nil {
		t.Fatal("initial creation must be create-only; duplicate attempt must fail")
	}
	var count int64
	if err := database.Table("global_people").Where("cpf = ?", input.CPF).Count(&count).Error; err != nil || count != 1 {
		t.Fatalf("duplicate attempt changed person count: %d, %v", count, err)
	}

	// Existing tenant assignment service applies all delegated-role checks.
	ready, err := service.AssignTenantAdmin(ctx, tenant.ID, created.ActorID)
	if err != nil {
		t.Fatalf("assign candidate with existing authorization path: %v", err)
	}
	if ready.OperationalStatus != tenants.OperationalStatusActiveReady || ready.TenantAdminCount != 1 || ready.TenantAdminAssignmentCount != 1 {
		t.Fatalf("expected Tenant ACTIVE_READY after explicit assignment, got %+v", ready)
	}
	var globalGrants int64
	if err := database.Table("authz_actor_role_grants g").Joins("JOIN authz_roles r ON r.id = g.role_id").Where("g.actor_id = ? AND g.tenant_id = ? AND r.code = ?", created.ActorID, authz.GlobalTenantScope, string(authz.RoleApplicationAdmin)).Count(&globalGrants).Error; err != nil || globalGrants != 0 {
		t.Fatalf("tenant Account must never obtain GLOBAL APPLICATION_ADMIN role: count=%d err=%v", globalGrants, err)
	}
}

func TestInitialTenantAdminCandidateFailsBeforeAnyWriteForBadInputs(t *testing.T) {
	server, dbPath, cleanup := newTestServer(t, true)
	defer cleanup()
	tenant := createTenant(t, server, "TRNINVALID", "Training Invalid")
	database, err := dbpkg.Open(dbPath)
	if err != nil {
		t.Fatal(err)
	}
	defer closeDatabase(t, database)
	service := tenants.NewService(tenants.NewRepository(database))
	req := tenants.CreateInitialTenantAdminCandidateRequest{
		ActorKey: "TRN_ADMIN", FirstName: "Test", LastName: "Human", Nickname: "Test",
		CPF: "11111111111", RG: "X", Cellular: "000", Email: "not-an-email", TemporaryPassword: "short",
	}
	if _, err := service.CreateInitialTenantAdminCandidate(context.Background(), tenant.ID, req, "account", "actor", "invalid"); err == nil {
		t.Fatal("invalid Person and password must be rejected")
	}
	var count int64
	if err := database.Table("auth_account_actors").Where("tenant_id = ?", tenant.ID).Count(&count).Error; err != nil || count != 0 {
		t.Fatalf("invalid candidate wrote binding: %d, %v", count, err)
	}
}

func TestInitialTenantAdminCandidateRejectsUnauthenticatedRequest(t *testing.T) {
	server, _, cleanup := newTestServer(t, false)
	defer cleanup()
	response := requestJSON(t, server, http.MethodPost, "/api/v1/tenants/default/initial-admin-candidate", map[string]any{
		"actorKey": "UNAUTHORIZED_ACTOR", "firstName": "Unauthorized", "lastName": "Person",
		"nickname": "Unauthorized", "cpf": "52998224725", "rg": "12345678",
		"cellular": "11912345678", "email": "unauthorized@example.test", "temporaryPassword": "temporary-password-2026",
	}, nil)
	defer response.Body.Close()
	if response.StatusCode != http.StatusUnauthorized && response.StatusCode != http.StatusForbidden {
		t.Fatalf("unauthenticated first candidate request must be denied, got %d", response.StatusCode)
	}
}
