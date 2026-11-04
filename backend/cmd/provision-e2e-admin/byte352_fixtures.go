package main

import (
	"context"
	"fmt"
	"strings"
	"time"

	"enterpriseremotesystems/backend/internal/authentication"
	"enterpriseremotesystems/backend/internal/authz"
	dbpkg "enterpriseremotesystems/backend/internal/db"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// Byte 35.2 fixtures use the two EXISTING isolated E2E Tenants. This path never
// invokes general E2E administrator provisioning or changes an existing password.
const byte352TenantA = "e2e-authz-admin-tenant"
const byte352TenantB = "e2e-isolation-tenant"

type byte352FixtureInput struct {
	DatabasePath string            `json:"databasePath"`
	Credentials  map[string]string `json:"credentials"`
	// Explicit consent applies only to the two known E2E Tenant Administrators.
	RotateTenantAdministratorPasswords bool `json:"rotateTenantAdministratorPasswords"`
}
type byte352Identity struct {
	Stem, Login, Name string
	Tenants           []string
	Role              authz.RoleCode // empty = collaborator, no delegated grants
	Collaborator      bool
	Administrator     bool
}

var byte352Administrators = []byte352Identity{
	{Stem: "e2e-authz-admin-tenant-admin", Login: "e2e-authz-admin-tenant-admin@example.com", Name: "Tenant Administrator A", Tenants: []string{byte352TenantA}, Role: authz.RoleTenantAdmin, Administrator: true},
	{Stem: "e2e-isolation-tenant-admin", Login: "e2e-isolation-tenant-admin@example.com", Name: "Tenant Administrator B", Tenants: []string{byte352TenantB}, Role: authz.RoleTenantAdmin, Administrator: true},
}

var byte352Identities = []byte352Identity{
	{Stem: "e2e-authz-admin-earnings-operator", Login: "e2e-authz-admin-earnings-operator@example.com", Name: "Earnings Operator A", Tenants: []string{byte352TenantA}, Role: authz.RoleEarningsOperator},
	{Stem: "e2e-authz-admin-expenses-operator", Login: "e2e-authz-admin-expenses-operator@example.com", Name: "Expenses Operator A", Tenants: []string{byte352TenantA}, Role: authz.RoleExpenseOperator},
	{Stem: "e2e-isolation-earnings-operator", Login: "e2e-isolation-earnings-operator@example.com", Name: "Earnings Operator B", Tenants: []string{byte352TenantB}, Role: authz.RoleEarningsOperator},
	{Stem: "e2e-isolation-expenses-operator", Login: "e2e-isolation-expenses-operator@example.com", Name: "Expenses Operator B", Tenants: []string{byte352TenantB}, Role: authz.RoleExpenseOperator},
	{Stem: "e2e-byte352-collaborator-a", Login: "e2e-byte352-collaborator-a@example.com", Name: "Collaborator A", Tenants: []string{byte352TenantA}, Collaborator: true},
	{Stem: "e2e-byte352-collaborator-b", Login: "e2e-byte352-collaborator-b@example.com", Name: "Collaborator B", Tenants: []string{byte352TenantB}, Collaborator: true},
	{Stem: "e2e-byte352-shared", Login: "e2e-byte352-shared@example.com", Name: "Shared Person", Tenants: []string{byte352TenantA, byte352TenantB}, Collaborator: true},
}

func validateByte352Input(input byte352FixtureInput) error {
	if strings.TrimSpace(input.DatabasePath) == "" {
		return fmt.Errorf("databasePath is required")
	}
	if len(input.Credentials) != len(byte352Identities)+len(byte352Administrators) {
		return fmt.Errorf("exactly %d separate fixture credentials required, including two Tenant Administrators", len(byte352Identities)+len(byte352Administrators))
	}
	seen := map[string]bool{}
	for _, spec := range append(append([]byte352Identity{}, byte352Administrators...), byte352Identities...) {
		pw, ok := input.Credentials[spec.Login]
		if !ok || len(pw) < 16 || strings.TrimSpace(pw) != pw || strings.ContainsAny(pw, "\r\n") {
			return fmt.Errorf("missing or invalid password for %s (minimum 16 characters)", spec.Login)
		}
		if seen[pw] {
			return fmt.Errorf("fixture accounts must use distinct passwords")
		}
		seen[pw] = true
	}
	return nil
}

func ensureByte352Fixtures(ctx context.Context, database *gorm.DB, input byte352FixtureInput, cost int) error {
	if database == nil {
		return fmt.Errorf("database is required")
	}
	if err := validateByte352Input(input); err != nil {
		return err
	}
	if cost < bcrypt.MinCost || cost > bcrypt.MaxCost {
		return fmt.Errorf("invalid bcrypt cost")
	}
	return database.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		for _, tenantID := range []string{byte352TenantA, byte352TenantB} {
			var tenant dbpkg.Tenant
			if err := tx.Where("id = ? AND active = ?", tenantID, true).First(&tenant).Error; err != nil {
				return fmt.Errorf("existing active fixture Tenant %s required; run separately approved E2E seed first: %w", tenantID, err)
			}
			if tenant.Code != map[string]string{byte352TenantA: "E2EAUTHZADMIN", byte352TenantB: "E2EISOLATION"}[tenantID] {
				return fmt.Errorf("unexpected Tenant code for %s", tenantID)
			}
		}
		for _, spec := range append(append([]byte352Identity{}, byte352Administrators...), byte352Identities...) {
			if err := ensureByte352Identity(tx, spec, input.Credentials[spec.Login], cost, input.RotateTenantAdministratorPasswords); err != nil {
				return fmt.Errorf("%s: %w", spec.Login, err)
			}
		}
		return nil
	})
}

