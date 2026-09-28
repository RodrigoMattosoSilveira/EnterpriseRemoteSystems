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

const (
	e2eTenantAdminActorKey = "e2e-default-tenant-admin"
	e2eTenantAdminLogin    = "tenant-admin@example.com"

	e2eMultiTenantPersonLogin = "e2e-multi-tenant-person@example.com"
	e2eMultiTenantAID         = "e2e-multi-tenant-a"
	e2eMultiTenantBID         = "e2e-multi-tenant-b"

	e2eSupportLeaseTenantID        = "e2e-support-lease-tenant"
	e2eSupportLeaseOtherTenantID   = "e2e-support-lease-other-tenant"
	e2eSupportLeaseExpiredTenantID = "e2e-support-lease-expired-tenant"
)

type e2eTenantAdminFixture struct {
	TenantID   string
	TenantCode string
	TenantName string
	ActorKey   string
	Login      string
	Stem       string
}

func ensureE2ETenantFixtures(ctx context.Context, database *gorm.DB, password string, passwordHashCost int) error {
	// E2E provisioning runs after SQL migrations but before application bootstrap
	// calls SeedReferenceData. Migrations guarantee the default Tenant exists, but
	// not every runtime reference row required by deterministic E2E Journeys.
	// Establish the complete default-Tenant baseline before any fixture reads it.
	if err := dbpkg.SeedTenantData(database, dbpkg.DefaultTenantID); err != nil {
		return fmt.Errorf("seed default Tenant baseline for E2E fixtures: %w", err)
	}

	fixtures := []e2eTenantAdminFixture{
		{TenantID: dbpkg.DefaultTenantID, ActorKey: e2eTenantAdminActorKey, Login: e2eTenantAdminLogin, Stem: "e2e-default-tenant-admin"},
		{TenantID: "e2e-authz-admin-tenant", TenantCode: "E2EAUTHZADMIN", TenantName: "E2E Authorization Admin Boundary", ActorKey: "e2e-authz-admin-tenant-admin", Login: "e2e-authz-admin-tenant-admin@example.com", Stem: "e2e-authz-admin-tenant-admin"},
		{TenantID: "e2e-authz-role-tenant", TenantCode: "E2EAUTHZROLE", TenantName: "E2E Authorization Role Boundary", ActorKey: "e2e-authz-role-tenant-admin", Login: "e2e-authz-role-tenant-admin@example.com", Stem: "e2e-authz-role-tenant-admin"},
		{TenantID: "e2e-isolation-tenant", TenantCode: "E2EISOLATION", TenantName: "E2E Operational Isolation", ActorKey: "e2e-isolation-tenant-admin", Login: "e2e-isolation-tenant-admin@example.com", Stem: "e2e-isolation-tenant-admin"},
		{TenantID: e2eMultiTenantAID, TenantCode: "E2EMULTIA", TenantName: "E2E Multi Tenant A", ActorKey: "e2e-multi-tenant-a-admin", Login: "e2e-multi-tenant-a-admin@example.com", Stem: "e2e-multi-tenant-a-admin"},
		{TenantID: e2eMultiTenantBID, TenantCode: "E2EMULTIB", TenantName: "E2E Multi Tenant B", ActorKey: "e2e-multi-tenant-b-admin", Login: "e2e-multi-tenant-b-admin@example.com", Stem: "e2e-multi-tenant-b-admin"},
		{TenantID: e2eSupportLeaseTenantID, TenantCode: "E2ESUPPORT", TenantName: "E2E Support Access Lease", ActorKey: "e2e-support-lease-tenant-admin", Login: "e2e-support-lease-tenant-admin@example.com", Stem: "e2e-support-lease-tenant-admin"},
		{TenantID: e2eSupportLeaseOtherTenantID, TenantCode: "E2ESUPPORTOTHER", TenantName: "E2E Support Access Lease Other Tenant", ActorKey: "e2e-support-lease-other-tenant-admin", Login: "e2e-support-lease-other-tenant-admin@example.com", Stem: "e2e-support-lease-other-tenant-admin"},
		{TenantID: e2eSupportLeaseExpiredTenantID, TenantCode: "E2ESUPPORTEXPIRED", TenantName: "E2E Support Access Lease Expired Tenant", ActorKey: "e2e-support-lease-expired-tenant-admin", Login: "e2e-support-lease-expired-tenant-admin@example.com", Stem: "e2e-support-lease-expired-tenant-admin"},
	}
	for _, fixture := range fixtures {
		if err := ensureE2ETenantAdministrator(ctx, database, fixture, password, passwordHashCost); err != nil {
			return err
		}
	}
	if err := ensureE2EMultiTenantPerson(ctx, database, password, passwordHashCost); err != nil {
		return err
	}
	if err := ensureE2EBite32JourneyEvidenceFixture(ctx, database, password, passwordHashCost); err != nil {
		return err
	}
	return ensureE2EBite32RoleIsolationFixture(ctx, database, password, passwordHashCost)
}

