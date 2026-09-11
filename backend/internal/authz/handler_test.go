package authz

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"gorm.io/gorm"
)

func TestAuthzAdminEndpointsRequireActor(t *testing.T) {
	database := newAuthzTestDB(t)
	app := newAuthzTestApp(database)

	resp := doAuthzRequest(t, app, http.MethodGet, "/api/v1/authz/roles", nil, nil)
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected missing actor status 401, got %d", resp.StatusCode)
	}
}

func TestAuthzAdminEndpointsRejectActorWithoutPermission(t *testing.T) {
	database := newAuthzTestDB(t)
	actorID := createAuthzActor(t, database, "persisted-expense@example.com", nil, nil)
	grantAuthzRole(t, database, actorID, RoleExpenseOperator, "tenant-a")
	app := newAuthzTestApp(database)

	resp := doAuthzRequest(t, app, http.MethodGet, "/api/v1/authz/roles", nil, map[string]string{
		HeaderActorID:  "persisted-expense@example.com",
		HeaderTenantID: "tenant-a",
	})
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("expected forbidden status 403, got %d", resp.StatusCode)
	}
}

func TestAuthzCurrentActorReturnsPersistedOperatingContext(t *testing.T) {
	database := newAuthzTestDB(t)
	actorID := createAuthzActor(t, database, "expense-current@example.com", nil, nil)
	grantAuthzRole(t, database, actorID, RoleExpenseOperator, "tenant-a")
	app := newAuthzTestApp(database)

	resp := doAuthzRequest(t, app, http.MethodGet, "/api/v1/authz/current-actor", nil, map[string]string{
		HeaderActorID:  "expense-current@example.com",
		HeaderTenantID: "tenant-a",
	})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected current actor status 200, got %d", resp.StatusCode)
	}
	current := decodeData[CurrentActorResponse](t, resp)
	if current.ActorKey != "expense-current@example.com" || current.ActorRecordID != actorID || current.TenantID != "tenant-a" {
		t.Fatalf("unexpected current actor response: %#v", current)
	}
	if len(current.RoleCodes) != 1 || current.RoleCodes[0] != string(RoleExpenseOperator) {
		t.Fatalf("unexpected current actor roles: %#v", current.RoleCodes)
	}
	if !containsString(current.Permissions, string(PermissionExpensesCreate)) {
		t.Fatalf("expected expenses.create permission: %#v", current.Permissions)
	}
}

func TestCurrentActorResponseSerializesEmptyAuthorizationCollectionsAsArrays(t *testing.T) {
	response := currentActorResponse(&Actor{
		ID:                   "person-only@example.test",
		RecordID:             "actor-person-only",
		TenantID:             "tenant-a",
		Scope:                ActorScopeTenant,
		PersonID:             "person-a",
		GlobalPersonID:       "global-person-a",
		MembershipID:         "membership-a",
		RoleCodes:            nil,
		Permissions:          map[Permission]struct{}{PermissionPeopleSelfRead: {}},
		IntrinsicPermissions: map[Permission]struct{}{PermissionPeopleSelfRead: {}},
		DelegatedPermissions: nil,
	})

	if response.RoleCodes == nil {
		t.Fatal("expected empty roleCodes array, got nil")
	}
	if response.Permissions == nil || response.IntrinsicPermissions == nil || response.DelegatedPermissions == nil {
		t.Fatalf("expected non-nil permission collections, got %#v", response)
	}

	payload, err := json.Marshal(response)
	if err != nil {
		t.Fatalf("marshal current actor response: %v", err)
	}
	for _, expected := range [][]byte{
		[]byte(`"roleCodes":[]`),
		[]byte(`"delegatedPermissions":[]`),
	} {
		if !bytes.Contains(payload, expected) {
			t.Fatalf("expected %s in current actor JSON, got %s", expected, payload)
		}
	}
}

func TestAuthzAdminCannotDeactivateOrRevokeItsOwnOperatingActor(t *testing.T) {
	database := newAuthzTestDB(t)
	adminActorID := createAuthzActor(t, database, "self-admin@example.com", nil, nil)
	grantAuthzRole(t, database, adminActorID, RoleApplicationAdmin, GlobalTenantScope)
	app := newAuthzTestApp(database)
	headers := map[string]string{HeaderActorID: "self-admin@example.com", HeaderTenantID: GlobalTenantScope}

	deactivateResp := doAuthzRequest(t, app, http.MethodPatch, "/api/v1/authz/actors/"+adminActorID+"/active", map[string]any{"active": false}, headers)
	if deactivateResp.StatusCode != http.StatusForbidden {
		t.Fatalf("expected self-deactivation status 403, got %d", deactivateResp.StatusCode)
	}

	var grant AuthzActorRoleGrant
	if err := database.Where("actor_id = ? AND active = ?", adminActorID, true).First(&grant).Error; err != nil {
		t.Fatalf("find self admin grant: %v", err)
	}
	revokeResp := doAuthzRequest(t, app, http.MethodDelete, "/api/v1/authz/actors/"+adminActorID+"/role-grants/"+grant.ID, nil, headers)
	if revokeResp.StatusCode != http.StatusForbidden {
		t.Fatalf("expected self-revoke status 403, got %d", revokeResp.StatusCode)
	}
}

