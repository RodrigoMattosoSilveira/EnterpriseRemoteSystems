package tenants_test

import (
	"net/http"
	"testing"

	"enterpriseremotesystems/backend/internal/authentication"
	dbpkg "enterpriseremotesystems/backend/internal/db"
	"golang.org/x/crypto/bcrypt"
)

const firstAdministratorTemporaryPassword = "Temporary-Password-01"

func firstAdministratorPayload(cpf string, email string) map[string]any {
	return map[string]any{
		"firstName":         "Marina",
		"lastName":          "Souza",
		"cpf":               cpf,
		"rg":                "RG-410001",
		"cellular":          "11998765432",
		"email":             email,
		"temporaryPassword": firstAdministratorTemporaryPassword,
	}
}

func TestTenantCreateProvisionsFirstTenantAdministrator(t *testing.T) {
	server, dbPath, cleanup := newTestServer(t, true)
	defer cleanup()

	res := requestJSON(t, server, http.MethodPost, "/api/v1/tenants", map[string]any{
		"code":               "WEST",
		"name":               "West Site",
		"firstAdministrator": firstAdministratorPayload("39053344705", " Marina.Souza@Example.com "),
	}, nil)
	defer res.Body.Close()
	if res.StatusCode != http.StatusCreated {
		var errorBody apiErrorResponse
		decodeJSON(t, res, &errorBody)
		t.Fatalf("expected create status %d, got %d: %+v", http.StatusCreated, res.StatusCode, errorBody.Error)
	}
	var body apiTenantResponse
	decodeJSON(t, res, &body)
	created := body.Data
	if created.OperationalStatus != "ACTIVE_READY" || created.TenantAdminCount != 1 {
		t.Fatalf("expected a ready Tenant with one administrator, got %+v", created)
	}

	res = requestJSON(t, server, http.MethodGet, "/api/v1/tenants/"+created.ID+"/admin-candidates", nil, nil)
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("expected candidates status %d, got %d", http.StatusOK, res.StatusCode)
	}
	var candidates apiTenantAdminCandidatesResponse
	decodeJSON(t, res, &candidates)
	if len(candidates.Data) != 1 {
		t.Fatalf("expected one Tenant Administrator candidate, got %+v", candidates.Data)
	}
	candidate := candidates.Data[0]
	if !candidate.Assigned || candidate.AccountLogin != "marina.souza@example.com" || candidate.PersonName != "Marina Souza" || candidate.PersonNickname != "Marina" {
		t.Fatalf("unexpected first Tenant Administrator candidate: %+v", candidate)
	}

	database, err := dbpkg.Open(dbPath)
	if err != nil {
		t.Fatalf("open tenant database: %v", err)
	}
	defer closeDatabase(t, database)
	var account authentication.Account
	if err := database.Where("login = ?", "marina.souza@example.com").First(&account).Error; err != nil {
		t.Fatalf("find first Tenant Administrator Account: %v", err)
	}
	if !account.Active || !account.MustChangePassword {
		t.Fatalf("expected an active Account that must change its temporary password, got %+v", account)
	}
	if err := bcrypt.CompareHashAndPassword([]byte(account.PasswordHash), []byte(firstAdministratorTemporaryPassword)); err != nil {
		t.Fatalf("expected the temporary password to be stored: %v", err)
	}
	var membershipCount int64
	if err := database.Table("person_tenant_memberships m").
		Joins("JOIN global_people p ON p.id = m.person_id").
		Joins("JOIN reference_data s ON s.id = m.status_id AND s.code = ?", "ACTIVE").
		Where("m.tenant_id = ? AND p.email = ?", created.ID, "marina.souza@example.com").
		Count(&membershipCount).Error; err != nil {
		t.Fatalf("count first Tenant Administrator Membership: %v", err)
	}
	if membershipCount != 1 {
		t.Fatalf("expected one ACTIVE Membership in the new Tenant, got %d", membershipCount)
	}
}

func TestTenantCreateRejectsInvalidFirstAdministratorWithoutCreatingTenant(t *testing.T) {
	server, _, cleanup := newTestServer(t, true)
	defer cleanup()

	payload := firstAdministratorPayload("123", "not-an-email")
	payload["temporaryPassword"] = "short"
	res := requestJSON(t, server, http.MethodPost, "/api/v1/tenants", map[string]any{
		"code":               "EAST",
		"name":               "East Site",
		"firstAdministrator": payload,
	}, nil)
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected validation status %d, got %d", http.StatusBadRequest, res.StatusCode)
	}
	var body apiErrorResponse
	decodeJSON(t, res, &body)
	for _, field := range []string{"firstAdministrator.cpf", "firstAdministrator.email", "firstAdministrator.temporaryPassword"} {
		if body.Error.Fields[field] == "" {
			t.Fatalf("expected %s validation field, got %+v", field, body.Error.Fields)
		}
	}
	if _, exists := body.Error.Fields["firstAdministrator.statusId"]; exists {
		t.Fatalf("status is chosen by provisioning and must not be reported, got %+v", body.Error.Fields)
	}

	// The Tenant code is still free because nothing was written.
	createTenant(t, server, "EAST", "East Site")
}

func TestTenantCreateRollsBackWhenFirstAdministratorConflicts(t *testing.T) {
	server, dbPath, cleanup := newTestServer(t, true)
	defer cleanup()

	res := requestJSON(t, server, http.MethodPost, "/api/v1/tenants", map[string]any{
		"code":               "NORTH",
		"name":               "North Site",
		"firstAdministrator": firstAdministratorPayload("93541134780", "first.admin@example.com"),
	}, nil)
	defer res.Body.Close()
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("expected first create status %d, got %d", http.StatusCreated, res.StatusCode)
	}

	// Same CPF as an existing global Person: provisioning fails after the
	// Tenant row was inserted, so the whole transaction must roll back.
	res = requestJSON(t, server, http.MethodPost, "/api/v1/tenants", map[string]any{
		"code":               "SOUTH",
		"name":               "South Site",
		"firstAdministrator": firstAdministratorPayload("93541134780", "second.admin@example.com"),
	}, nil)
	defer res.Body.Close()
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected conflict validation status %d, got %d", http.StatusBadRequest, res.StatusCode)
	}
	var body apiErrorResponse
	decodeJSON(t, res, &body)
	if body.Error.Fields["firstAdministrator.cpf"] == "" {
		t.Fatalf("expected firstAdministrator.cpf conflict, got %+v", body.Error.Fields)
	}

	database, err := dbpkg.Open(dbPath)
	if err != nil {
		t.Fatalf("open tenant database: %v", err)
	}
	var tenantCount int64
	if err := database.Model(&dbpkg.Tenant{}).Where("code = ?", "SOUTH").Count(&tenantCount).Error; err != nil {
		closeDatabase(t, database)
		t.Fatalf("count rolled-back Tenant: %v", err)
	}
	var accountCount int64
	if err := database.Model(&authentication.Account{}).Where("login = ?", "second.admin@example.com").Count(&accountCount).Error; err != nil {
		closeDatabase(t, database)
		t.Fatalf("count rolled-back Account: %v", err)
	}
	closeDatabase(t, database)
	if tenantCount != 0 || accountCount != 0 {
		t.Fatalf("expected no Tenant or Account after rollback, got tenants=%d accounts=%d", tenantCount, accountCount)
	}
}