func ensureE2ETenantAdministrator(ctx context.Context, database *gorm.DB, fixture e2eTenantAdminFixture, password string, passwordHashCost int) error {
	if database == nil {
		return fmt.Errorf("provision E2E Tenant Administrator: database is required")
	}
	password = strings.TrimSpace(password)
	if password == "" {
		return fmt.Errorf("provision E2E Tenant Administrator: password is required")
	}
	if passwordHashCost < bcrypt.MinCost || passwordHashCost > bcrypt.MaxCost {
		passwordHashCost = bcrypt.DefaultCost
	}

	return database.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if fixture.TenantID != dbpkg.DefaultTenantID {
			now := time.Now().UTC()
			tenant := dbpkg.Tenant{
				BaseModel:   dbpkg.BaseModel{ID: fixture.TenantID, CreatedAt: now, UpdatedAt: now},
				Code:        fixture.TenantCode,
				Name:        fixture.TenantName,
				Description: "Deterministic non-Production Tenant for Playwright authorization coverage",
				Active:      true,
			}
			if err := tx.Where("id = ?", tenant.ID).FirstOrCreate(&tenant).Error; err != nil {
				return fmt.Errorf("ensure E2E Tenant %s: %w", fixture.TenantID, err)
			}
			if err := dbpkg.SeedTenantData(tx, tenant.ID); err != nil {
				return fmt.Errorf("seed E2E Tenant %s: %w", fixture.TenantID, err)
			}
		}

		var status dbpkg.ReferenceData
		if err := tx.Where(
			"tenant_id = ? AND type = ? AND code = ? AND active = ?",
			fixture.TenantID,
			"person_status",
			"ACTIVE",
			true,
		).First(&status).Error; err != nil {
			return fmt.Errorf("find %s ACTIVE Person status: %w", fixture.TenantID, err)
		}

		now := time.Now().UTC()
		person := dbpkg.GlobalPerson{
			BaseModel: dbpkg.BaseModel{ID: fixture.Stem + "-person", CreatedAt: now, UpdatedAt: now},
			FirstName: "E2E",
			LastName:  "Tenant Administrator",
			Nickname:  fixture.ActorKey,
			CPF:       fixture.Stem + "-cpf",
			RG:        fixture.Stem + "-rg",
			Cellular:  fixture.Stem + "-cellular",
			Email:     fixture.Login,
			Country:   "Brasil",
		}
		if err := tx.Where("id = ?", person.ID).FirstOrCreate(&person).Error; err != nil {
			return fmt.Errorf("ensure E2E Tenant Administrator Person: %w", err)
		}

		membership := dbpkg.PersonTenantMembership{
			BaseModel: dbpkg.BaseModel{ID: fixture.Stem + "-membership", CreatedAt: now, UpdatedAt: now},
			TenantID:  fixture.TenantID,
			PersonID:  person.ID,
			StatusID:  status.ID,
		}
		var existingMembership dbpkg.PersonTenantMembership
		membershipResult := tx.Where("id = ?", membership.ID).Limit(1).Find(&existingMembership)
		if membershipResult.Error != nil {
			return fmt.Errorf("find E2E Tenant Administrator Membership: %w", membershipResult.Error)
		}
		if membershipResult.RowsAffected == 0 {
			if err := tx.Create(&membership).Error; err != nil {
				return fmt.Errorf("ensure E2E Tenant Administrator Membership: %w", err)
			}
		} else {
			if existingMembership.TenantID != membership.TenantID || existingMembership.PersonID != membership.PersonID {
				return fmt.Errorf("E2E Tenant Administrator Membership %s is bound to another Person or Tenant", membership.ID)
			}
			if err := tx.Model(&dbpkg.PersonTenantMembership{}).Where("id = ?", membership.ID).Updates(map[string]any{
				"status_id": status.ID, "updated_at": now,
			}).Error; err != nil {
				return fmt.Errorf("reconcile E2E Tenant Administrator Membership: %w", err)
			}
		}

		actor := authz.AuthzActor{
			ID:          fixture.Stem + "-actor",
			ActorKey:    fixture.ActorKey,
			DisplayName: fixture.ActorKey,
			Active:      true,
			CreatedAt:   now,
			UpdatedAt:   now,
		}
		var existingActor authz.AuthzActor
		actorResult := tx.Where("id = ?", actor.ID).Limit(1).Find(&existingActor)
		if actorResult.Error != nil {
			return fmt.Errorf("find E2E Tenant Administrator Actor: %w", actorResult.Error)
		}
		if actorResult.RowsAffected == 0 {
			if err := tx.Create(&actor).Error; err != nil {
				return fmt.Errorf("ensure E2E Tenant Administrator Actor: %w", err)
			}
		} else {
			if err := tx.Model(&authz.AuthzActor{}).Where("id = ?", actor.ID).Updates(map[string]any{
				"actor_key": actor.ActorKey, "display_name": actor.DisplayName,
				"active": true, "updated_at": now,
			}).Error; err != nil {
				return fmt.Errorf("reconcile E2E Tenant Administrator Actor: %w", err)
			}
		}

		passwordHash, err := bcrypt.GenerateFromPassword([]byte(password), passwordHashCost)
		if err != nil {
			return fmt.Errorf("hash E2E Tenant Administrator password: %w", err)
		}
		account := authentication.Account{
			ID:                 fixture.Stem + "-account",
			Login:              fixture.Login,
			PasswordHash:       string(passwordHash),
			Active:             true,
			MustChangePassword: false,
			PasswordChangedAt:  &now,
			CreatedAt:          now,
			UpdatedAt:          now,
		}
		var existing authentication.Account
		result := tx.Where("id = ?", account.ID).Limit(1).Find(&existing)
		if result.Error != nil {
			return fmt.Errorf("find E2E Tenant Administrator Account: %w", result.Error)
		}
		if result.RowsAffected == 0 {
			if err := tx.Create(&account).Error; err != nil {
				return fmt.Errorf("create E2E Tenant Administrator Account: %w", err)
			}
		} else if err := tx.Model(&authentication.Account{}).Where("id = ?", account.ID).Updates(map[string]any{
			"login": account.Login, "password_hash": account.PasswordHash, "active": true,
			"must_change_password": false, "password_changed_at": now, "updated_at": now,
		}).Error; err != nil {
			return fmt.Errorf("refresh E2E Tenant Administrator Account: %w", err)
		}

		accountPerson := authentication.AccountPerson{AccountID: account.ID, PersonID: person.ID, CreatedAt: now, UpdatedAt: now}
		if err := tx.Where("account_id = ?", account.ID).FirstOrCreate(&accountPerson).Error; err != nil {
			return fmt.Errorf("ensure E2E Tenant Administrator Account/Person binding: %w", err)
		}

		tenantID := fixture.TenantID
		membershipID := membership.ID
		accountActor := authentication.AccountActor{
			AccountID: account.ID, ActorID: actor.ID, ScopeType: authentication.AccountActorScopeTenant,
			TenantID: &tenantID, MembershipID: &membershipID, CreatedAt: now, UpdatedAt: now,
		}
		if err := tx.Where("account_id = ? AND actor_id = ?", account.ID, actor.ID).FirstOrCreate(&accountActor).Error; err != nil {
			return fmt.Errorf("ensure E2E Tenant Administrator Account/Actor binding: %w", err)
		}
		if err := tx.Model(&authentication.AccountActor{}).Where("account_id = ? AND actor_id = ?", account.ID, actor.ID).Updates(map[string]any{
			"scope_type":    authentication.AccountActorScopeTenant,
			"tenant_id":     tenantID,
			"membership_id": membershipID,
			"updated_at":    now,
		}).Error; err != nil {
			return fmt.Errorf("reconcile E2E Tenant Administrator Account/Actor binding: %w", err)
		}

		if err := authz.GrantRole(tx, actor.ID, authz.RoleTenantAdmin, fixture.TenantID); err != nil {
			return fmt.Errorf("grant E2E Tenant Administrator role: %w", err)
		}
		return nil
	})
}