func TestTenantAdminCanReactivateInactiveActorInOwnTenant(t *testing.T) {
	database := newAuthzTestDB(t)
	installTenantRoleDelegationFixtureTables(t, database)

	managerPersonID := "person-tenant-manager"
	managerID := createAuthzActor(t, database, "tenant-manager@example.com", &managerPersonID, nil)
	bindActiveTenantMemberActor(t, database, managerID, "tenant-a")
	grantAuthzRole(t, database, managerID, RoleTenantAdmin, "tenant-a")

	targetID := createAuthzActor(t, database, "identity-d@example.test", nil, nil)
	bindActiveTenantMemberActor(t, database, targetID, "tenant-a")
	if err := database.Model(&AuthzActor{}).Where("id = ?", targetID).Update("active", false).Error; err != nil {
		t.Fatalf("deactivate target Actor: %v", err)
	}

	app := newAuthzTestApp(database)
	headers := map[string]string{HeaderActorID: "tenant-manager@example.com", HeaderTenantID: "tenant-a"}

	listResp := doAuthzRequest(t, app, http.MethodGet, "/api/v1/authz/tenant-role-actors", nil, headers)
	if listResp.StatusCode != http.StatusOK {
		t.Fatalf("expected tenant Actor list status 200, got %d", listResp.StatusCode)
	}
	actors := decodeData[[]ActorResponse](t, listResp)
	found := false
	for _, actor := range actors {
		if actor.ID == targetID {
			found = true
			if actor.Active {
				t.Fatalf("expected target to be listed inactive, got %#v", actor)
			}
		}
	}
	if !found {
		t.Fatalf("expected inactive target Actor in tenant lifecycle directory, got %#v", actors)
	}

	activateResp := doAuthzRequest(t, app, http.MethodPatch, "/api/v1/authz/tenant-role-actors/"+targetID+"/active", map[string]any{"active": true}, headers)
	if activateResp.StatusCode != http.StatusOK {
		t.Fatalf("expected tenant Actor activation status 200, got %d", activateResp.StatusCode)
	}
	updated := decodeData[ActorResponse](t, activateResp)
	if !updated.Active {
		t.Fatalf("expected target Actor active, got %#v", updated)
	}
}

func TestAuthzAdminCanDeactivateAnotherActor(t *testing.T) {
	database := newAuthzTestDB(t)
	adminActorID := createAuthzActor(t, database, "lifecycle-admin@example.com", nil, nil)
	grantAuthzRole(t, database, adminActorID, RoleApplicationAdmin, GlobalTenantScope)
	targetID := createAuthzActor(t, database, "operator-to-deactivate@example.com", nil, nil)
	grantAuthzRole(t, database, targetID, RoleExpenseOperator, "default")
	app := newAuthzTestApp(database)
	headers := map[string]string{HeaderActorID: "lifecycle-admin@example.com", HeaderTenantID: GlobalTenantScope}

	resp := doAuthzRequest(t, app, http.MethodPatch, "/api/v1/authz/actors/"+targetID+"/active", map[string]any{"active": false}, headers)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected deactivate status 200, got %d", resp.StatusCode)
	}
	updated := decodeData[ActorResponse](t, resp)
	if updated.Active {
		t.Fatalf("expected inactive actor, got %#v", updated)
	}
}