func ensureByte352Identity(tx *gorm.DB, spec byte352Identity, password string, cost int, rotateAdministrator bool) error {
	now := time.Now().UTC()
	personID, accountID := spec.Stem+"-person", spec.Stem+"-account"
	var other authentication.Account
	if err := tx.Where("LOWER(login) = LOWER(?) AND id <> ?", spec.Login, accountID).Limit(1).Find(&other).Error; err != nil {
		return err
	}
	if other.ID != "" {
		return fmt.Errorf("login already belongs to another Account: %s", spec.Login)
	}
	var conflictingPerson dbpkg.GlobalPerson
	if err := tx.Where("LOWER(email) = LOWER(?) AND id <> ?", spec.Login, personID).Limit(1).Find(&conflictingPerson).Error; err != nil {
		return err
	}
	if conflictingPerson.ID != "" {
		return fmt.Errorf("email already belongs to another global Person: %s", spec.Login)
	}
	person := dbpkg.GlobalPerson{BaseModel: dbpkg.BaseModel{ID: personID, CreatedAt: now, UpdatedAt: now}, FirstName: "E2E", LastName: spec.Name, Nickname: spec.Name, CPF: spec.Stem + "-cpf", RG: spec.Stem + "-rg", Cellular: "11911112222", Email: spec.Login, Country: "Brasil", ProfileCompletionStatus: "COMPLETE", CanCreateCollaborator: true, OperationalActive: true}
	var existingPerson dbpkg.GlobalPerson
	if err := tx.Where("id = ?", personID).Limit(1).Find(&existingPerson).Error; err != nil {
		return err
	}
	if existingPerson.ID == "" {
		if err := tx.Create(&person).Error; err != nil {
			return err
		}
	} else if !strings.EqualFold(existingPerson.Email, spec.Login) {
		return fmt.Errorf("fixture Person ID belongs to another email")
	}
	var account authentication.Account
	if err := tx.Where("id = ?", accountID).Limit(1).Find(&account).Error; err != nil {
		return err
	}
	if account.ID == "" {
		hash, err := bcrypt.GenerateFromPassword([]byte(password), cost)
		if err != nil {
			return err
		}
		account = authentication.Account{ID: accountID, Login: spec.Login, PasswordHash: string(hash), Active: true, MustChangePassword: false, PasswordChangedAt: &now, CreatedAt: now, UpdatedAt: now}
		if err := tx.Create(&account).Error; err != nil {
			return err
		}
	} else {
		if !strings.EqualFold(account.Login, spec.Login) {
			return fmt.Errorf("fixture Account ID belongs to another login")
		}
		// A rerun must never silently rotate credentials or reactivate an account.
		if !account.Active {
			return fmt.Errorf("fixture Account inactive: resolve manually")
		}
		if bcrypt.CompareHashAndPassword([]byte(account.PasswordHash), []byte(password)) != nil {
			if !spec.Administrator || !rotateAdministrator {
				return fmt.Errorf("existing fixture password differs for %s; refusing rotation (Tenant Administrators require explicit rotateTenantAdministratorPasswords consent)", spec.Login)
			}
			hash, err := bcrypt.GenerateFromPassword([]byte(password), cost)
			if err != nil {
				return err
			}
			if err := tx.Model(&authentication.Account{}).Where("id = ? AND login = ? AND active = ?", accountID, spec.Login, true).Updates(map[string]any{"password_hash": string(hash), "password_changed_at": now, "updated_at": now}).Error; err != nil {
				return err
			}
		}
	}
	var ap authentication.AccountPerson
	if err := tx.Where("account_id = ?", accountID).Limit(1).Find(&ap).Error; err != nil {
		return err
	}
	if ap.AccountID != "" && ap.PersonID != personID {
		return fmt.Errorf("Account bound to another Person")
	}
	if ap.AccountID == "" {
		if err := tx.Create(&authentication.AccountPerson{AccountID: accountID, PersonID: personID, CreatedAt: now, UpdatedAt: now}).Error; err != nil {
			return err
		}
	}
	for _, tenantID := range spec.Tenants {
		var status dbpkg.ReferenceData
		if err := tx.Where("tenant_id = ? AND type = ? AND code = ? AND active = ?", tenantID, "person_status", "ACTIVE", true).First(&status).Error; err != nil {
			return err
		}
		membershipID := spec.Stem + "-membership-" + tenantID
		if spec.Administrator {
			membershipID = spec.Stem + "-membership"
		}
		var member dbpkg.PersonTenantMembership
		if err := tx.Where("id = ?", membershipID).Limit(1).Find(&member).Error; err != nil {
			return err
		}
		if member.ID == "" {
			member = dbpkg.PersonTenantMembership{BaseModel: dbpkg.BaseModel{ID: membershipID, CreatedAt: now, UpdatedAt: now}, TenantID: tenantID, PersonID: personID, StatusID: status.ID}
			if err := tx.Create(&member).Error; err != nil {
				return err
			}
		} else if member.PersonID != personID || member.TenantID != tenantID || member.StatusID != status.ID {
			return fmt.Errorf("existing Membership does not match expected active Person/Tenant")
		}
		actorID := spec.Stem + "-actor-" + tenantID
		if spec.Administrator {
			actorID = spec.Stem + "-actor"
		}
		var actor authz.AuthzActor
		if err := tx.Where("id = ?", actorID).Limit(1).Find(&actor).Error; err != nil {
			return err
		}
		if actor.ID == "" {
			actor = authz.AuthzActor{ID: actorID, ActorKey: actorID, DisplayName: spec.Name, Active: true, CreatedAt: now, UpdatedAt: now}
			if err := tx.Create(&actor).Error; err != nil {
				return err
			}
		} else if actor.ActorKey != actorID || !actor.Active {
			return fmt.Errorf("existing Actor conflicted or inactive")
		}
		var binding authentication.AccountActor
		if err := tx.Where("actor_id = ?", actorID).Limit(1).Find(&binding).Error; err != nil {
			return err
		}
		if binding.ActorID == "" {
			tid, mid := tenantID, membershipID
			binding = authentication.AccountActor{AccountID: accountID, ActorID: actorID, ScopeType: authentication.AccountActorScopeTenant, TenantID: &tid, MembershipID: &mid, CreatedAt: now, UpdatedAt: now}
			if err := tx.Create(&binding).Error; err != nil {
				return err
			}
		} else if binding.AccountID != accountID || binding.ScopeType != authentication.AccountActorScopeTenant || binding.TenantID == nil || *binding.TenantID != tenantID || binding.MembershipID == nil || *binding.MembershipID != membershipID {
			return fmt.Errorf("existing Actor binding conflicts with canonical identity")
		}
		if spec.Role != "" {
			if err := authz.GrantRole(tx, actorID, spec.Role, tenantID); err != nil {
				return err
			}
		}
		if spec.Collaborator {
			refs, err := e2eBite32ReferenceIDs(tx, tenantID)
			if err != nil {
				return err
			}
			daily := 100.0
			mid := membershipID
			journey := dbpkg.CollaboratorJourney{BaseModel: dbpkg.BaseModel{ID: spec.Stem + "-journey-" + tenantID, CreatedAt: now, UpdatedAt: now}, TenantID: tenantID, MembershipID: &mid, JourneyStartDate: time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC), DefaultEndDate: time.Date(2027, 12, 31, 0, 0, 0, 0, time.UTC), ProjectedEndDate: time.Date(2027, 12, 31, 0, 0, 0, 0, time.UTC), PaymentMethodID: refs["method/DAILY"], PaymentValue: daily, DailyBRLAmount: &daily, PlanningAvailability: "ACTIVE", SectorID: refs["sector/MINING"], LocationID: refs["location/MAIN_MINE"], TaskID: refs["task/MINER"], StatusID: refs["collaborator_status/ACTIVE"], Notes: "Byte 35.2 synthetic translation-only Journey"}
			var prior dbpkg.CollaboratorJourney
			if err := tx.Where("id = ?", journey.ID).Limit(1).Find(&prior).Error; err != nil {
				return err
			}
			if prior.ID == "" {
				if err := tx.Create(&journey).Error; err != nil {
					return err
				}
			} else if prior.TenantID != tenantID || prior.MembershipID == nil || *prior.MembershipID != membershipID {
				return fmt.Errorf("existing Journey ownership conflicts")
			}
		}
	}
	return nil
}
