package authz

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"enterpriseremotesystems/backend/internal/shared/ids"
	"gorm.io/gorm"
)

type BootstrapConfig struct {
	Enabled                bool
	ActorKey               string
	DisplayName            string
	RoleCode               RoleCode
	TenantID               string
	RequireEmptyActorTable bool
}

func (c BootstrapConfig) normalized() (BootstrapConfig, error) {
	c.ActorKey = strings.TrimSpace(c.ActorKey)
	c.DisplayName = strings.TrimSpace(c.DisplayName)
	c.RoleCode = RoleCode(strings.TrimSpace(string(c.RoleCode)))
	c.TenantID = strings.TrimSpace(c.TenantID)
	if !c.Enabled {
		return c, nil
	}
	if c.ActorKey == "" {
		return c, NewValidationError(map[string]string{"actorKey": "Bootstrap actor key is required when authorization bootstrap is enabled"})
	}
	if c.DisplayName == "" {
		c.DisplayName = c.ActorKey
	}
	if c.RoleCode == "" {
		c.RoleCode = RoleApplicationAdmin
	}
	if c.TenantID == "" {
		c.TenantID = GlobalTenantScope
	}
	return c, nil
}

type BootstrapResult struct {
	Enabled      bool
	ActorID      string
	ActorKey     string
	RoleCode     string
	TenantID     string
	ActorCreated bool
	GrantCreated bool
}

func EnsureBootstrapActor(ctx context.Context, database *gorm.DB, cfg BootstrapConfig) (BootstrapResult, error) {
	cfg, err := cfg.normalized()
	if err != nil {
		return BootstrapResult{}, err
	}
	result := BootstrapResult{Enabled: cfg.Enabled}
	if !cfg.Enabled {
		return result, nil
	}
	if database == nil {
		return BootstrapResult{}, ErrMissingActor
	}

	err = database.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if cfg.RequireEmptyActorTable {
			var actorCount int64
			if err := tx.Model(&AuthzActor{}).Count(&actorCount).Error; err != nil {
				return fmt.Errorf("count authorization actors for bootstrap: %w", err)
			}
			if actorCount > 0 {
				var existing AuthzActor
				if err := tx.Where("actor_key = ?", cfg.ActorKey).First(&existing).Error; err != nil {
					return fmt.Errorf("authorization bootstrap requires an empty actor table")
				}
			}
		}

		now := time.Now().UTC()
		var actor AuthzActor
		if err := tx.Where("actor_key = ?", cfg.ActorKey).First(&actor).Error; err != nil {
			if !errors.Is(err, gorm.ErrRecordNotFound) {
				return fmt.Errorf("find bootstrap authorization actor: %w", err)
			}
			actor = AuthzActor{ID: ids.New(), ActorKey: cfg.ActorKey, DisplayName: cfg.DisplayName, Active: true, CreatedAt: now, UpdatedAt: now}
			if err := tx.Create(&actor).Error; err != nil {
				return fmt.Errorf("create bootstrap authorization actor: %w", err)
			}
			result.ActorCreated = true
		} else {
			changed := false
			if actor.DisplayName != cfg.DisplayName {
				actor.DisplayName = cfg.DisplayName
				changed = true
			}
			if !actor.Active {
				actor.Active = true
				changed = true
			}
			if changed {
				actor.UpdatedAt = now
				if err := tx.Save(&actor).Error; err != nil {
					return fmt.Errorf("update bootstrap authorization actor: %w", err)
				}
			}
		}

		var role AuthzRole
		if err := tx.Where("code = ? AND active = ?", string(cfg.RoleCode), true).First(&role).Error; err != nil {
			return fmt.Errorf("find bootstrap authorization role %s: %w", cfg.RoleCode, err)
		}

		var grant AuthzActorRoleGrant
		if err := tx.Where("actor_id = ? AND role_id = ? AND tenant_id = ?", actor.ID, role.ID, cfg.TenantID).First(&grant).Error; err != nil {
			if !errors.Is(err, gorm.ErrRecordNotFound) {
				return fmt.Errorf("find bootstrap authorization role grant: %w", err)
			}
			grant = AuthzActorRoleGrant{ID: ids.New(), ActorID: actor.ID, RoleID: role.ID, TenantID: cfg.TenantID, Active: true, CreatedAt: now, UpdatedAt: now}
			if err := tx.Create(&grant).Error; err != nil {
				return fmt.Errorf("create bootstrap authorization role grant: %w", err)
			}
			result.GrantCreated = true
		} else if !grant.Active {
			grant.Active = true
			grant.UpdatedAt = now
			if err := tx.Save(&grant).Error; err != nil {
				return fmt.Errorf("reactivate bootstrap authorization role grant: %w", err)
			}
		}

		result.ActorID = actor.ID
		result.ActorKey = actor.ActorKey
		result.RoleCode = role.Code
		result.TenantID = grant.TenantID
		return nil
	})
	if err != nil {
		return BootstrapResult{}, err
	}
	return result, nil
}
