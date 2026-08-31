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
		assignmentCount, err := r.countActiveTenantAdminAssignments(ctx, row.ID)
		if err != nil {
			return nil, err
		}
		result = append(result, TenantRecord{Tenant: row, TenantAdminCount: count, TenantAdminAssignmentCount: assignmentCount})
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
	assignmentCount, err := r.countActiveTenantAdminAssignments(ctx, tenant.ID)
	if err != nil {
		return nil, err
	}
	return &TenantRecord{Tenant: tenant, TenantAdminCount: count, TenantAdminAssignmentCount: assignmentCount}, nil
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
	tenantID = strings.TrimSpace(tenantID)
	if exists, err := r.ExistsByID(ctx, tenantID); err != nil {
		return nil, err
	} else if !exists {
		return nil, gorm.ErrRecordNotFound
	}

	type candidateActorProjection struct {
		ID             string
		ActorKey       string
		DisplayName    string
		Active         bool
		GlobalPersonID string
	}
	var actors []candidateActorProjection
	hasPersonFoundation := r.database.Migrator().HasTable("auth_account_actors") && r.database.Migrator().HasTable("person_tenant_memberships")
	if hasPersonFoundation {
		if err := r.database.WithContext(ctx).
			Table("authz_actors a").
			Select("a.id, a.actor_key, a.display_name, a.active, COALESCE(m.person_id, '') AS global_person_id").
			Joins("JOIN auth_account_actors aa ON aa.actor_id = a.id AND aa.scope_type = ? AND aa.tenant_id = ?", "TENANT", tenantID).
			Joins("LEFT JOIN person_tenant_memberships m ON m.id = aa.membership_id AND m.tenant_id = aa.tenant_id").
			Order("a.actor_key ASC").
			Scan(&actors).Error; err != nil {
			return nil, err
		}
	} else {
		// Compatibility for isolated pre-Bite-30 repository tests. Production
		// Tenant Administrator candidates use the canonical Membership Person.
		if err := r.database.WithContext(ctx).
			Table("authz_actors a").
			Select("a.id, a.actor_key, a.display_name, a.active, COALESCE(a.person_id, '') AS global_person_id").
			Order("a.actor_key ASC").
			Scan(&actors).Error; err != nil {
			return nil, err
		}
	}

	type adminGrantProjection struct {
		ActorID        string
		TenantID       string
		GlobalPersonID string
	}
	var adminGrants []adminGrantProjection
	grantQuery := r.database.WithContext(ctx).
		Table("authz_actor_role_grants g").
		Joins("JOIN authz_roles role ON role.id = g.role_id AND role.code = ?", string(authz.RoleTenantAdmin)).
		Where("g.active = ?", true)
	if hasPersonFoundation {
		grantQuery = grantQuery.
			Select("g.actor_id, g.tenant_id, COALESCE(m.person_id, '') AS global_person_id").
			Joins("LEFT JOIN auth_account_actors aa ON aa.actor_id = g.actor_id AND aa.scope_type = ? AND aa.tenant_id = g.tenant_id", "TENANT").
			Joins("LEFT JOIN person_tenant_memberships m ON m.id = aa.membership_id AND m.tenant_id = aa.tenant_id")
	} else {
		grantQuery = grantQuery.
			Select("g.actor_id, g.tenant_id, COALESCE(a.person_id, '') AS global_person_id").
			Joins("JOIN authz_actors a ON a.id = g.actor_id")
	}
	if err := grantQuery.Scan(&adminGrants).Error; err != nil {
		return nil, err
	}

	assigned := make(map[string]struct{})
	personAdminTenant := make(map[string]string)
	personAdminActor := make(map[string]string)
	targetTenantAdminCount := 0
	for _, grant := range adminGrants {
		globalPersonID := strings.TrimSpace(grant.GlobalPersonID)
		if grant.TenantID == tenantID {
			assigned[grant.ActorID] = struct{}{}
			targetTenantAdminCount++
		}
		if globalPersonID == "" {
			continue
		}
		if _, exists := personAdminTenant[globalPersonID]; !exists {
			personAdminTenant[globalPersonID] = grant.TenantID
			personAdminActor[globalPersonID] = grant.ActorID
		}
	}

	result := make([]TenantAdminCandidateRecord, 0, len(actors))
	for _, actor := range actors {
		globalPersonID := strings.TrimSpace(actor.GlobalPersonID)
		_, isAssigned := assigned[actor.ID]
		eligible := true
		reason := ""
		adminTenantID := ""

		switch {
		case isAssigned:
			// The current assignment remains visible even when its Actor is inactive.
			// Actor deactivation never frees a Tenant Administrator slot.
		case !actor.Active:
			eligible = false
			reason = "Inactive actors cannot be assigned as Tenant Administrators"
		case globalPersonID == "":
			eligible = false
			reason = "Tenant Administrator authority requires a tenant Actor bound to a canonical Person Membership"
		case targetTenantAdminCount >= 2:
			eligible = false
			reason = "Tenant already has the maximum of two active Tenant Administrators"
		case personAdminTenant[globalPersonID] != "" && personAdminTenant[globalPersonID] != tenantID:
			eligible = false
			adminTenantID = personAdminTenant[globalPersonID]
			reason = fmt.Sprintf("This Person already administers tenant %s", adminTenantID)
		case personAdminTenant[globalPersonID] == tenantID && personAdminActor[globalPersonID] != actor.ID:
			eligible = false
			adminTenantID = tenantID
			reason = "The other Tenant Administrator slot must belong to a different Person"
		}

		result = append(result, TenantAdminCandidateRecord{
			ActorID:             actor.ID,
			ActorKey:            actor.ActorKey,
			DisplayName:         actor.DisplayName,
			GlobalPersonID:      globalPersonID,
			Active:              actor.Active,
			Assigned:            isAssigned,
			Eligible:            eligible,
			IneligibilityReason: reason,
			TenantAdminTenantID: adminTenantID,
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

func (r *gormRepository) countActiveTenantAdminAssignments(ctx context.Context, tenantID string) (int64, error) {
	var count int64
	err := r.database.WithContext(ctx).
		Model(&authz.AuthzActorRoleGrant{}).
		Joins("JOIN authz_roles ON authz_roles.id = authz_actor_role_grants.role_id AND authz_roles.active = ?", true).
		Where("authz_actor_role_grants.tenant_id = ? AND authz_actor_role_grants.active = ? AND authz_roles.code = ?", strings.TrimSpace(tenantID), true, string(authz.RoleTenantAdmin)).
		Distinct("authz_actor_role_grants.actor_id").
		Count(&count).Error
	if err != nil {
		return 0, fmt.Errorf("count Tenant Administrator assignments: %w", err)
	}
	return count, nil
}
