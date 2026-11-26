package tenants

import (
	"context"
	"fmt"
	"strings"
	"time"

	"enterpriseremotesystems/backend/internal/authentication"
	"enterpriseremotesystems/backend/internal/authz"
	"enterpriseremotesystems/backend/internal/db"
	"enterpriseremotesystems/backend/internal/shared/ids"
	"gorm.io/gorm"
)

// CreateInitialTenantAdminCandidate is create-only and atomic. A Tenant with
// existing admin-role assignments or any existing candidate must use the normal
// assignment workflow instead. No Person/Account is reused or reparented.
func (r *gormRepository) CreateInitialTenantAdminCandidate(ctx context.Context, tenantID string, req CreateInitialTenantAdminCandidateRequest, passwordHash string, operatorAccountID string, operatorActorID string, correlationID string) (*InitialTenantAdminCandidateDTO, error) {
	var created InitialTenantAdminCandidateDTO
	if strings.TrimSpace(correlationID) == "" {
		correlationID = ids.New()
	}
	err := r.database.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var tenant db.Tenant
		if err := tx.Where("id = ?", tenantID).First(&tenant).Error; err != nil {
			return err
		}
		if !tenant.Active {
			return ValidationError{Fields: map[string]string{"tenantId": "Tenant must be active"}}
		}

		// A stale assignment must not be bypassed just because its Actor is inactive.
		var grants int64
		if err := tx.Table("authz_actor_role_grants g").Joins("JOIN authz_roles role ON role.id = g.role_id").Where("g.tenant_id = ? AND g.active = ? AND role.code = ?", tenantID, true, string(authz.RoleTenantAdmin)).Count(&grants).Error; err != nil {
			return err
		}
		if grants != 0 {
			return ValidationError{Fields: map[string]string{"tenantId": "An administrator assignment already exists; use normal administration"}}
		}
		var candidates int64
		if err := tx.Table("auth_account_actors").Where("tenant_id = ? AND scope_type = ?", tenantID, authentication.AccountActorScopeTenant).Count(&candidates).Error; err != nil {
			return err
		}
		if candidates != 0 {
			return ValidationError{Fields: map[string]string{"tenantId": "Tenant already has an Account-bound candidate; use Assign Tenant Administrator"}}
		}

		// Fail closed if any identity already exists: never duplicate a global
		// Person, change an existing password, or expose cross-Tenant identity.
		var existing int64
		if err := tx.Table("global_people").Where("cpf = ? OR LOWER(email) = ?", req.CPF, req.Email).Count(&existing).Error; err != nil {
			return err
		}
		if existing > 0 {
			return ValidationError{Fields: map[string]string{"email": "Identity already exists; use the established Person/Membership workflow"}}
		}
		if err := tx.Table("auth_user_accounts").Where("LOWER(login) = ?", req.Email).Count(&existing).Error; err != nil {
			return err
		}
		if existing > 0 {
			return ValidationError{Fields: map[string]string{"email": "Identity already exists; use the established Person/Membership workflow"}}
		}
		if err := tx.Table("authz_actors").Where("LOWER(actor_key) = ?", strings.ToLower(req.ActorKey)).Count(&existing).Error; err != nil {
			return err
		}
		if existing > 0 {
			return ValidationError{Fields: map[string]string{"actorKey": "Actor key is already in use"}}
		}

		var activeStatus db.ReferenceData
		if err := tx.Where("tenant_id = ? AND type = ? AND code = ? AND active = ?", tenantID, "person_status", "ACTIVE", true).First(&activeStatus).Error; err != nil {
			return fmt.Errorf("active Person status is required: %w", err)
		}
		now := time.Now().UTC()
		person := db.GlobalPerson{
			BaseModel: db.BaseModel{ID: ids.New(), CreatedAt: now, UpdatedAt: now},
			FirstName: req.FirstName, LastName: req.LastName, Nickname: req.Nickname,
			CPF: req.CPF, RG: req.RG, Cellular: req.Cellular, Email: req.Email,
			Country: "Brasil", OperationalActive: true, ProfileCompletionStatus: "PERSONAL_ONLY",
		}
		if err := tx.Create(&person).Error; err != nil {
			return fmt.Errorf("create canonical Person: %w", err)
		}
		membership := db.PersonTenantMembership{
			BaseModel: db.BaseModel{ID: ids.New(), CreatedAt: now, UpdatedAt: now},
			TenantID:  tenantID, PersonID: person.ID, StatusID: activeStatus.ID,
		}
		if err := tx.Create(&membership).Error; err != nil {
			return fmt.Errorf("create tenant Membership: %w", err)
		}
		account := authentication.Account{
			ID: ids.New(), Login: req.Email, PasswordHash: passwordHash,
			Active: true, MustChangePassword: true, CreatedAt: now, UpdatedAt: now,
		}
		if err := tx.Create(&account).Error; err != nil {
			return fmt.Errorf("create ordinary Account: %w", err)
		}
		if err := tx.Create(&authentication.AccountPerson{AccountID: account.ID, PersonID: person.ID, CreatedAt: now, UpdatedAt: now}).Error; err != nil {
			return fmt.Errorf("link Account Person: %w", err)
		}
		actor := authz.AuthzActor{
			ID: ids.New(), ActorKey: req.ActorKey, DisplayName: strings.TrimSpace(req.FirstName + " " + req.LastName),
			Active: true, CreatedAt: now, UpdatedAt: now,
		}
		if err := tx.Create(&actor).Error; err != nil {
			return fmt.Errorf("create Tenant Actor: %w", err)
		}
		if err := tx.Create(&authentication.AccountActor{
			AccountID: account.ID, ActorID: actor.ID, ScopeType: authentication.AccountActorScopeTenant,
			TenantID: &tenantID, MembershipID: &membership.ID, CreatedAt: now, UpdatedAt: now,
		}).Error; err != nil {
			return fmt.Errorf("link Account-bound Tenant Actor: %w", err)
		}
		// Explicit audit evidence must commit with the identity foundation.
		if err := tx.Create(&authz.AuthzAuditLog{
			ID: ids.New(), OccurredAt: now, CreatedAt: now,
			AccountID: operatorAccountID, ActorID: operatorActorID, ActorRecordID: operatorActorID,
			ActorScope: string(authz.ActorScopeApplication), TenantID: tenantID,
			CorrelationID: correlationID, PermissionCode: string(authz.PermissionTenantsUpdate),
			AuthorizationSource: string(authz.AuthorizationSourceGlobalControlPlane), AuthorizationRoleCode: string(authz.RoleApplicationAdmin),
			Operation: "tenants.initial_admin_candidate.create", TargetType: "authz_actor", TargetID: actor.ID,
			Decision: authz.AuditDecisionAuthorized, Reason: "canonical first Tenant Administrator candidate; role grant not assigned",
		}).Error; err != nil {
			return fmt.Errorf("audit initial candidate creation: %w", err)
		}
		created = InitialTenantAdminCandidateDTO{
			ActorID: actor.ID, ActorKey: actor.ActorKey, AccountID: account.ID, Login: account.Login,
			GlobalPersonID: person.ID, MembershipID: membership.ID, TenantID: tenantID,
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return &created, nil
}