func ensureE2EMultiTenantPerson(ctx context.Context, database *gorm.DB, password string, passwordHashCost int) error {
	if database == nil {
		return fmt.Errorf("provision E2E multi-Tenant Person: database is required")
	}
	password = strings.TrimSpace(password)
	if password == "" {
		return fmt.Errorf("provision E2E multi-Tenant Person: password is required")
	}
	if passwordHashCost < bcrypt.MinCost || passwordHashCost > bcrypt.MaxCost {
		passwordHashCost = bcrypt.DefaultCost
	}

	return database.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		now := time.Now().UTC()
		tenantFixtures := []e2eTenantAdminFixture{
			{TenantID: e2eMultiTenantAID, TenantCode: "E2EMULTIA", TenantName: "E2E Multi Tenant A"},
			{TenantID: e2eMultiTenantBID, TenantCode: "E2EMULTIB", TenantName: "E2E Multi Tenant B"},
		}
		for _, fixture := range tenantFixtures {
			tenant := dbpkg.Tenant{
				BaseModel: dbpkg.BaseModel{ID: fixture.TenantID, CreatedAt: now, UpdatedAt: now},
				Code:      fixture.TenantCode, Name: fixture.TenantName,
				Description: "Deterministic non-Production Tenant for Bite 30L multi-Tenant identity coverage",
				Active:      true,
			}
			if err := tx.Where("id = ?", tenant.ID).FirstOrCreate(&tenant).Error; err != nil {
				return fmt.Errorf("ensure E2E multi-Tenant Tenant %s: %w", tenant.ID, err)
			}
			if err := dbpkg.SeedTenantData(tx, tenant.ID); err != nil {
				return fmt.Errorf("seed E2E multi-Tenant Tenant %s: %w", tenant.ID, err)
			}
		}

		pixKey := "e2e-multi-tenant-person-pix@example.com"
		person := dbpkg.GlobalPerson{
			BaseModel: dbpkg.BaseModel{ID: "e2e-multi-tenant-person", CreatedAt: now, UpdatedAt: now},
			FirstName: "E2E", LastName: "Multi Tenant Person", Nickname: "E2E Multi Tenant Person",
			CPF: "e2e-multi-tenant-person-cpf", RG: "e2e-multi-tenant-person-rg",
			Cellular: "11912345678", Email: e2eMultiTenantPersonLogin,
			Street1: "Rua E2E Multi Tenant 100", State: "SP", City: "Sao Paulo", CEP: "01001000", Country: "Brasil",
			BankName: "Banco E2E", BankNumber: "001", CheckingAccount: "300L4-1", PIXKey: &pixKey,
			EmergencyName: "E2E Emergency Contact", EmergencyCellular: "11987654321", EmergencyEmail: "e2e-multi-tenant-emergency@example.com",
			ProfileCompletionStatus: "COMPLETE", CanCreateCollaborator: true, OperationalActive: true,
		}
		if err := tx.Where("id = ?", person.ID).FirstOrCreate(&person).Error; err != nil {
			return fmt.Errorf("ensure E2E multi-Tenant Global Person: %w", err)
		}
		if err := tx.Model(&dbpkg.GlobalPerson{}).Where("id = ?", person.ID).Updates(map[string]any{
			"first_name": person.FirstName, "last_name": person.LastName, "nickname": person.Nickname,
			"cpf": person.CPF, "rg": person.RG, "cellular": person.Cellular, "email": person.Email,
			"street1": person.Street1, "state": person.State, "city": person.City, "cep": person.CEP, "country": person.Country,
			"bank_name": person.BankName, "bank_number": person.BankNumber, "checking_account": person.CheckingAccount, "pix_key": pixKey,
			"emergency_name": person.EmergencyName, "emergency_cellular": person.EmergencyCellular, "emergency_email": person.EmergencyEmail,
			"profile_completion_status": person.ProfileCompletionStatus, "can_create_collaborator": true, "operational_active": true,
			"updated_at": now,
		}).Error; err != nil {
			return fmt.Errorf("reconcile E2E multi-Tenant Global Person: %w", err)
		}

		passwordHash, err := bcrypt.GenerateFromPassword([]byte(password), passwordHashCost)
		if err != nil {
			return fmt.Errorf("hash E2E multi-Tenant Person password: %w", err)
		}
		account := authentication.Account{
			ID: "e2e-multi-tenant-account", Login: e2eMultiTenantPersonLogin,
			PasswordHash: string(passwordHash), Active: true, MustChangePassword: false,
			PasswordChangedAt: &now, CreatedAt: now, UpdatedAt: now,
		}
		var existingAccount authentication.Account
		result := tx.Where("id = ?", account.ID).Limit(1).Find(&existingAccount)
		if result.Error != nil {
			return fmt.Errorf("find E2E multi-Tenant Account: %w", result.Error)
		}
		if result.RowsAffected == 0 {
			if err := tx.Create(&account).Error; err != nil {
				return fmt.Errorf("create E2E multi-Tenant Account: %w", err)
			}
		} else if err := tx.Model(&authentication.Account{}).Where("id = ?", account.ID).Updates(map[string]any{
			"login": account.Login, "password_hash": account.PasswordHash, "active": true,
			"must_change_password": false, "password_changed_at": now, "updated_at": now,
		}).Error; err != nil {
			return fmt.Errorf("reconcile E2E multi-Tenant Account: %w", err)
		}

		accountPerson := authentication.AccountPerson{AccountID: account.ID, PersonID: person.ID, CreatedAt: now, UpdatedAt: now}
		if err := tx.Where("account_id = ?", account.ID).FirstOrCreate(&accountPerson).Error; err != nil {
			return fmt.Errorf("ensure E2E multi-Tenant Account/Person binding: %w", err)
		}

		for _, tenantID := range []string{e2eMultiTenantAID, e2eMultiTenantBID} {
			var status dbpkg.ReferenceData
			if err := tx.Where("tenant_id = ? AND type = ? AND code = ? AND active = ?", tenantID, "person_status", "ACTIVE", true).First(&status).Error; err != nil {
				return fmt.Errorf("find %s ACTIVE Person status: %w", tenantID, err)
			}
			membershipID := "e2e-multi-tenant-membership-" + tenantID
			membership := dbpkg.PersonTenantMembership{
				BaseModel: dbpkg.BaseModel{ID: membershipID, CreatedAt: now, UpdatedAt: now},
				TenantID:  tenantID, PersonID: person.ID, StatusID: status.ID,
			}
			if err := tx.Where("id = ?", membership.ID).FirstOrCreate(&membership).Error; err != nil {
				return fmt.Errorf("ensure E2E multi-Tenant Membership %s: %w", tenantID, err)
			}
			if err := tx.Model(&dbpkg.PersonTenantMembership{}).Where("id = ?", membership.ID).Updates(map[string]any{
				"status_id": status.ID, "updated_at": now,
			}).Error; err != nil {
				return fmt.Errorf("reconcile E2E multi-Tenant Membership %s: %w", tenantID, err)
			}

			actorID := "e2e-multi-tenant-actor-" + tenantID
			actor := authz.AuthzActor{ID: actorID, ActorKey: actorID, DisplayName: actorID, Active: true, CreatedAt: now, UpdatedAt: now}
			if err := tx.Where("id = ?", actor.ID).FirstOrCreate(&actor).Error; err != nil {
				return fmt.Errorf("ensure E2E multi-Tenant Actor %s: %w", tenantID, err)
			}
			if err := tx.Model(&authz.AuthzActor{}).Where("id = ?", actor.ID).Updates(map[string]any{
				"actor_key": actor.ActorKey, "display_name": actor.DisplayName, "active": true, "updated_at": now,
			}).Error; err != nil {
				return fmt.Errorf("reconcile E2E multi-Tenant Actor %s: %w", tenantID, err)
			}

			tenantIDCopy := tenantID
			membershipIDCopy := membershipID
			binding := authentication.AccountActor{
				AccountID: account.ID, ActorID: actor.ID, ScopeType: authentication.AccountActorScopeTenant,
				TenantID: &tenantIDCopy, MembershipID: &membershipIDCopy, CreatedAt: now, UpdatedAt: now,
			}
			if err := tx.Where("account_id = ? AND actor_id = ?", account.ID, actor.ID).FirstOrCreate(&binding).Error; err != nil {
				return fmt.Errorf("ensure E2E multi-Tenant Account/Actor binding %s: %w", tenantID, err)
			}
			if err := tx.Model(&authentication.AccountActor{}).Where("account_id = ? AND actor_id = ?", account.ID, actor.ID).Updates(map[string]any{
				"scope_type": authentication.AccountActorScopeTenant,
				"tenant_id":  tenantID, "membership_id": membershipID, "updated_at": now,
			}).Error; err != nil {
				return fmt.Errorf("reconcile E2E multi-Tenant Account/Actor binding %s: %w", tenantID, err)
			}
		}
		return nil
	})
}