func TestAuthzAdminCreatesIdentityNeutralActorAndRejectsUnboundTenantGrant(t *testing.T) {
	database := newAuthzTestDB(t)
	installTenantRoleDelegationFixtureTables(t, database)
	adminActorID := createAuthzActor(t, database, "app-admin-tooling@example.com", nil, nil)
	grantAuthzRole(t, database, adminActorID, RoleApplicationAdmin, GlobalTenantScope)
	app := newAuthzTestApp(database)
	headers := map[string]string{HeaderActorID: "app-admin-tooling@example.com", HeaderTenantID: GlobalTenantScope}

	createBody := map[string]any{
		"actorKey":    "expenses-tooling@example.com",
		"displayName": "Expenses Tooling",
		// Stale legacy identity inputs must not create Actor identity links.
		"personId":       "legacy-person-should-be-ignored",
		"collaboratorId": "legacy-collaborator-should-be-ignored",
	}
	createResp := doAuthzRequest(t, app, http.MethodPost, "/api/v1/authz/actors", createBody, headers)
	if createResp.StatusCode != http.StatusCreated {
		t.Fatalf("expected create actor status 201, got %d", createResp.StatusCode)
	}
	created := decodeData[ActorResponse](t, createResp)
	if created.ID == "" || created.ActorKey != "expenses-tooling@example.com" || !created.Active || created.PersonID != "" || created.CollaboratorID != "" {
		t.Fatalf("expected identity-neutral created actor, got %#v", created)
	}
	var persisted AuthzActor
	if err := database.First(&persisted, "id = ?", created.ID).Error; err != nil {
		t.Fatalf("find created Actor: %v", err)
	}

	grantBody := map[string]any{"roleCode": string(RoleExpenseOperator), "tenantId": "tenant-a"}
	grantResp := doAuthzRequest(t, app, http.MethodPost, "/api/v1/authz/actors/"+created.ID+"/role-grants", grantBody, headers)
	if grantResp.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected unbound tenant Role Grant status 400, got %d", grantResp.StatusCode)
	}

	auditResp := doAuthzRequest(t, app, http.MethodGet, "/api/v1/authz/audit-logs?operation=authz.actors.create", nil, headers)
	if auditResp.StatusCode != http.StatusOK {
		t.Fatalf("expected audit log status 200, got %d", auditResp.StatusCode)
	}
	auditLogs := decodeData[[]AuditLogResponse](t, auditResp)
	if len(auditLogs) == 0 || auditLogs[0].Operation != "authz.actors.create" || auditLogs[0].TargetID != created.ID || auditLogs[0].Decision != AuditDecisionAuthorized {
		t.Fatalf("expected actor create audit log, got %#v", auditLogs)
	}
}

func TestAuthzAdminListsRolesPermissionsAndActors(t *testing.T) {
	database := newAuthzTestDB(t)
	adminActorID := createAuthzActor(t, database, "app-admin-list@example.com", nil, nil)
	grantAuthzRole(t, database, adminActorID, RoleApplicationAdmin, GlobalTenantScope)
	app := newAuthzTestApp(database)
	headers := map[string]string{HeaderActorID: "app-admin-list@example.com", HeaderTenantID: GlobalTenantScope}

	rolesResp := doAuthzRequest(t, app, http.MethodGet, "/api/v1/authz/roles", nil, headers)
	if rolesResp.StatusCode != http.StatusOK {
		t.Fatalf("expected roles status 200, got %d", rolesResp.StatusCode)
	}
	roles := decodeData[[]RoleResponse](t, rolesResp)
	for _, expectedRole := range []RoleCode{
		RoleApplicationAdmin,
		RoleTenantAdmin,
		RoleEarningsOperator,
		RoleExpenseOperator,
	} {
		role, ok := findRoleResponse(roles, string(expectedRole))
		if !ok {
			t.Fatalf("expected seeded delegated role %s, got %#v", expectedRole, roles)
		}
		if !role.Active {
			t.Fatalf("expected seeded delegated role %s to be active, got %#v", expectedRole, role)
		}
	}
	if role, ok := findRoleResponse(roles, string(RolePerson)); ok {
		t.Fatalf("PERSON must not be listed as a seeded/grantable 30D role, got %#v", role)
	}

	permissionsResp := doAuthzRequest(t, app, http.MethodGet, "/api/v1/authz/permissions", nil, headers)
	if permissionsResp.StatusCode != http.StatusOK {
		t.Fatalf("expected permissions status 200, got %d", permissionsResp.StatusCode)
	}
	permissions := decodeData[[]PermissionResponse](t, permissionsResp)
	if !containsPermissionResponse(permissions, string(PermissionAuthzManage)) {
		t.Fatalf("expected authz.manage permission in catalog: %#v", permissions)
	}

	actorsResp := doAuthzRequest(t, app, http.MethodGet, "/api/v1/authz/actors", nil, headers)
	if actorsResp.StatusCode != http.StatusOK {
		t.Fatalf("expected actors status 200, got %d", actorsResp.StatusCode)
	}
	actors := decodeData[[]ActorResponse](t, actorsResp)
	if len(actors) == 0 || actors[0].ActorKey == "" {
		t.Fatalf("expected actor list, got %#v", actors)
	}
}

