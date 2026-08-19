package tenants

import (
	"context"
	"fmt"
	"strings"
	"time"

	"enterpriseremotesystems/backend/internal/authz"
	"enterpriseremotesystems/backend/internal/db"
	"enterpriseremotesystems/backend/internal/shared/ids"
	"gorm.io/gorm"
)

type gormRepository struct{ database *gorm.DB }

func NewRepository(database *gorm.DB) Repository { return &gormRepository{database: database} }

func (r *gormRepository) List(ctx context.Context) ([]TenantRecord, error) {
	var rows []db.Tenant
	if err := r.database.WithContext(ctx).Order("code ASC").Find(&rows).Error; err != nil {
		return nil, err
	}

	result := make([]TenantRecord, 0, len(rows))
	for _, row := range rows {
		count, err := r.countActiveTenantAdmins(ctx, row.ID)
		if err != nil {
			return nil, err
		}
		result = append(result, TenantRecord{Tenant: row, TenantAdminCount: count})
	}
	return result, nil
}

func (r *gormRepository) FindByID(ctx context.Context, id string) (*TenantRecord, error) {
	var tenant db.Tenant
	if err := r.database.WithContext(ctx).First(&tenant, "id = ?", strings.TrimSpace(id)).Error; err != nil {
		return nil, err
	}
	count, err := r.countActiveTenantAdmins(ctx, tenant.ID)
	if err != nil {
		return nil, err
	}
	return &TenantRecord{Tenant: tenant, TenantAdminCount: count}, nil
}

func (r *gormRepository) CodeExists(ctx context.Context, code string, excludeID string) (bool, error) {
	query := r.database.WithContext(ctx).Model(&db.Tenant{}).Where("UPPER(code) = ?", strings.ToUpper(strings.TrimSpace(code)))
	if strings.TrimSpace(excludeID) != "" {
		query = query.Where("id <> ?", strings.TrimSpace(excludeID))
	}
	var count int64
	if err := query.Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}

func (r *gormRepository) Create(ctx context.Context, tenant *db.Tenant) error {
	return r.database.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(tenant).Error; err != nil {
			return err
		}
		if err := db.SeedTenantData(tx, tenant.ID); err != nil {
			return fmt.Errorf("provision tenant seed data: %w", err)
		}
		return nil
	})
}

func (r *gormRepository) Update(ctx context.Context, tenant *db.Tenant) error {
	return r.database.WithContext(ctx).
		Model(&db.Tenant{}).
		Where("id = ?", tenant.ID).
		Updates(map[string]any{
			"code":        tenant.Code,
			"name":        tenant.Name,
			"description": tenant.Description,
			"updated_at":  tenant.UpdatedAt,
		}).Error
}