type e2eBoundPersonFixture struct {
	Stem      string
	Login     string
	FirstName string
	LastName  string
	Nickname  string
	TenantIDs []string
}

type e2eBoundPersonIdentity struct {
	Person      dbpkg.GlobalPerson
	Account     authentication.Account
	Memberships map[string]dbpkg.PersonTenantMembership
	Actors      map[string]authz.AuthzActor
}

const (
	e2eBite32JourneyStem       = "e2e-bite32-journey"
	e2eBite32JourneyLogin      = "e2e-bite32-journey@example.com"
	e2eBite32CurrentJourneyID  = "e2e-bite32-current-journey"
	e2eBite32ClosedJourneyID   = "e2e-bite32-closed-journey"
	e2eBite32RoleStem          = "e2e-bite32-role-person"
	e2eBite32RoleLogin         = "e2e-bite32-role-person@example.com"
	e2eBite32RoleOtherTenantID = "e2e-authz-role-tenant"
)

func ensureE2EBite32JourneyEvidenceFixture(ctx context.Context, database *gorm.DB, password string, passwordHashCost int) error {
	return database.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		identity, err := ensureE2EBoundPerson(tx, e2eBoundPersonFixture{
			Stem: e2eBite32JourneyStem, Login: e2eBite32JourneyLogin,
			FirstName: "E2E", LastName: "Bite 32 Journey", Nickname: "E2E Bite 32 Journey",
			TenantIDs: []string{dbpkg.DefaultTenantID},
		}, password, passwordHashCost)
		if err != nil {
			return fmt.Errorf("ensure Bite 32 Journey Person: %w", err)
		}

		membership := identity.Memberships[dbpkg.DefaultTenantID]
		refs, err := e2eBite32ReferenceIDs(tx, dbpkg.DefaultTenantID)
		if err != nil {
			return err
		}
		now := time.Now().UTC()
		closedAt := time.Date(2026, 6, 15, 18, 0, 0, 0, time.UTC)
		dailyAmount := 280.0
		membershipID := membership.ID

		closedJourney := dbpkg.CollaboratorJourney{
			BaseModel: dbpkg.BaseModel{ID: e2eBite32ClosedJourneyID, CreatedAt: now, UpdatedAt: now},
			TenantID:  dbpkg.DefaultTenantID, MembershipID: &membershipID,
			JourneyStartDate: time.Date(2026, 4, 1, 0, 0, 0, 0, time.UTC),
			DefaultEndDate:   time.Date(2026, 6, 30, 0, 0, 0, 0, time.UTC),
			ProjectedEndDate: time.Date(2026, 6, 30, 0, 0, 0, 0, time.UTC),
			PaymentMethodID:  refs["method/DAILY"], PaymentValue: dailyAmount, DailyBRLAmount: &dailyAmount,
			PlanningAvailability: "ACTIVE", SectorID: refs["sector/MINING"], LocationID: refs["location/MAIN_MINE"], TaskID: refs["task/MINER"],
			StatusID: refs["collaborator_status/FINISHED"], Notes: "Bite 32 release E2E closed Journey", ClosedAt: &closedAt,
		}
		if err := tx.Where("id = ?", closedJourney.ID).FirstOrCreate(&closedJourney).Error; err != nil {
			return fmt.Errorf("ensure Bite 32 closed Journey: %w", err)
		}

		currentAmount := 325.0
		currentJourney := dbpkg.CollaboratorJourney{
			BaseModel: dbpkg.BaseModel{ID: e2eBite32CurrentJourneyID, CreatedAt: now, UpdatedAt: now},
			TenantID:  dbpkg.DefaultTenantID, MembershipID: &membershipID,
			JourneyStartDate: time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC),
			DefaultEndDate:   time.Date(2026, 9, 30, 0, 0, 0, 0, time.UTC),
			ProjectedEndDate: time.Date(2026, 9, 30, 0, 0, 0, 0, time.UTC),
			PaymentMethodID:  refs["method/DAILY"], PaymentValue: currentAmount, DailyBRLAmount: &currentAmount,
			PlanningAvailability: "ACTIVE", SectorID: refs["sector/MINING"], LocationID: refs["location/MAIN_MINE"], TaskID: refs["task/MINER"],
			StatusID: refs["collaborator_status/ACTIVE"], Notes: "Bite 32 release E2E current Journey",
		}
		if err := tx.Where("id = ?", currentJourney.ID).FirstOrCreate(&currentJourney).Error; err != nil {
			return fmt.Errorf("ensure Bite 32 current Journey: %w", err)
		}

		workDate := time.Date(2026, 5, 20, 0, 0, 0, 0, time.UTC)
		period := dbpkg.WorkPeriod{
			BaseModel: dbpkg.BaseModel{ID: "e2e-bite32-work-period", CreatedAt: now, UpdatedAt: now},
			TenantID:  dbpkg.DefaultTenantID, WorkDate: workDate, PeriodCode: "DAY", Name: "Bite 32 E2E day shift",
			StartsAt: workDate.Add(6 * time.Hour), EndsAt: workDate.Add(18 * time.Hour), Status: "FULLY_POSTED",
		}
		if err := tx.Where("id = ?", period.ID).FirstOrCreate(&period).Error; err != nil {
			return fmt.Errorf("ensure Bite 32 Work Period: %w", err)
		}
		worked := "WORKED"
		assignment := dbpkg.WorkPeriodAssignment{
			BaseModel: dbpkg.BaseModel{ID: "e2e-bite32-work-assignment", CreatedAt: now, UpdatedAt: now},
			TenantID:  dbpkg.DefaultTenantID, WorkPeriodID: period.ID, CollaboratorID: closedJourney.ID,
			PlannedStatus: "INCLUDED", PlanningAvailability: "ACTIVE", ActualStatus: &worked,
			SectorID: refs["sector/MINING"], LocationID: refs["location/MAIN_MINE"], TaskID: refs["task/MINER"], Active: true,
		}
		if err := tx.Where("id = ?", assignment.ID).FirstOrCreate(&assignment).Error; err != nil {
			return fmt.Errorf("ensure Bite 32 Work Period assignment: %w", err)
		}
		run := dbpkg.AccrualRun{
			BaseModel: dbpkg.BaseModel{ID: "e2e-bite32-accrual-run", CreatedAt: now, UpdatedAt: now},
			TenantID:  dbpkg.DefaultTenantID, WorkPeriodID: period.ID, Status: "POSTED", AccrualDate: workDate,
			Notes: "Bite 32 release E2E posted daily earning",
		}
		if err := tx.Where("id = ?", run.ID).FirstOrCreate(&run).Error; err != nil {
			return fmt.Errorf("ensure Bite 32 Accrual Run: %w", err)
		}
		assignmentID := assignment.ID
		accrual := dbpkg.AccrualItem{
			BaseModel: dbpkg.BaseModel{ID: "e2e-bite32-accrual-item", CreatedAt: now, UpdatedAt: now},
			TenantID:  dbpkg.DefaultTenantID, PersonID: identity.Person.ID, AccrualRunID: run.ID, WorkPeriodID: period.ID,
			WorkPeriodAssignmentID: &assignmentID, CollaboratorID: closedJourney.ID,
			CalculationType: "DAILY_BRL", Direction: "CREDIT", BRLAmount: &dailyAmount, Status: "POSTED",
			Description: "Bite 32 release E2E daily earning",
		}
		if err := tx.Where("id = ?", accrual.ID).FirstOrCreate(&accrual).Error; err != nil {
			return fmt.Errorf("ensure Bite 32 Accrual Item: %w", err)
		}
		credit := dbpkg.LedgerEntry{
			BaseModel: dbpkg.BaseModel{ID: "e2e-bite32-ledger-credit", CreatedAt: now, UpdatedAt: now},
			TenantID:  dbpkg.DefaultTenantID, PersonID: identity.Person.ID, CollaboratorID: closedJourney.ID,
			ValueUnitID: refs["value_unit/BRL"], EntryType: "EARNING_CREDIT", Direction: "CREDIT", Amount: dailyAmount,
			EffectiveDate: workDate, SourceType: "WORK_PERIOD_ASSIGNMENT", SourceID: assignment.ID,
			Description: "Bite 32 release E2E earning credit", Active: true, CorrectionType: "ORIGINAL",
		}
		if err := tx.Where("id = ?", credit.ID).FirstOrCreate(&credit).Error; err != nil {
			return fmt.Errorf("ensure Bite 32 earning credit: %w", err)
		}
		debit := dbpkg.LedgerEntry{
			BaseModel: dbpkg.BaseModel{ID: "e2e-bite32-ledger-payout", CreatedAt: now.Add(time.Minute), UpdatedAt: now.Add(time.Minute)},
			TenantID:  dbpkg.DefaultTenantID, PersonID: identity.Person.ID, CollaboratorID: closedJourney.ID,
			ValueUnitID: refs["value_unit/BRL"], EntryType: "PAYOUT", Direction: "DEBIT", Amount: dailyAmount,
			EffectiveDate: workDate.AddDate(0, 0, 1), SourceType: "JOURNEY_SETTLEMENT", SourceID: "e2e-bite32-settlement",
			Description: "Bite 32 release E2E Journey payout", Active: true, CorrectionType: "ORIGINAL",
		}
		if err := tx.Where("id = ?", debit.ID).FirstOrCreate(&debit).Error; err != nil {
			return fmt.Errorf("ensure Bite 32 payout posting: %w", err)
		}
		return nil
	})
}