func TestTenantSupportAccessLeaseHTTPLifecycleAndCurrentActorProvenance(t *testing.T) {
	database := newAuthzTestDB(t)
	installSupportAccessLeaseFixtureTables(t, database)
	seedSupportAccessLeaseTenant(t, database, "tenant-a", "Tenant A")
	seedSupportApplicationAdministrator(t, database, "lease-http-app@example.test", "account-lease-http-app")
	seedSupportTenantAdministrator(t, database, "tenant-a", "lease-http-admin@example.test", "account-lease-http-admin", "person-lease-http-admin")
	app := newAuthzTestApp(database)

	requestResp := doAuthzRequest(t, app, http.MethodPost, "/api/v1/authz/support-access-leases", map[string]any{
		"tenantId":    "tenant-a",
		"expiresAt":   time.Now().UTC().Add(time.Hour).Format(time.RFC3339),
		"reason":      "HTTP support workflow",
		"permissions": []string{string(PermissionPeopleRead)},
	}, map[string]string{HeaderActorID: "lease-http-app@example.test", HeaderTenantID: GlobalTenantScope})
	if requestResp.StatusCode != http.StatusCreated {
		t.Fatalf("expected support lease request status 201, got %d", requestResp.StatusCode)
	}
	lease := decodeData[SupportAccessLeaseResponse](t, requestResp)
	if lease.Status != SupportAccessLeaseStatusPending || lease.ID == "" {
		t.Fatalf("unexpected requested support lease: %#v", lease)
	}

	pendingListResp := doAuthzRequest(t, app, http.MethodGet, "/api/v1/authz/support-access-leases?status=PENDING", nil, map[string]string{
		HeaderActorID: "lease-http-app@example.test", HeaderTenantID: GlobalTenantScope,
	})
	if pendingListResp.StatusCode != http.StatusOK {
		t.Fatalf("expected filtered support lease list status 200, got %d", pendingListResp.StatusCode)
	}
	pendingList := decodeData[[]SupportAccessLeaseResponse](t, pendingListResp)
	if len(pendingList) != 1 || pendingList[0].ID != lease.ID || pendingList[0].EffectiveStatus != SupportAccessLeaseStatusPending {
		t.Fatalf("expected PENDING filter to return an array containing the pending lease, got %#v", pendingList)
	}

	eligibleResp := doAuthzRequest(t, app, http.MethodGet, "/api/v1/authz/support-access-leases/eligible-permissions", nil, map[string]string{
		HeaderActorID: "lease-http-app@example.test", HeaderTenantID: GlobalTenantScope,
	})
	if eligibleResp.StatusCode != http.StatusOK {
		t.Fatalf("expected eligible support permission status 200, got %d", eligibleResp.StatusCode)
	}
	eligible := decodeData[[]PermissionResponse](t, eligibleResp)
	if !containsPermissionResponse(eligible, string(PermissionPeopleRead)) || containsPermissionResponse(eligible, string(PermissionAuthzManage)) {
		t.Fatalf("unexpected eligible support permission catalog: %#v", eligible)
	}

	approveResp := doAuthzRequest(t, app, http.MethodPost, "/api/v1/authz/support-access-leases/"+lease.ID+"/approve", nil, map[string]string{
		HeaderActorID: "lease-http-admin@example.test", HeaderTenantID: "tenant-a",
	})
	if approveResp.StatusCode != http.StatusOK {
		t.Fatalf("expected support lease approval status 200, got %d", approveResp.StatusCode)
	}

	auditResp := doAuthzRequest(t, app, http.MethodGet, "/api/v1/authz/support-access-leases/"+lease.ID+"/audit-logs", nil, map[string]string{
		HeaderActorID: "lease-http-admin@example.test", HeaderTenantID: "tenant-a",
	})
	if auditResp.StatusCode != http.StatusOK {
		t.Fatalf("expected Tenant Administrator lease audit status 200, got %d", auditResp.StatusCode)
	}
	leaseAudit := decodeData[[]AuditLogResponse](t, auditResp)
	if len(leaseAudit) != 2 || leaseAudit[0].SupportLeaseID != lease.ID {
		t.Fatalf("expected request/approval lease audit provenance, got %#v", leaseAudit)
	}

	currentResp := doAuthzRequest(t, app, http.MethodGet, "/api/v1/authz/current-actor", nil, map[string]string{
		HeaderActorID: "lease-http-app@example.test", HeaderTenantID: "tenant-a",
	})
	if currentResp.StatusCode != http.StatusOK {
		t.Fatalf("expected leased current actor status 200, got %d", currentResp.StatusCode)
	}
	current := decodeData[CurrentActorResponse](t, currentResp)
	if current.Scope != string(ActorScopeApplication) || current.TenantID != "tenant-a" || current.SupportLeaseID != lease.ID {
		t.Fatalf("unexpected leased current Actor provenance: %#v", current)
	}
	if !containsString(current.SupportLeasePermissions, string(PermissionPeopleRead)) {
		t.Fatalf("expected support lease permission provenance: %#v", current.SupportLeasePermissions)
	}

	terminateResp := doAuthzRequest(t, app, http.MethodPost, "/api/v1/authz/support-access-leases/"+lease.ID+"/terminate", map[string]any{"reason": "complete"}, map[string]string{
		HeaderActorID: "lease-http-admin@example.test", HeaderTenantID: "tenant-a",
	})
	if terminateResp.StatusCode != http.StatusOK {
		t.Fatalf("expected support lease termination status 200, got %d", terminateResp.StatusCode)
	}

	logs, err := NewGORMStore(database).ListAuthorizationAuditLogs(context.Background(), AuditLogFilter{TargetType: "tenant_support_access_lease", TargetID: lease.ID})
	if err != nil {
		t.Fatalf("list support lease audit logs: %v", err)
	}
	if len(logs) != 3 {
		t.Fatalf("expected request/approve/terminate audit logs, got %#v", logs)
	}
}

