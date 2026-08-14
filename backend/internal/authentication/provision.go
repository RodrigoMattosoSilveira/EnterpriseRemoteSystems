package authentication

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"enterpriseremotesystems/backend/internal/authz"
	"enterpriseremotesystems/backend/internal/shared/ids"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type ProvisionApplicationAdminConfig struct {
	ActorKey         string
	DisplayName      string
	Login            string
	Password         string
	PasswordHashCost int
}

type ProvisionApplicationAdminResult struct {
	ActorID                  string
	ActorKey                 string
	AccountID                string
	Login                    string
	ActorCreated             bool
	GrantCreated             bool
	AccountCreated           bool
	AccountReactivated       bool
	AuthorizationReactivated bool
	LoginUpdated             bool
	PasswordUpdated          bool
}

func ProvisionApplicationAdmin(ctx context.Context, database *gorm.DB, cfg ProvisionApplicationAdminConfig) (ProvisionApplicationAdminResult, error) {
	if database == nil {
		return ProvisionApplicationAdminResult{}, fmt.Errorf("provision application administrator: database is required")
	}

	cfg.ActorKey = strings.TrimSpace(cfg.ActorKey)
	cfg.DisplayName = strings.TrimSpace(cfg.DisplayName)
	cfg.Login = normalizeLogin(cfg.Login)
	if cfg.ActorKey == "" {
		return ProvisionApplicationAdminResult{}, &ValidationError{Fields: map[string]string{"actorKey": "Authorization actor key is required"}}
	}
	if cfg.DisplayName == "" {
		cfg.DisplayName = cfg.ActorKey
	}
	if cfg.Login == "" {
		return ProvisionApplicationAdminResult{}, &ValidationError{Fields: map[string]string{"login": "Login is required"}}
	}
	if utf8.RuneCountInString(cfg.Login) > maximumLoginLength {
		return ProvisionApplicationAdminResult{}, &ValidationError{Fields: map[string]string{"login": "Login must be 254 characters or fewer"}}
	}
	if err := validatePasswordValue(cfg.Password, "password"); err != nil {
		return ProvisionApplicationAdminResult{}, err
	}
	if cfg.PasswordHashCost < bcrypt.MinCost || cfg.PasswordHashCost > bcrypt.MaxCost {
		cfg.PasswordHashCost = bcrypt.DefaultCost
	}

	var result ProvisionApplicationAdminResult
	err := database.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var existingLogin Account
		loginLookup := tx.Where("login = ? COLLATE NOCASE", cfg.Login).Limit(1).Find(&existingLogin)
		if loginLookup.Error != nil {
			return fmt.Errorf("find existing administrator login: %w", loginLookup.Error)
		}
		if loginLookup.RowsAffected > 0 {
			var linkedActor authz.AuthzActor
			if err := tx.First(&linkedActor, "id = ?", existingLogin.ActorID).Error; err != nil {
				return fmt.Errorf("find authorization actor linked to administrator login: %w", err)
			}
			if linkedActor.ActorKey != cfg.ActorKey {
				return fmt.Errorf("provision application administrator: login %q is already linked to actor %q", cfg.Login, linkedActor.ActorKey)
			}
		}

		authorizationReactivated := false
		var existingActor authz.AuthzActor
		actorStateLookup := tx.Where("actor_key = ?", cfg.ActorKey).Limit(1).Find(&existingActor)
		if actorStateLookup.Error != nil {
			return fmt.Errorf("find existing administrator actor state: %w", actorStateLookup.Error)
		}
		if actorStateLookup.RowsAffected > 0 && !existingActor.Active {
			authorizationReactivated = true
		}

		var existingRole authz.AuthzRole
		roleStateLookup := tx.Where("code = ?", string(authz.RoleApplicationAdmin)).Limit(1).Find(&existingRole)
		if roleStateLookup.Error != nil {
			return fmt.Errorf("find application administrator role state: %w", roleStateLookup.Error)
		}
		if roleStateLookup.RowsAffected > 0 && !existingRole.Active {
			authorizationReactivated = true
		}

		if actorStateLookup.RowsAffected > 0 && roleStateLookup.RowsAffected > 0 {
			var existingGrant authz.AuthzActorRoleGrant
			grantStateLookup := tx.Where(
				"actor_id = ? AND role_id = ? AND tenant_id = ?",
				existingActor.ID,
				existingRole.ID,
				authz.GlobalTenantScope,
			).Limit(1).Find(&existingGrant)
			if grantStateLookup.Error != nil {
				return fmt.Errorf("find application administrator grant state: %w", grantStateLookup.Error)
			}
			if grantStateLookup.RowsAffected > 0 && !existingGrant.Active {
				authorizationReactivated = true
			}
		}

		if err := authz.SeedAuthorizationCatalog(tx); err != nil {
			return fmt.Errorf("seed authorization catalog: %w", err)
		}
		if err := tx.Model(&authz.AuthzRole{}).Where("code = ?", string(authz.RoleApplicationAdmin)).Updates(map[string]any{
			"active":     true,
			"scope_type": string(authz.ActorScopeApplication),
			"updated_at": time.Now().UTC(),
		}).Error; err != nil {
			return fmt.Errorf("reactivate application administrator role: %w", err)
		}

		bootstrap, err := authz.EnsureBootstrapActor(ctx, tx, authz.BootstrapConfig{
			Enabled:                true,
			ActorKey:               cfg.ActorKey,
			DisplayName:            cfg.DisplayName,
			RoleCode:               authz.RoleApplicationAdmin,
			TenantID:               authz.GlobalTenantScope,
			RequireEmptyActorTable: false,
		})
		if err != nil {
			return fmt.Errorf("ensure application administrator actor: %w", err)
		}
		if err := tx.Model(&authz.AuthzActor{}).Where("id = ?", bootstrap.ActorID).Updates(map[string]any{
			"person_id": nil, "collaborator_id": nil, "updated_at": time.Now().UTC(),
		}).Error; err != nil {
			return fmt.Errorf("clear tenant identity from application administrator actor: %w", err)
		}

		result = ProvisionApplicationAdminResult{
			ActorID:                  bootstrap.ActorID,
			ActorKey:                 bootstrap.ActorKey,
			Login:                    cfg.Login,
			ActorCreated:             bootstrap.ActorCreated,
			GrantCreated:             bootstrap.GrantCreated,
			AuthorizationReactivated: authorizationReactivated,
		}

		var actorAccount Account
		actorLookup := tx.Where("actor_id = ?", bootstrap.ActorID).Limit(1).Find(&actorAccount)
		if actorLookup.Error != nil {
			return fmt.Errorf("find authentication account for actor: %w", actorLookup.Error)
		}

		var loginAccount Account
		loginLookup = tx.Where("login = ? COLLATE NOCASE", cfg.Login).Limit(1).Find(&loginAccount)
		if loginLookup.Error != nil {
			return fmt.Errorf("find authentication account by login: %w", loginLookup.Error)
		}
		if actorLookup.RowsAffected == 0 && loginLookup.RowsAffected > 0 {
			return fmt.Errorf("provision application administrator: login %q is already linked to another authorization actor", cfg.Login)
		}
		if actorLookup.RowsAffected > 0 && loginLookup.RowsAffected > 0 && actorAccount.ID != loginAccount.ID {
			return fmt.Errorf("provision application administrator: login %q is already linked to another authorization actor", cfg.Login)
		}

		now := time.Now().UTC()
		if actorLookup.RowsAffected == 0 {
			passwordHash, err := bcrypt.GenerateFromPassword([]byte(cfg.Password), cfg.PasswordHashCost)
			if err != nil {
				return fmt.Errorf("hash administrator password: %w", err)
			}
			account := Account{
				ID:                 ids.New(),
				ActorID:            bootstrap.ActorID,
				Login:              cfg.Login,
				PasswordHash:       string(passwordHash),
				Active:             true,
				MustChangePassword: false,
				PasswordChangedAt:  &now,
				CreatedAt:          now,
				UpdatedAt:          now,
			}
			if err := tx.Create(&account).Error; err != nil {
				return fmt.Errorf("create administrator authentication account: %w", err)
			}
			if err := ensureAccountActorFoundation(tx, account); err != nil {
				return err
			}
			result.AccountID = account.ID
			result.AccountCreated = true
			result.PasswordUpdated = true
			return nil
		}

		result.AccountID = actorAccount.ID
		updates := map[string]any{}
		if actorAccount.Login != cfg.Login {
			updates["login"] = cfg.Login
			result.LoginUpdated = true
		}
		if !actorAccount.Active {
			updates["active"] = true
			result.AccountReactivated = true
		}
		if actorAccount.MustChangePassword {
			updates["must_change_password"] = false
		}
		if bcrypt.CompareHashAndPassword([]byte(actorAccount.PasswordHash), []byte(cfg.Password)) != nil {
			passwordHash, err := bcrypt.GenerateFromPassword([]byte(cfg.Password), cfg.PasswordHashCost)
			if err != nil {
				return fmt.Errorf("hash administrator password: %w", err)
			}
			updates["password_hash"] = string(passwordHash)
			updates["password_changed_at"] = now
			result.PasswordUpdated = true
		}

		if len(updates) > 0 {
			updates["updated_at"] = now
			updateResult := tx.Model(&Account{}).Where("id = ?", actorAccount.ID).Updates(updates)
			if updateResult.Error != nil {
				return fmt.Errorf("update administrator authentication account: %w", updateResult.Error)
			}
			if updateResult.RowsAffected == 0 {
				return gorm.ErrRecordNotFound
			}
		}

		if err := ensureAccountActorFoundation(tx, actorAccount); err != nil {
			return err
		}

		if result.PasswordUpdated || result.AccountReactivated || result.AuthorizationReactivated || result.LoginUpdated {
			if err := revokeSessions(tx, actorAccount.ID, now); err != nil {
				return err
			}
			if err := invalidatePasswordResetTokens(tx, actorAccount.ID, now); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ProvisionApplicationAdminResult{}, fmt.Errorf("provision application administrator: authentication account disappeared during update")
		}
		return ProvisionApplicationAdminResult{}, err
	}

	return result, nil
}