func ensureE2EBite32RoleIsolationFixture(ctx context.Context, database *gorm.DB, password string, passwordHashCost int) error {
	return database.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		identity, err := ensureE2EBoundPerson(tx, e2eBoundPersonFixture{
			Stem: e2eBite32RoleStem, Login: e2eBite32RoleLogin,
			FirstName: "E2E", LastName: "Bite 32 Role Person", Nickname: "E2E Bite 32 Role Person",
			TenantIDs: []string{dbpkg.DefaultTenantID, e2eBite32RoleOtherTenantID},
		}, password, passwordHashCost)
		if err != nil {
			return fmt.Errorf("ensure Bite 32 Role-isolation Person: %w", err)
		}
		for _, tenantID := range []string{dbpkg.DefaultTenantID, e2eBite32RoleOtherTenantID} {
			refs, err := e2eBite32ReferenceIDs(tx, tenantID)
			if err != nil {
				return err
			}
			membership := identity.Memberships[tenantID]
			membershipID := membership.ID
			daily := 100.0
			journey := dbpkg.CollaboratorJourney{
				BaseModel: dbpkg.BaseModel{ID: e2eBite32RoleStem + "-journey-" + tenantID, CreatedAt: time.Now().UTC(), UpdatedAt: time.Now().UTC()},
				TenantID:  tenantID, MembershipID: &membershipID,
				JourneyStartDate: time.Date(2026, 8, 1, 0, 0, 0, 0, time.UTC), DefaultEndDate: time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC), ProjectedEndDate: time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC),
				PaymentMethodID: refs["method/DAILY"], PaymentValue: daily, DailyBRLAmount: &daily, PlanningAvailability: "ACTIVE",
				SectorID: refs["sector/MINING"], LocationID: refs["location/MAIN_MINE"], TaskID: refs["task/MINER"], StatusID: refs["collaborator_status/ACTIVE"],
				Notes: "Bite 32 release E2E baseline Collaborator participation",
			}
			if err := tx.Where("id = ?", journey.ID).FirstOrCreate(&journey).Error; err != nil {
				return fmt.Errorf("ensure Bite 32 Role-isolation Collaborator for %s: %w", tenantID, err)
			}
		}
		return nil
	})
}

