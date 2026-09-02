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
	fixtures := []e2eTenantAdminFixture{
		{TenantID: dbpkg.DefaultTenantID, ActorKey: e2eTenantAdminActorKey, Login: e2eTenantAdminLogin, Stem: "e2e-default-tenant-admin"},
		{TenantID: "e2e-authz-admin-tenant", TenantCode: "E2EAUTHZADMIN", TenantName: "E2E Authorization Admin Boundary", ActorKey: "e2e-authz-admin-tenant-admin", Login: "e2e-authz-admin-tenant-admin@example.com", Stem: "e2e-authz-admin-tenant-admin"},
		{TenantID: "e2e-authz-role-tenant", TenantCode: "E2EAUTHZROLE", TenantName: "E2E Authorization Role Boundary", ActorKey: "e2e-authz-role-tenant-admin", Login: "e2e-authz-role-tenant-admin@example.com", Stem: "e2e-authz-role-tenant-admin"},
		{TenantID: "e2e-isolation-tenant", TenantCode: "E2EISOLATION", TenantName: "E2E Operational Isolation", ActorKey: "e2e-isolation-tenant-admin", Login: "e2e-isolation-tenant-admin@example.com", Stem: "e2e-isolation-tenant-admin"},
	}
	for _, fixture := range fixtures {
		if err := ensureE2ETenantAdministrator(ctx, database, fixture, password, passwordHashCost); err != nil {
			return err
		}
	}
	return nil
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

		legacyPerson := dbpkg.Person{
			BaseModel:               dbpkg.BaseModel{ID: fixture.Stem + "-legacy-person", CreatedAt: now, UpdatedAt: now},
			TenantID:                fixture.TenantID,
			FirstName:               person.FirstName,
			LastName:                person.LastName,
			Nickname:                person.Nickname,
			CPF:                     person.CPF,
			RG:                      person.RG,
			Cellular:                person.Cellular,
			Email:                   person.Email,
			Country:                 person.Country,
			ProfileCompletionStatus: "COMPLETE",
			StatusID:                status.ID,
		}
		if err := tx.Where("id = ?", legacyPerson.ID).FirstOrCreate(&legacyPerson).Error; err != nil {
			return fmt.Errorf("ensure E2E Tenant Administrator legacy Person projection: %w", err)
		}

		legacyPersonID := legacyPerson.ID
		membership := dbpkg.PersonTenantMembership{
			BaseModel:      dbpkg.BaseModel{ID: fixture.Stem + "-membership", CreatedAt: now, UpdatedAt: now},
			TenantID:       fixture.TenantID,
			PersonID:       person.ID,
			StatusID:       status.ID,
			LegacyPersonID: &legacyPersonID,
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
			if existingMembership.LegacyPersonID != nil && strings.TrimSpace(*existingMembership.LegacyPersonID) != "" &&
				strings.TrimSpace(*existingMembership.LegacyPersonID) != legacyPerson.ID {
				return fmt.Errorf("E2E Tenant Administrator Membership %s is bound to another legacy Person", membership.ID)
			}
			if err := tx.Model(&dbpkg.PersonTenantMembership{}).Where("id = ?", membership.ID).Updates(map[string]any{
				"legacy_person_id": legacyPerson.ID,
				"status_id":        status.ID,
				"updated_at":       now,
			}).Error; err != nil {
				return fmt.Errorf("reconcile E2E Tenant Administrator Membership: %w", err)
			}
		}

		actor := authz.AuthzActor{
			ID:          fixture.Stem + "-actor",
			ActorKey:    fixture.ActorKey,
			DisplayName: fixture.ActorKey,
			PersonID:    &legacyPersonID,
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
			existingPersonID := ""
			if existingActor.PersonID != nil {
				existingPersonID = strings.TrimSpace(*existingActor.PersonID)
			}
			if existingPersonID != "" && existingPersonID != person.ID && existingPersonID != legacyPerson.ID {
				return fmt.Errorf("E2E Tenant Administrator Actor %s is bound to another legacy Person", actor.ID)
			}
			if err := tx.Model(&authz.AuthzActor{}).Where("id = ?", actor.ID).Updates(map[string]any{
				"actor_key":    actor.ActorKey,
				"display_name": actor.DisplayName,
				"person_id":    legacyPerson.ID,
				"active":       true,
				"updated_at":   now,
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
			ActorID:            actor.ID,
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
			TenantID: &tenantID, MembershipID: &membershipID, Primary: true, CreatedAt: now, UpdatedAt: now,
		}
		if err := tx.Where("account_id = ? AND actor_id = ?", account.ID, actor.ID).FirstOrCreate(&accountActor).Error; err != nil {
			return fmt.Errorf("ensure E2E Tenant Administrator Account/Actor binding: %w", err)
		}

		if err := authz.GrantRole(tx, actor.ID, authz.RoleTenantAdmin, fixture.TenantID); err != nil {
			return fmt.Errorf("grant E2E Tenant Administrator role: %w", err)
		}
		return nil
	})
}