func newAuthzTestApp(database *gorm.DB) *fiber.App {
	store := NewGORMStore(database)
	app := fiber.New()
	api := app.Group("/api")
	v1 := api.Group("/v1")
	authzGroup := v1.Group("/authz")
	h := NewHandler(store)
	authzGroup.Get("/current-actor", h.CurrentActor)
	authzGroup.Get("/roles", h.ListRoles)
	authzGroup.Get("/permissions", h.ListPermissions)
	authzGroup.Get("/actors", h.ListActors)
	authzGroup.Get("/tenant-role-actors", h.ListTenantRoleActors)
	authzGroup.Patch("/tenant-role-actors/:id/active", h.SetTenantActorActive)
	authzGroup.Post("/tenant-role-actors/:id/role-grants", h.GrantTenantOperatorRole)
	authzGroup.Delete("/tenant-role-actors/:id/role-grants/:grantId", h.RevokeTenantOperatorRoleGrant)
	authzGroup.Get("/support-access-leases", h.ListSupportAccessLeases)
	authzGroup.Get("/support-access-leases/eligible-permissions", h.ListEligibleSupportAccessLeasePermissions)
	authzGroup.Get("/support-access-leases/:id/audit-logs", h.ListSupportAccessLeaseAuditLogs)
	authzGroup.Post("/support-access-leases", h.RequestSupportAccessLease)
	authzGroup.Post("/support-access-leases/:id/approve", h.ApproveSupportAccessLease)
	authzGroup.Post("/support-access-leases/:id/terminate", h.TerminateSupportAccessLease)
	authzGroup.Get("/audit-logs", h.ListAuditLogs)
	authzGroup.Post("/actors", h.CreateActor)
	authzGroup.Patch("/actors/:id/active", h.SetActorActive)
	authzGroup.Post("/actors/:id/role-grants", h.GrantActorRole)
	authzGroup.Delete("/actors/:id/role-grants/:grantId", h.RevokeActorRoleGrant)
	return app
}

func doAuthzRequest(t *testing.T, app *fiber.App, method string, path string, body any, headers map[string]string) *http.Response {
	t.Helper()
	var payload []byte
	if body != nil {
		var err error
		payload, err = json.Marshal(body)
		if err != nil {
			t.Fatalf("marshal body: %v", err)
		}
	}
	req := httptest.NewRequest(method, path, bytes.NewReader(payload))
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	for key, value := range headers {
		req.Header.Set(key, value)
	}
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("test request %s %s: %v", method, path, err)
	}
	return resp
}

type apiTestResponse[T any] struct {
	Data  T   `json:"data"`
	Error any `json:"error"`
}

func decodeData[T any](t *testing.T, resp *http.Response) T {
	t.Helper()
	defer resp.Body.Close()
	var envelope apiTestResponse[T]
	if err := json.NewDecoder(resp.Body).Decode(&envelope); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	return envelope.Data
}

func findRoleResponse(rows []RoleResponse, code string) (RoleResponse, bool) {
	for _, row := range rows {
		if row.Code == code {
			return row, true
		}
	}
	return RoleResponse{}, false
}

func containsPermissionResponse(rows []PermissionResponse, code string) bool {
	for _, row := range rows {
		if row.Code == code {
			return true
		}
	}
	return false
}

func containsString(values []string, value string) bool {
	for _, candidate := range values {
		if candidate == value {
			return true
		}
	}
	return false
}