func ensureE2EBoundPerson(tx *gorm.DB, fixture e2eBoundPersonFixture, password string, passwordHashCost int) (e2eBoundPersonIdentity, error) {
	if tx == nil {
		return e2eBoundPersonIdentity{}, fmt.Errorf("database is required")
	}
	if passwordHashCost < bcrypt.MinCost || passwordHashCost > bcrypt.MaxCost {
		passwordHashCost = bcrypt.DefaultCost
	}
	passwordHash, err := bcrypt.GenerateFromPassword([]byte(password), passwordHashCost)
	if err != nil {
		return e2eBoundPersonIdentity{}, fmt.Errorf("hash password: %w", err)
	}
	now := time.Now().UTC()
	pixKey := fixture.Stem + "-pix@example.com"
	person := dbpkg.GlobalPerson{
		BaseModel: dbpkg.BaseModel{ID: fixture.Stem + "-person", CreatedAt: now, UpdatedAt: now},
		FirstName: fixture.FirstName, LastName: fixture.LastName, Nickname: fixture.Nickname,
		CPF: fixture.Stem + "-cpf", RG: fixture.Stem + "-rg", Cellular: "11911112222", Email: fixture.Login,
		Street1: "Rua E2E Bite 32", State: "SP", City: "Sao Paulo", CEP: "01001000", Country: "Brasil",
		BankName: "Banco E2E", BankNumber: "001", CheckingAccount: fixture.Stem, PIXKey: &pixKey,
		EmergencyName: "E2E Emergency", EmergencyCellular: "11933334444", EmergencyEmail: fixture.Stem + "-emergency@example.com",
		ProfileCompletionStatus: "COMPLETE", CanCreateCollaborator: true, OperationalActive: true,
	}
	if err := tx.Where("id = ?", person.ID).FirstOrCreate(&person).Error; err != nil {
		return e2eBoundPersonIdentity{}, fmt.Errorf("ensure Global Person: %w", err)
	}
	if err := tx.Model(&dbpkg.GlobalPerson{}).Where("id = ?", person.ID).Updates(map[string]any{
		"first_name": person.FirstName, "last_name": person.LastName, "nickname": person.Nickname,
		"email": person.Email, "profile_completion_status": "COMPLETE", "can_create_collaborator": true, "operational_active": true, "updated_at": now,
	}).Error; err != nil {
		return e2eBoundPersonIdentity{}, fmt.Errorf("reconcile Global Person: %w", err)
	}
	account := authentication.Account{
		ID: fixture.Stem + "-account", Login: fixture.Login, PasswordHash: string(passwordHash), Active: true,
		MustChangePassword: false, PasswordChangedAt: &now, CreatedAt: now, UpdatedAt: now,
	}
	var existingAccount authentication.Account
	result := tx.Where("id = ?", account.ID).Limit(1).Find(&existingAccount)
	if result.Error != nil {
		return e2eBoundPersonIdentity{}, fmt.Errorf("find Account: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		if err := tx.Create(&account).Error; err != nil {
			return e2eBoundPersonIdentity{}, fmt.Errorf("create Account: %w", err)
		}
	} else if err := tx.Model(&authentication.Account{}).Where("id = ?", account.ID).Updates(map[string]any{
		"login": account.Login, "password_hash": account.PasswordHash, "active": true, "must_change_password": false, "password_changed_at": now, "updated_at": now,
	}).Error; err != nil {
		return e2eBoundPersonIdentity{}, fmt.Errorf("reconcile Account: %w", err)
	}
	accountPerson := authentication.AccountPerson{AccountID: account.ID, PersonID: person.ID, CreatedAt: now, UpdatedAt: now}
	if err := tx.Where("account_id = ?", account.ID).FirstOrCreate(&accountPerson).Error; err != nil {
		return e2eBoundPersonIdentity{}, fmt.Errorf("ensure Account/Person binding: %w", err)
	}

	identity := e2eBoundPersonIdentity{Person: person, Account: account, Memberships: map[string]dbpkg.PersonTenantMembership{}, Actors: map[string]authz.AuthzActor{}}
	for _, tenantID := range fixture.TenantIDs {
		var status dbpkg.ReferenceData
		if err := tx.Where("tenant_id = ? AND type = ? AND code = ? AND active = ?", tenantID, "person_status", "ACTIVE", true).First(&status).Error; err != nil {
			return e2eBoundPersonIdentity{}, fmt.Errorf("find %s ACTIVE Person status: %w", tenantID, err)
		}
		membership := dbpkg.PersonTenantMembership{
			BaseModel: dbpkg.BaseModel{ID: fixture.Stem + "-membership-" + tenantID, CreatedAt: now, UpdatedAt: now},
			TenantID:  tenantID, PersonID: person.ID, StatusID: status.ID,
		}
		if err := tx.Where("id = ?", membership.ID).FirstOrCreate(&membership).Error; err != nil {
			return e2eBoundPersonIdentity{}, fmt.Errorf("ensure Membership for %s: %w", tenantID, err)
		}
		if err := tx.Model(&dbpkg.PersonTenantMembership{}).Where("id = ?", membership.ID).Updates(map[string]any{"status_id": status.ID, "updated_at": now}).Error; err != nil {
			return e2eBoundPersonIdentity{}, fmt.Errorf("reconcile Membership for %s: %w", tenantID, err)
		}
		actor := authz.AuthzActor{
			ID: fixture.Stem + "-actor-" + tenantID, ActorKey: fixture.Stem + "-actor-" + tenantID,
			DisplayName: fixture.Nickname + " · " + tenantID, Active: true, CreatedAt: now, UpdatedAt: now,
		}
		if err := tx.Where("id = ?", actor.ID).FirstOrCreate(&actor).Error; err != nil {
			return e2eBoundPersonIdentity{}, fmt.Errorf("ensure Actor for %s: %w", tenantID, err)
		}
		if err := tx.Model(&authz.AuthzActor{}).Where("id = ?", actor.ID).Updates(map[string]any{"actor_key": actor.ActorKey, "display_name": actor.DisplayName, "active": true, "updated_at": now}).Error; err != nil {
			return e2eBoundPersonIdentity{}, fmt.Errorf("reconcile Actor for %s: %w", tenantID, err)
		}
		tenantIDCopy, membershipIDCopy := tenantID, membership.ID
		binding := authentication.AccountActor{
			AccountID: account.ID, ActorID: actor.ID, ScopeType: authentication.AccountActorScopeTenant,
			TenantID: &tenantIDCopy, MembershipID: &membershipIDCopy, CreatedAt: now, UpdatedAt: now,
		}
		if err := tx.Where("account_id = ? AND actor_id = ?", account.ID, actor.ID).FirstOrCreate(&binding).Error; err != nil {
			return e2eBoundPersonIdentity{}, fmt.Errorf("ensure Account/Actor binding for %s: %w", tenantID, err)
		}
		if err := tx.Model(&authentication.AccountActor{}).Where("account_id = ? AND actor_id = ?", account.ID, actor.ID).Updates(map[string]any{
			"scope_type": authentication.AccountActorScopeTenant, "tenant_id": tenantID, "membership_id": membership.ID, "updated_at": now,
		}).Error; err != nil {
			return e2eBoundPersonIdentity{}, fmt.Errorf("reconcile Account/Actor binding for %s: %w", tenantID, err)
		}
		identity.Memberships[tenantID] = membership
		identity.Actors[tenantID] = actor
	}
	return identity, nil
}

func e2eBite32ReferenceIDs(tx *gorm.DB, tenantID string) (map[string]string, error) {
	wanted := [][2]string{
		{"collaborator_status", "ACTIVE"}, {"collaborator_status", "FINISHED"}, {"method", "DAILY"},
		{"sector", "MINING"}, {"location", "MAIN_MINE"}, {"task", "MINER"}, {"value_unit", "BRL"},
	}
	result := make(map[string]string, len(wanted))
	for _, pair := range wanted {
		var row dbpkg.ReferenceData
		if err := tx.Where("tenant_id = ? AND type = ? AND code = ? AND active = ?", tenantID, pair[0], pair[1], true).First(&row).Error; err != nil {
			return nil, fmt.Errorf("find %s %s/%s: %w", tenantID, pair[0], pair[1], err)
		}
		result[pair[0]+"/"+pair[1]] = row.ID
	}
	return result, nil
}