func (r *gormRepository) SetActive(ctx context.Context, tenantID string, active bool) error {
	result := r.database.WithContext(ctx).
		Model(&db.Tenant{}).
		Where("id = ?", strings.TrimSpace(tenantID)).
		Updates(map[string]any{"active": active, "updated_at": time.Now().UTC()})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func (r *gormRepository) ExistsByID(ctx context.Context, id string) (bool, error) {
	var count int64
	err := r.database.WithContext(ctx).
		Model(&db.Tenant{}).
		Where("id = ?", strings.TrimSpace(id)).
		Count(&count).Error
	return count > 0, err
}

func (r *gormRepository) ExistsActiveByID(ctx context.Context, id string) (bool, error) {
	var count int64
	err := r.database.WithContext(ctx).
		Model(&db.Tenant{}).
		Where("id = ? AND active = ?", strings.TrimSpace(id), true).
		Count(&count).Error
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

func (r *gormRepository) ListTenantAdminCandidates(ctx context.Context, tenantID string) ([]TenantAdminCandidateRecord, error) {
	if exists, err := r.ExistsByID(ctx, tenantID); err != nil {
		return nil, err
	} else if !exists {
		return nil, gorm.ErrRecordNotFound
	}

	var actors []authz.AuthzActor
	actorQuery := r.database.WithContext(ctx).Model(&authz.AuthzActor{})
	if r.database.Migrator().HasTable("auth_account_actors") {
		actorQuery = actorQuery.
			Joins("JOIN auth_account_actors aa ON aa.actor_id = authz_actors.id AND aa.scope_type = ? AND aa.tenant_id = ?", "TENANT", strings.TrimSpace(tenantID))
	}
	if err := actorQuery.Order("authz_actors.actor_key ASC").Find(&actors).Error; err != nil {
		return nil, err
	}

	var role authz.AuthzRole
	if err := r.database.WithContext(ctx).Where("code = ?", string(authz.RoleTenantAdmin)).First(&role).Error; err != nil {
		return nil, err
	}

	var grants []authz.AuthzActorRoleGrant
	if err := r.database.WithContext(ctx).
		Where("role_id = ? AND tenant_id = ? AND active = ?", role.ID, strings.TrimSpace(tenantID), true).
		Find(&grants).Error; err != nil {
		return nil, err
	}
	assigned := make(map[string]struct{}, len(grants))
	for _, grant := range grants {
		assigned[grant.ActorID] = struct{}{}
	}

	result := make([]TenantAdminCandidateRecord, 0, len(actors))
	for _, actor := range actors {
		_, isAssigned := assigned[actor.ID]
		result = append(result, TenantAdminCandidateRecord{
			ActorID:     actor.ID,
			ActorKey:    actor.ActorKey,
			DisplayName: actor.DisplayName,
			Active:      actor.Active,
			Assigned:    isAssigned,
		})
	}
	return result, nil
}

func (r *gormRepository) AssignTenantAdmin(ctx context.Context, tenantID string, actorID string) error {
	return r.database.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var tenant db.Tenant
		if err := tx.First(&tenant, "id = ?", strings.TrimSpace(tenantID)).Error; err != nil {
			return err
		}

		var actor authz.AuthzActor
		if err := tx.First(&actor, "id = ?", strings.TrimSpace(actorID)).Error; err != nil {
			return err
		}
		if !actor.Active {
			return ValidationError{Fields: map[string]string{"actorId": "Tenant administrators must be active actors"}}
		}

		var role authz.AuthzRole
		if err := tx.Where("code = ? AND active = ?", string(authz.RoleTenantAdmin), true).First(&role).Error; err != nil {
			return err
		}
		if err := authz.ValidateDelegatedRoleGrant(tx, actor.ID, role, tenant.ID, true); err != nil {
			return err
		}

		var grant authz.AuthzActorRoleGrant
		result := tx.Where("actor_id = ? AND role_id = ? AND tenant_id = ?", actor.ID, role.ID, tenant.ID).Find(&grant)
		if result.Error != nil {
			return result.Error
		}
		now := time.Now().UTC()
		if result.RowsAffected == 0 {
			grant = authz.AuthzActorRoleGrant{
				ID:        ids.New(),
				ActorID:   actor.ID,
				RoleID:    role.ID,
				TenantID:  tenant.ID,
				Active:    true,
				CreatedAt: now,
				UpdatedAt: now,
			}
			if err := tx.Create(&grant).Error; err != nil {
				return fmt.Errorf("assign tenant administrator: %w", err)
			}
			return nil
		}
		if grant.Active {
			return nil
		}
		grant.Active = true
		grant.UpdatedAt = now
		return tx.Save(&grant).Error
	})
}

func (r *gormRepository) RevokeTenantAdmin(ctx context.Context, tenantID string, actorID string) error {
	var role authz.AuthzRole
	if err := r.database.WithContext(ctx).Where("code = ?", string(authz.RoleTenantAdmin)).First(&role).Error; err != nil {
		return err
	}
	result := r.database.WithContext(ctx).
		Model(&authz.AuthzActorRoleGrant{}).
		Where("actor_id = ? AND role_id = ? AND tenant_id = ? AND active = ?", strings.TrimSpace(actorID), role.ID, strings.TrimSpace(tenantID), true).
		Updates(map[string]any{"active": false, "updated_at": time.Now().UTC()})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func (r *gormRepository) countActiveTenantAdmins(ctx context.Context, tenantID string) (int64, error) {
	var count int64
	err := r.database.WithContext(ctx).
		Model(&authz.AuthzActorRoleGrant{}).
		Joins("JOIN authz_roles ON authz_roles.id = authz_actor_role_grants.role_id AND authz_roles.active = ?", true).
		Joins("JOIN authz_actors ON authz_actors.id = authz_actor_role_grants.actor_id AND authz_actors.active = ?", true).
		Where("authz_actor_role_grants.tenant_id = ? AND authz_actor_role_grants.active = ? AND authz_roles.code = ?", strings.TrimSpace(tenantID), true, string(authz.RoleTenantAdmin)).
		Distinct("authz_actor_role_grants.actor_id").
		Count(&count).Error
	if err != nil {
		return 0, fmt.Errorf("count tenant administrators: %w", err)
	}
	return count, nil
}
