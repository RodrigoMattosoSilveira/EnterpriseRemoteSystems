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
		ID              string
		ActorKey        string
		DisplayName     string
		Active          bool
		GlobalPersonID  string
		PersonFirstName string
		PersonLastName  string
		PersonNickname  string
		AccountLogin    string
	}
	var actors []candidateActorProjection
	if err := r.database.WithContext(ctx).
		Table("authz_actors a").
		Select(`a.id, a.actor_key, a.display_name, a.active,
			COALESCE(m.person_id, '') AS global_person_id,
			COALESCE(person.first_name, '') AS person_first_name,
			COALESCE(person.last_name, '') AS person_last_name,
			COALESCE(person.nickname, '') AS person_nickname,
			COALESCE(account.login, '') AS account_login`).
		Joins("JOIN auth_account_actors aa ON aa.actor_id = a.id AND aa.scope_type = ? AND aa.tenant_id = ?", "TENANT", tenantID).
		Joins("JOIN person_tenant_memberships m ON m.id = aa.membership_id AND m.tenant_id = aa.tenant_id").
		Joins("JOIN global_people person ON person.id = m.person_id").
		Joins("JOIN auth_user_accounts account ON account.id = aa.account_id").
		Order("LOWER(person.first_name) ASC, LOWER(person.last_name) ASC, LOWER(account.login) ASC, a.actor_key ASC").
		Scan(&actors).Error; err != nil {
		return nil, err
	}

	type delegatedGrantProjection struct {
		ActorID        string
		TenantID       string
		GlobalPersonID string
		RoleCode       string
	}
	var delegatedGrants []delegatedGrantProjection
	grantQuery := r.database.WithContext(ctx).
		Table("authz_actor_role_grants g").
		Select("g.actor_id, g.tenant_id, COALESCE(m.person_id, '') AS global_person_id, role.code AS role_code").
		Joins("JOIN authz_roles role ON role.id = g.role_id AND role.scope_type = ?", string(authz.ActorScopeTenant)).
		Joins("LEFT JOIN auth_account_actors aa ON aa.actor_id = g.actor_id AND aa.scope_type = ? AND aa.tenant_id = g.tenant_id", "TENANT").
		Joins("LEFT JOIN person_tenant_memberships m ON m.id = aa.membership_id AND m.tenant_id = aa.tenant_id").
		Where("g.active = ?", true)
	if err := grantQuery.Scan(&delegatedGrants).Error; err != nil {
		return nil, err
	}

	assigned := make(map[string]struct{})
	personTargetTenantAdminActor := make(map[string]string)
	personHasDelegatedAuthorityOutside := make(map[string]bool)
	targetTenantAdminCount := 0
	for _, grant := range delegatedGrants {
		globalPersonID := strings.TrimSpace(grant.GlobalPersonID)
		if grant.RoleCode == string(authz.RoleTenantAdmin) && grant.TenantID == tenantID {
			assigned[grant.ActorID] = struct{}{}
			targetTenantAdminCount++
			if globalPersonID != "" {
				if _, exists := personTargetTenantAdminActor[globalPersonID]; !exists {
					personTargetTenantAdminActor[globalPersonID] = grant.ActorID
				}
			}
		}
		if globalPersonID != "" && grant.TenantID != tenantID {
			personHasDelegatedAuthorityOutside[globalPersonID] = true
		}
	}

	result := make([]TenantAdminCandidateRecord, 0, len(actors))
	for _, actor := range actors {
		globalPersonID := strings.TrimSpace(actor.GlobalPersonID)
		_, isAssigned := assigned[actor.ID]
		eligible := true
		reason := ""
		hasDelegatedAuthorityOutside := personHasDelegatedAuthorityOutside[globalPersonID]

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
		case hasDelegatedAuthorityOutside:
			eligible = false
			reason = authz.CrossTenantRoleConflictMessage
		case personTargetTenantAdminActor[globalPersonID] != "" && personTargetTenantAdminActor[globalPersonID] != actor.ID:
			eligible = false
			reason = "The other Tenant Administrator slot must belong to a different Person"
		}

		personName := strings.TrimSpace(strings.Join([]string{
			strings.TrimSpace(actor.PersonFirstName),
			strings.TrimSpace(actor.PersonLastName),
		}, " "))

		result = append(result, TenantAdminCandidateRecord{
			ActorID:                            actor.ID,
			ActorKey:                           actor.ActorKey,
			DisplayName:                        actor.DisplayName,
			GlobalPersonID:                     globalPersonID,
			PersonName:                         personName,
			PersonNickname:                     strings.TrimSpace(actor.PersonNickname),
			AccountLogin:                       strings.TrimSpace(actor.AccountLogin),
			Active:                             actor.Active,
			Assigned:                           isAssigned,
			Eligible:                           eligible,
			IneligibilityReason:                reason,
			HasDelegatedAuthorityInOtherTenant: hasDelegatedAuthorityOutside,
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
