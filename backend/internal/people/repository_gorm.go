package people

import (
	"context"
	"errors"
	"strings"
	"time"

	"enterpriseremotesystems/backend/internal/db"
	"enterpriseremotesystems/backend/internal/shared/ids"
	"gorm.io/gorm"
)

type gormRepository struct {
	db *gorm.DB
}

func NewRepository(database *gorm.DB) Repository {
	return &gormRepository{db: database}
}

func (r *gormRepository) List(
	ctx context.Context,
	tenantID string,
	filter PersonListFilter,
) ([]db.Person, int64, error) {
	var rows []db.Person
	var total int64

	q := r.db.WithContext(ctx).
		Model(&db.Person{}).
		Joins(`LEFT JOIN person_tenant_memberships ptm
			ON ptm.legacy_person_id = people.id AND ptm.tenant_id = people.tenant_id`).
		Joins(`LEFT JOIN global_people gp ON gp.id = ptm.person_id`).
		Where("people.tenant_id = ?", tenantID).
		Preload("Status")

	if filter.Search != "" {
		like := "%" + filter.Search + "%"
		condition := `(COALESCE(gp.first_name, people.first_name) LIKE ?
			OR COALESCE(gp.last_name, people.last_name) LIKE ?
			OR TRIM(COALESCE(gp.first_name, people.first_name) || ' ' || COALESCE(gp.last_name, people.last_name)) LIKE ?
			OR COALESCE(gp.nickname, people.nickname) LIKE ?
			OR COALESCE(gp.cpf, people.cpf) LIKE ?
			OR COALESCE(gp.rg, people.rg) LIKE ?
			OR COALESCE(gp.cellular, people.cellular) LIKE ?
			OR COALESCE(gp.email, people.email) LIKE ?`
		args := []any{like, like, like, like, like, like, like, like}

		// Tenant Administrators often know a Person by Authentication login or
		// Actor label rather than by the Person profile. Include those identity
		// aliases without requiring the Actor to be active. Scope Actor matching
		// to this same tenant so authorization identity from another tenant never
		// makes a Person appear in the current tenant directory.
		if r.db.Migrator().HasTable("auth_account_people") &&
			r.db.Migrator().HasTable("auth_user_accounts") &&
			r.db.Migrator().HasTable("auth_account_actors") &&
			r.db.Migrator().HasTable("authz_actors") {
			condition += `
			OR EXISTS (
				SELECT 1
				FROM auth_account_people ap
				JOIN auth_user_accounts account ON account.id = ap.account_id
				LEFT JOIN auth_account_actors aa
					ON aa.account_id = ap.account_id
					AND aa.scope_type = 'TENANT'
					AND aa.tenant_id = people.tenant_id
				LEFT JOIN authz_actors actor ON actor.id = aa.actor_id
				WHERE ap.person_id = ptm.person_id
				  AND (LOWER(account.login) LIKE LOWER(?)
				       OR actor.id LIKE ?
				       OR actor.actor_key LIKE ?
				       OR actor.display_name LIKE ?)
			)`
			args = append(args, like, like, like, like)
		}
		condition += ")"
		q = q.Where(condition, args...)
	}

	if filter.StatusID != "" {
		q = q.Where("COALESCE(ptm.status_id, people.status_id) = ?", filter.StatusID)
	}

	if filter.ProfileCompletionStatus != "" {
		q = q.Where("COALESCE(gp.profile_completion_status, people.profile_completion_status) = ?", filter.ProfileCompletionStatus)
	}

	if filter.CanCreateCollaborator != nil {
		q = q.Where("COALESCE(gp.can_create_collaborator, people.can_create_collaborator) = ?", *filter.CanCreateCollaborator)
	}

	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	page := filter.Page
	pageSize := filter.PageSize
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 50
	}

	if err := q.
		Order("COALESCE(gp.last_name, people.last_name) ASC, COALESCE(gp.first_name, people.first_name) ASC").
		Limit(pageSize).
		Offset((page - 1) * pageSize).
		Find(&rows).Error; err != nil {
		return nil, 0, err
	}
	if err := r.hydrateFoundation(ctx, rows); err != nil {
		return nil, 0, err
	}
	return rows, total, nil
}

// Create establishes all three Bite 30B layers atomically: the authoritative
// global Person, the current tenant's compatibility projection, and the
// Person-Tenant Membership. Later bites may create a global Person before any
// Membership; this compatibility path preserves the existing Tenant Admin UX.
func (r *gormRepository) Create(ctx context.Context, person *db.Person) error {
	if person == nil {
		return errors.New("person is required")
	}
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		global := globalPersonFromLegacy(*person)
		statusCode, err := personStatusCodeTx(tx, person.TenantID, person.StatusID)
		if err != nil {
			return err
		}
		global.OperationalActive = statusCode != "INACTIVE"
		if err := tx.Create(&global).Error; err != nil {
			return err
		}
		// GORM applies a declared true default to a zero-value bool on create.
		// Force the explicit operationally-inactive state after insertion so an
		// INACTIVE Person cannot be persisted globally as active.
		if !global.OperationalActive {
			if err := tx.Model(&db.GlobalPerson{}).Where("id = ?", global.ID).Update("operational_active", false).Error; err != nil {
				return err
			}
		}
		if err := tx.Create(person).Error; err != nil {
			return err
		}
		legacyID := person.ID
		membership := db.PersonTenantMembership{
			BaseModel:      db.BaseModel{ID: ids.New(), CreatedAt: person.CreatedAt, UpdatedAt: person.UpdatedAt},
			TenantID:       person.TenantID,
			PersonID:       global.ID,
			StatusID:       person.StatusID,
			Notes:          person.Notes,
			LegacyPersonID: &legacyID,
		}
		if err := tx.Create(&membership).Error; err != nil {
			return err
		}
		person.GlobalPersonID = global.ID
		person.MembershipID = membership.ID
		return nil
	})
}

func (r *gormRepository) FindByID(ctx context.Context, tenantID string, id string) (*db.Person, error) {
	var row db.Person
	err := r.db.WithContext(ctx).Preload("Status").First(&row, "id = ? AND tenant_id = ?", id, tenantID).Error
	if err != nil {
		return nil, err
	}
	rows := []db.Person{row}
	if err := r.hydrateFoundation(ctx, rows); err != nil {
		return nil, err
	}
	return &rows[0], nil
}

func (r *gormRepository) Update(ctx context.Context, tenantID string, person *db.Person) error {
	if person == nil {
		return errors.New("person is required")
	}
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		membership, err := findOrCreateMembershipForLegacyPerson(ctx, tx, tenantID, person.ID)
		if err != nil {
			return err
		}
		currentStatusCode, err := personStatusCodeTx(tx, tenantID, membership.StatusID)
		if err != nil {
			return err
		}
		requestedStatusCode, err := personStatusCodeTx(tx, tenantID, person.StatusID)
		if err != nil {
			return err
		}
		if currentStatusCode == "INACTIVE" && requestedStatusCode == "ACTIVE" {
			return ErrTenantReactivationRequired
		}

		global := globalPersonFromLegacy(*person)
		global.ID = membership.PersonID
		if err := tx.Model(&db.GlobalPerson{}).
			Where("id = ?", membership.PersonID).
			Updates(globalPersonUpdateMap(global)).Error; err != nil {
			return err
		}

		// Keep every legacy tenant projection synchronized with global fields so
		// all pre-cutover modules immediately observe a global Person edit.
		var memberships []db.PersonTenantMembership
		if err := tx.Where("person_id = ? AND legacy_person_id IS NOT NULL", membership.PersonID).Find(&memberships).Error; err != nil {
			return err
		}
		legacyIDs := make([]string, 0, len(memberships))
		for _, m := range memberships {
			if m.LegacyPersonID != nil && strings.TrimSpace(*m.LegacyPersonID) != "" {
				legacyIDs = append(legacyIDs, *m.LegacyPersonID)
			}
		}
		if len(legacyIDs) > 0 {
			if err := tx.Model(&db.Person{}).Where("id IN ?", legacyIDs).Updates(legacyGlobalFieldUpdateMap(*person)).Error; err != nil {
				return err
			}
		}

		// INACTIVE is the operational Person lifecycle transition. It deactivates
		// every Membership and Account-bound tenant Actor while retaining history.
		if currentStatusCode != "INACTIVE" && requestedStatusCode == "INACTIVE" {
			if err := tx.Model(&db.Person{}).Where("id = ? AND tenant_id = ?", person.ID, tenantID).Updates(map[string]any{"notes": person.Notes, "updated_at": person.UpdatedAt}).Error; err != nil {
				return err
			}
			if err := tx.Model(&db.PersonTenantMembership{}).Where("id = ? AND tenant_id = ?", membership.ID, tenantID).Updates(map[string]any{"notes": person.Notes, "updated_at": person.UpdatedAt}).Error; err != nil {
				return err
			}
			return deactivateOperationalPersonTx(tx, membership.PersonID, person.UpdatedAt)
		}

		// Other status changes remain tenant-membership data. In particular, an
		// INACTIVE Membership cannot be returned to ACTIVE through generic editing;
		// the explicit Tenant reactivation transaction must be used.
		if err := tx.Model(&db.Person{}).
			Where("id = ? AND tenant_id = ?", person.ID, tenantID).
			Updates(map[string]any{
				"status_id":  person.StatusID,
				"notes":      person.Notes,
				"updated_at": person.UpdatedAt,
			}).Error; err != nil {
			return err
		}
		return tx.Model(&db.PersonTenantMembership{}).
			Where("id = ? AND tenant_id = ?", membership.ID, tenantID).
			Updates(map[string]any{
				"status_id":  person.StatusID,
				"notes":      person.Notes,
				"updated_at": person.UpdatedAt,
			}).Error
	})
}

func (r *gormRepository) ExistsActivePersonStatus(ctx context.Context, tenantID string, statusID string) (bool, error) {
	var count int64
	err := r.db.WithContext(ctx).
		Model(&db.ReferenceData{}).
		Where("id = ? AND tenant_id = ? AND type = ? AND active = ?", statusID, tenantID, "person_status", true).
		Count(&count).Error
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

func (r *gormRepository) SearchGlobal(ctx context.Context, tenantID string, filter GlobalPersonSearchFilter) ([]db.GlobalPerson, int64, error) {
	var rows []db.GlobalPerson
	var total int64
	q := r.db.WithContext(ctx).Model(&db.GlobalPerson{}).
		Where(`NOT EXISTS (
			SELECT 1 FROM person_tenant_memberships m
			WHERE m.person_id = global_people.id AND m.tenant_id = ?
		)`, tenantID)

	search := strings.TrimSpace(filter.Search)
	// Never provide an unfiltered global directory. Tenant Administrators must
	// supply a meaningful identity search before a Person can be considered for
	// Membership in their tenant.
	if len([]rune(search)) < 3 {
		return []db.GlobalPerson{}, 0, nil
	}
	if search != "" {
		like := "%" + escapeLike(search) + "%"
		q = q.Where(`(first_name LIKE ? ESCAPE '!'
			OR last_name LIKE ? ESCAPE '!'
			OR TRIM(first_name || ' ' || last_name) LIKE ? ESCAPE '!'
			OR nickname LIKE ? ESCAPE '!'
			OR cpf LIKE ? ESCAPE '!'
			OR rg LIKE ? ESCAPE '!'
			OR cellular LIKE ? ESCAPE '!'
			OR LOWER(email) LIKE LOWER(?) ESCAPE '!')`,
			like, like, like, like, like, like, like, like)
	}
	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	page, pageSize := filter.Page, filter.PageSize
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 || pageSize > 100 {
		pageSize = 25
	}
	if err := q.Order("last_name ASC, first_name ASC").Limit(pageSize).Offset((page - 1) * pageSize).Find(&rows).Error; err != nil {
		return nil, 0, err
	}
	return rows, total, nil
}

func (r *gormRepository) CreateMembership(ctx context.Context, tenantID string, req CreatePersonMembershipRequest) (*db.Person, error) {
	var result db.Person
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var global db.GlobalPerson
		if err := tx.First(&global, "id = ?", strings.TrimSpace(req.PersonID)).Error; err != nil {
			return err
		}
		var existing int64
		if err := tx.Model(&db.PersonTenantMembership{}).
			Where("person_id = ? AND tenant_id = ?", global.ID, tenantID).
			Count(&existing).Error; err != nil {
			return err
		}
		if existing > 0 {
			return ValidationError{Fields: map[string]string{"personId": "Person already belongs to this tenant"}}
		}

		now := time.Now().UTC()
		requestedStatusCode, err := personStatusCodeTx(tx, tenantID, strings.TrimSpace(req.StatusID))
		if err != nil {
			return err
		}
		initialStatusID := strings.TrimSpace(req.StatusID)
		shouldReactivate := !global.OperationalActive && requestedStatusCode == "ACTIVE"
		if shouldReactivate {
			inactiveStatusID, err := personStatusIDByCodeTx(tx, tenantID, "INACTIVE")
			if err != nil {
				return err
			}
			initialStatusID = inactiveStatusID
		}
		legacy := legacyPersonFromGlobal(global, tenantID, initialStatusID, strings.TrimSpace(req.Notes), ids.New(), now)
		if err := tx.Create(&legacy).Error; err != nil {
			return err
		}
		legacyID := legacy.ID
		membership := db.PersonTenantMembership{
			BaseModel:      db.BaseModel{ID: ids.New(), CreatedAt: now, UpdatedAt: now},
			TenantID:       tenantID,
			PersonID:       global.ID,
			StatusID:       initialStatusID,
			Notes:          strings.TrimSpace(req.Notes),
			LegacyPersonID: &legacyID,
		}
		if err := tx.Create(&membership).Error; err != nil {
			return err
		}
		if shouldReactivate {
			suspended, err := personAccountSecuritySuspendedTx(tx, global.ID)
			if err != nil {
				return err
			}
			if suspended {
				return ErrApplicationSecuritySuspended
			}
			if err := reactivateTenantMembershipTx(tx, tenantID, legacy.ID, now); err != nil {
				return err
			}
		}
		legacy.GlobalPersonID = global.ID
		legacy.MembershipID = membership.ID
		result = legacy
		return nil
	})
	if err != nil {
		return nil, err
	}
	rows := []db.Person{result}
	if err := r.hydrateFoundation(ctx, rows); err != nil {
		return nil, err
	}
	return &rows[0], nil
}

func (r *gormRepository) Reactivate(ctx context.Context, tenantID string, legacyPersonID string) (*db.Person, error) {
	now := time.Now().UTC()
	if err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		return reactivateTenantMembershipTx(tx, strings.TrimSpace(tenantID), strings.TrimSpace(legacyPersonID), now)
	}); err != nil {
		return nil, err
	}
	return r.FindByID(ctx, tenantID, legacyPersonID)
}

func (r *gormRepository) FindMembershipByLegacyPersonID(ctx context.Context, tenantID string, legacyPersonID string) (*db.PersonTenantMembership, error) {
	var row db.PersonTenantMembership
	if err := r.db.WithContext(ctx).
		Preload("Person").Preload("Status").
		First(&row, "tenant_id = ? AND legacy_person_id = ?", tenantID, legacyPersonID).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

func (r *gormRepository) UniqueConflicts(
	ctx context.Context,
	_ string, // uniqueness is global as of Bite 30B
	cpf string,
	rg string,
	cellular string,
	email string,
	pixKey *string,
	excludeID *string,
) (map[string]bool, error) {
	conflicts := map[string]bool{}
	checks := []struct {
		field  string
		column string
		value  string
	}{
		{field: "cpf", column: "cpf", value: cpf},
		{field: "rg", column: "rg", value: rg},
		{field: "cellular", column: "cellular", value: cellular},
		{field: "email", column: "email", value: email},
	}
	if pixKey != nil && strings.TrimSpace(*pixKey) != "" {
		checks = append(checks, struct{ field, column, value string }{field: "pixKey", column: "pix_key", value: strings.TrimSpace(*pixKey)})
	}

	globalExcludeID := ""
	if excludeID != nil && strings.TrimSpace(*excludeID) != "" {
		if membership, err := r.findMembershipAnyTenantByLegacyID(ctx, *excludeID); err == nil {
			globalExcludeID = membership.PersonID
		}
	}

	for _, check := range checks {
		if strings.TrimSpace(check.value) == "" {
			continue
		}
		query := r.db.WithContext(ctx).Model(&db.GlobalPerson{}).Where(check.column+" = ?", check.value)
		if globalExcludeID != "" {
			query = query.Where("id <> ?", globalExcludeID)
		}
		var count int64
		if err := query.Count(&count).Error; err != nil {
			return nil, err
		}
		// AutoMigrate-only tests or an interrupted additive deployment can have
		// legacy rows before the SQL backfill has populated global_people. Keep
		// uniqueness global even in that compatibility state.
		if count == 0 && globalExcludeID == "" {
			legacyQuery := r.db.WithContext(ctx).Model(&db.Person{}).Where(check.column+" = ?", check.value)
			if excludeID != nil && strings.TrimSpace(*excludeID) != "" {
				legacyQuery = legacyQuery.Where("id <> ?", strings.TrimSpace(*excludeID))
			}
			if err := legacyQuery.Count(&count).Error; err != nil {
				return nil, err
			}
		}
		if count > 0 {
			conflicts[check.field] = true
		}
	}
	return conflicts, nil
}

func (r *gormRepository) hydrateFoundation(ctx context.Context, rows []db.Person) error {
	if len(rows) == 0 {
		return nil
	}
	legacyIDs := make([]string, 0, len(rows))
	for _, row := range rows {
		legacyIDs = append(legacyIDs, row.ID)
	}
	var memberships []db.PersonTenantMembership
	if err := r.db.WithContext(ctx).
		Preload("Person").Preload("Status").
		Where("legacy_person_id IN ?", legacyIDs).
		Find(&memberships).Error; err != nil {
		return err
	}
	byLegacy := make(map[string]db.PersonTenantMembership, len(memberships))
	for _, membership := range memberships {
		if membership.LegacyPersonID != nil {
			byLegacy[*membership.LegacyPersonID] = membership
		}
	}
	for i := range rows {
		membership, ok := byLegacy[rows[i].ID]
		if !ok {
			continue
		}
		copyGlobalIntoLegacy(&rows[i], membership.Person)
		rows[i].GlobalPersonID = membership.PersonID
		rows[i].MembershipID = membership.ID
		rows[i].StatusID = membership.StatusID
		rows[i].Notes = membership.Notes
		rows[i].Status = membership.Status
	}
	return nil
}

func personStatusCodeTx(tx *gorm.DB, tenantID string, statusID string) (string, error) {
	var code string
	result := tx.Table("reference_data").Select("code").Where("id = ? AND tenant_id = ? AND type = ? AND active = ?", strings.TrimSpace(statusID), strings.TrimSpace(tenantID), "person_status", true).Limit(1).Scan(&code)
	if result.Error != nil {
		return "", result.Error
	}
	if result.RowsAffected == 0 || strings.TrimSpace(code) == "" {
		return "", ValidationError{Fields: map[string]string{"statusId": "Status must be an active person status"}}
	}
	return strings.ToUpper(strings.TrimSpace(code)), nil
}

func personStatusIDByCodeTx(tx *gorm.DB, tenantID string, code string) (string, error) {
	var id string
	result := tx.Table("reference_data").Select("id").Where("tenant_id = ? AND type = ? AND code = ? AND active = ?", strings.TrimSpace(tenantID), "person_status", strings.ToUpper(strings.TrimSpace(code)), true).Limit(1).Scan(&id)
	if result.Error != nil {
		return "", result.Error
	}
	if result.RowsAffected == 0 || strings.TrimSpace(id) == "" {
		return "", ValidationError{Fields: map[string]string{"statusId": "Tenant is missing the required " + strings.ToUpper(strings.TrimSpace(code)) + " Person status"}}
	}
	return strings.TrimSpace(id), nil
}

func personAccountSecuritySuspendedTx(tx *gorm.DB, globalPersonID string) (bool, error) {
	if tx == nil || !tx.Migrator().HasTable("auth_account_people") || !tx.Migrator().HasTable("auth_user_accounts") {
		return false, nil
	}
	type row struct{ SecuritySuspended bool }
	var account row
	result := tx.Table("auth_account_people ap").Select("a.security_suspended").Joins("JOIN auth_user_accounts a ON a.id = ap.account_id").Where("ap.person_id = ?", globalPersonID).Limit(1).Scan(&account)
	if result.Error != nil {
		return false, result.Error
	}
	return result.RowsAffected > 0 && account.SecuritySuspended, nil
}

func deactivateOperationalPersonTx(tx *gorm.DB, globalPersonID string, now time.Time) error {
	var memberships []db.PersonTenantMembership
	if err := tx.Where("person_id = ?", globalPersonID).Find(&memberships).Error; err != nil {
		return err
	}
	membershipIDs := make([]string, 0, len(memberships))
	legacyPersonIDs := make([]string, 0, len(memberships))
	for _, membership := range memberships {
		inactiveStatusID, err := personStatusIDByCodeTx(tx, membership.TenantID, "INACTIVE")
		if err != nil {
			return err
		}
		if err := tx.Model(&db.PersonTenantMembership{}).Where("id = ?", membership.ID).Updates(map[string]any{"status_id": inactiveStatusID, "updated_at": now}).Error; err != nil {
			return err
		}
		if membership.LegacyPersonID != nil && strings.TrimSpace(*membership.LegacyPersonID) != "" {
			legacyPersonID := strings.TrimSpace(*membership.LegacyPersonID)
			if err := tx.Model(&db.Person{}).Where("id = ? AND tenant_id = ?", legacyPersonID, membership.TenantID).Updates(map[string]any{"status_id": inactiveStatusID, "updated_at": now}).Error; err != nil {
				return err
			}
			legacyPersonIDs = append(legacyPersonIDs, legacyPersonID)
		}
		membershipIDs = append(membershipIDs, membership.ID)
	}
	if err := tx.Model(&db.GlobalPerson{}).Where("id = ?", globalPersonID).Updates(map[string]any{"operational_active": false, "updated_at": now}).Error; err != nil {
		return err
	}

	if tx.Migrator().HasTable("auth_account_people") && tx.Migrator().HasTable("auth_user_accounts") {
		type accountRow struct{ AccountID string }
		var account accountRow
		accountResult := tx.Table("auth_account_people").Select("account_id").Where("person_id = ?", globalPersonID).Limit(1).Scan(&account)
		if accountResult.Error != nil {
			return accountResult.Error
		}
		if accountResult.RowsAffected > 0 && strings.TrimSpace(account.AccountID) != "" {
			if err := tx.Table("auth_user_accounts").Where("id = ?", account.AccountID).Updates(map[string]any{"active": false, "updated_at": now}).Error; err != nil {
				return err
			}
			if tx.Migrator().HasTable("auth_sessions") {
				if err := tx.Table("auth_sessions").Where("account_id = ? AND revoked_at IS NULL", account.AccountID).Updates(map[string]any{"revoked_at": now, "updated_at": now}).Error; err != nil {
					return err
				}
			}
			if tx.Migrator().HasTable("auth_password_reset_tokens") {
				if err := tx.Table("auth_password_reset_tokens").Where("account_id = ? AND used_at IS NULL", account.AccountID).Update("used_at", now).Error; err != nil {
					return err
				}
			}
		}
	}

	if !tx.Migrator().HasTable("authz_actors") {
		return nil
	}
	actorIDs := make([]string, 0)
	if len(membershipIDs) > 0 && tx.Migrator().HasTable("auth_account_actors") {
		var boundActorIDs []string
		if err := tx.Table("auth_account_actors").Where("scope_type = ? AND membership_id IN ?", "TENANT", membershipIDs).Pluck("actor_id", &boundActorIDs).Error; err != nil {
			return err
		}
		actorIDs = append(actorIDs, boundActorIDs...)
	}
	if len(legacyPersonIDs) > 0 {
		var legacyActorIDs []string
		if err := tx.Table("authz_actors").Where("person_id IN ?", legacyPersonIDs).Pluck("id", &legacyActorIDs).Error; err != nil {
			return err
		}
		actorIDs = append(actorIDs, legacyActorIDs...)
	}
	if len(actorIDs) > 0 {
		if err := tx.Table("authz_actors").Where("id IN ?", actorIDs).Updates(map[string]any{"active": false, "updated_at": now}).Error; err != nil {
			return err
		}
		if tx.Migrator().HasTable("authz_actor_role_grants") {
			if err := tx.Table("authz_actor_role_grants").Where("actor_id IN ? AND active = ?", actorIDs, true).Updates(map[string]any{"lifecycle_suspended": true, "updated_at": now}).Error; err != nil {
				return err
			}
		}
	}
	return nil
}

func reactivateTenantMembershipTx(tx *gorm.DB, tenantID string, legacyPersonID string, now time.Time) error {
	var membership db.PersonTenantMembership
	result := tx.Where("tenant_id = ? AND legacy_person_id = ?", tenantID, legacyPersonID).Limit(1).Find(&membership)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	code, err := personStatusCodeTx(tx, tenantID, membership.StatusID)
	if err != nil {
		return err
	}
	if code != "INACTIVE" {
		return ValidationError{Fields: map[string]string{"statusId": "Only an operationally INACTIVE Person may be reactivated"}}
	}
	if suspended, err := personAccountSecuritySuspendedTx(tx, membership.PersonID); err != nil {
		return err
	} else if suspended {
		return ErrApplicationSecuritySuspended
	}
	activeStatusID, err := personStatusIDByCodeTx(tx, tenantID, "ACTIVE")
	if err != nil {
		return err
	}
	if err := tx.Model(&db.PersonTenantMembership{}).Where("id = ?", membership.ID).Updates(map[string]any{"status_id": activeStatusID, "updated_at": now}).Error; err != nil {
		return err
	}
	if membership.LegacyPersonID != nil {
		if err := tx.Model(&db.Person{}).Where("id = ? AND tenant_id = ?", *membership.LegacyPersonID, tenantID).Updates(map[string]any{"status_id": activeStatusID, "updated_at": now}).Error; err != nil {
			return err
		}
	}
	if err := tx.Model(&db.GlobalPerson{}).Where("id = ?", membership.PersonID).Updates(map[string]any{"operational_active": true, "updated_at": now}).Error; err != nil {
		return err
	}
	if !tx.Migrator().HasTable("auth_account_people") || !tx.Migrator().HasTable("auth_user_accounts") {
		return nil
	}

	type accountRow struct {
		ID        string
		CreatedAt time.Time
	}
	var account accountRow
	accountResult := tx.Table("auth_account_people ap").Select("a.id, a.created_at").Joins("JOIN auth_user_accounts a ON a.id = ap.account_id").Where("ap.person_id = ?", membership.PersonID).Limit(1).Scan(&account)
	if accountResult.Error != nil {
		return accountResult.Error
	}
	if accountResult.RowsAffected == 0 || strings.TrimSpace(account.ID) == "" {
		return nil
	}
	if err := tx.Table("auth_user_accounts").Where("id = ?", account.ID).Updates(map[string]any{"active": true, "updated_at": now}).Error; err != nil {
		return err
	}

	type bindingRow struct{ ActorID string }
	var binding bindingRow
	bindingResult := tx.Table("auth_account_actors").Select("actor_id").Where("account_id = ? AND scope_type = ? AND tenant_id = ?", account.ID, "TENANT", tenantID).Limit(1).Scan(&binding)
	if bindingResult.Error != nil {
		return bindingResult.Error
	}
	actorID := strings.TrimSpace(binding.ActorID)
	if actorID == "" {
		var legacy db.Person
		if err := tx.First(&legacy, "id = ? AND tenant_id = ?", legacyPersonID, tenantID).Error; err != nil {
			return err
		}
		actorID = ids.New()
		actorKey := "person:" + membership.PersonID + "::tenant::" + tenantID
		displayName := strings.TrimSpace(strings.TrimSpace(legacy.FirstName+" "+legacy.LastName) + " (" + strings.TrimSpace(legacy.Nickname) + ")")
		if strings.TrimSpace(legacy.Nickname) == "" {
			displayName = strings.TrimSpace(legacy.FirstName + " " + legacy.LastName)
		}
		personID := legacyPersonID
		if err := tx.Table("authz_actors").Create(map[string]any{"id": actorID, "actor_key": actorKey, "display_name": displayName, "person_id": personID, "active": true, "created_at": now, "updated_at": now}).Error; err != nil {
			return err
		}
		tenant := tenantID
		membershipID := membership.ID
		if err := tx.Table("auth_account_actors").Create(map[string]any{"account_id": account.ID, "actor_id": actorID, "scope_type": "TENANT", "tenant_id": tenant, "membership_id": membershipID, "is_primary": false, "created_at": now, "updated_at": now}).Error; err != nil {
			return err
		}
	} else {
		if err := tx.Table("authz_actors").Where("id = ?", actorID).Updates(map[string]any{"active": true, "updated_at": now}).Error; err != nil {
			return err
		}
	}
	// Deliberately do not clear lifecycle_suspended here. Old delegated grants
	// remain historical until this Tenant explicitly grants each role again.
	return nil
}

func (r *gormRepository) findMembershipAnyTenantByLegacyID(ctx context.Context, legacyPersonID string) (*db.PersonTenantMembership, error) {
	var row db.PersonTenantMembership
	if err := r.db.WithContext(ctx).First(&row, "legacy_person_id = ?", strings.TrimSpace(legacyPersonID)).Error; err != nil {
		return nil, err
	}
	return &row, nil
}

func findOrCreateMembershipForLegacyPerson(ctx context.Context, tx *gorm.DB, tenantID string, legacyPersonID string) (*db.PersonTenantMembership, error) {
	var membership db.PersonTenantMembership
	err := tx.WithContext(ctx).First(&membership, "tenant_id = ? AND legacy_person_id = ?", tenantID, legacyPersonID).Error
	if err == nil {
		return &membership, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	var legacy db.Person
	if err := tx.WithContext(ctx).First(&legacy, "id = ? AND tenant_id = ?", legacyPersonID, tenantID).Error; err != nil {
		return nil, err
	}
	var global db.GlobalPerson
	if err := tx.WithContext(ctx).First(&global, "cpf = ?", legacy.CPF).Error; err != nil {
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
		global = globalPersonFromLegacy(legacy)
		operationalActive, stateErr := legacyOperationalActiveByCPF(tx, legacy.CPF)
		if stateErr != nil {
			return nil, stateErr
		}
		global.OperationalActive = operationalActive
		if err := tx.WithContext(ctx).Create(&global).Error; err != nil {
			return nil, err
		}
		if !global.OperationalActive {
			if err := tx.WithContext(ctx).Model(&db.GlobalPerson{}).Where("id = ?", global.ID).Update("operational_active", false).Error; err != nil {
				return nil, err
			}
		}
	}
	now := time.Now().UTC()
	membershipStatusID := legacy.StatusID
	if !global.OperationalActive {
		inactiveStatusID, statusErr := personStatusIDByCodeTx(tx, tenantID, "INACTIVE")
		if statusErr != nil {
			return nil, statusErr
		}
		membershipStatusID = inactiveStatusID
		if legacy.StatusID != inactiveStatusID {
			if err := tx.WithContext(ctx).Model(&db.Person{}).Where("id = ? AND tenant_id = ?", legacy.ID, tenantID).Updates(map[string]any{
				"status_id":  inactiveStatusID,
				"updated_at": now,
			}).Error; err != nil {
				return nil, err
			}
		}
	}
	membership = db.PersonTenantMembership{
		BaseModel: db.BaseModel{ID: ids.New(), CreatedAt: now, UpdatedAt: now}, TenantID: tenantID,
		PersonID: global.ID, StatusID: membershipStatusID, Notes: legacy.Notes, LegacyPersonID: &legacy.ID,
	}
	if err := tx.WithContext(ctx).Create(&membership).Error; err != nil {
		return nil, err
	}
	return &membership, nil
}

func legacyOperationalActiveByCPF(tx *gorm.DB, cpf string) (bool, error) {
	type lifecycleCounts struct {
		ActiveCount   int64
		InactiveCount int64
	}
	var counts lifecycleCounts
	if err := tx.Raw(`
SELECT
  COALESCE(SUM(CASE WHEN s.code = 'ACTIVE' AND s.active = 1 THEN 1 ELSE 0 END), 0) AS active_count,
  COALESCE(SUM(CASE WHEN s.code = 'INACTIVE' AND s.active = 1 THEN 1 ELSE 0 END), 0) AS inactive_count
FROM people p
JOIN reference_data s
  ON s.id = p.status_id
 AND s.tenant_id = p.tenant_id
 AND s.type = 'person_status'
WHERE p.cpf = ?`, strings.TrimSpace(cpf)).Scan(&counts).Error; err != nil {
		return false, err
	}
	if counts.ActiveCount > 0 {
		return true, nil
	}
	if counts.InactiveCount > 0 {
		return false, nil
	}
	return true, nil
}

func escapeLike(value string) string {
	return strings.NewReplacer(`!`, `!!`, `%`, `!%`, `_`, `!_`).Replace(value)
}

func globalPersonFromLegacy(person db.Person) db.GlobalPerson {
	return db.GlobalPerson{
		BaseModel: person.BaseModel,
		FirstName: person.FirstName, LastName: person.LastName, Nickname: person.Nickname,
		CPF: person.CPF, RG: person.RG, Cellular: person.Cellular, Email: person.Email,
		Street1: person.Street1, Street2: person.Street2, State: person.State, City: person.City, CEP: person.CEP, Country: person.Country,
		BankName: person.BankName, BankNumber: person.BankNumber, CheckingAccount: person.CheckingAccount, PIXKey: person.PIXKey,
		EmergencyName: person.EmergencyName, EmergencyCellular: person.EmergencyCellular, EmergencyEmail: person.EmergencyEmail,
		ProfileCompletionStatus: person.ProfileCompletionStatus, CanCreateCollaborator: person.CanCreateCollaborator,
	}
}

func legacyPersonFromGlobal(global db.GlobalPerson, tenantID, statusID, notes, legacyID string, now time.Time) db.Person {
	return db.Person{
		BaseModel: db.BaseModel{ID: legacyID, CreatedAt: now, UpdatedAt: now}, TenantID: tenantID,
		FirstName: global.FirstName, LastName: global.LastName, Nickname: global.Nickname,
		CPF: global.CPF, RG: global.RG, Cellular: global.Cellular, Email: global.Email,
		Street1: global.Street1, Street2: global.Street2, State: global.State, City: global.City, CEP: global.CEP, Country: global.Country,
		BankName: global.BankName, BankNumber: global.BankNumber, CheckingAccount: global.CheckingAccount, PIXKey: global.PIXKey,
		EmergencyName: global.EmergencyName, EmergencyCellular: global.EmergencyCellular, EmergencyEmail: global.EmergencyEmail,
		ProfileCompletionStatus: global.ProfileCompletionStatus, CanCreateCollaborator: global.CanCreateCollaborator,
		StatusID: statusID, Notes: notes,
	}
}

func copyGlobalIntoLegacy(person *db.Person, global db.GlobalPerson) {
	if person == nil || strings.TrimSpace(global.ID) == "" {
		return
	}
	person.FirstName, person.LastName, person.Nickname = global.FirstName, global.LastName, global.Nickname
	person.CPF, person.RG, person.Cellular, person.Email = global.CPF, global.RG, global.Cellular, global.Email
	person.Street1, person.Street2, person.State, person.City, person.CEP, person.Country = global.Street1, global.Street2, global.State, global.City, global.CEP, global.Country
	person.BankName, person.BankNumber, person.CheckingAccount, person.PIXKey = global.BankName, global.BankNumber, global.CheckingAccount, global.PIXKey
	person.EmergencyName, person.EmergencyCellular, person.EmergencyEmail = global.EmergencyName, global.EmergencyCellular, global.EmergencyEmail
	person.ProfileCompletionStatus, person.CanCreateCollaborator = global.ProfileCompletionStatus, global.CanCreateCollaborator
	if global.UpdatedAt.After(person.UpdatedAt) {
		person.UpdatedAt = global.UpdatedAt
	}
}

func globalPersonUpdateMap(person db.GlobalPerson) map[string]any {
	return map[string]any{
		"first_name": person.FirstName, "last_name": person.LastName, "nickname": person.Nickname,
		"cpf": person.CPF, "rg": person.RG, "cellular": person.Cellular, "email": person.Email,
		"street1": person.Street1, "street2": person.Street2, "state": person.State, "city": person.City, "cep": person.CEP, "country": person.Country,
		"bank_name": person.BankName, "bank_number": person.BankNumber, "checking_account": person.CheckingAccount, "pix_key": person.PIXKey,
		"emergency_name": person.EmergencyName, "emergency_cellular": person.EmergencyCellular, "emergency_email": person.EmergencyEmail,
		"profile_completion_status": person.ProfileCompletionStatus, "can_create_collaborator": person.CanCreateCollaborator,
		"updated_at": person.UpdatedAt,
	}
}

func legacyGlobalFieldUpdateMap(person db.Person) map[string]any {
	return map[string]any{
		"first_name": person.FirstName, "last_name": person.LastName, "nickname": person.Nickname,
		"cpf": person.CPF, "rg": person.RG, "cellular": person.Cellular, "email": person.Email,
		"street1": person.Street1, "street2": person.Street2, "state": person.State, "city": person.City, "cep": person.CEP, "country": person.Country,
		"bank_name": person.BankName, "bank_number": person.BankNumber, "checking_account": person.CheckingAccount, "pix_key": person.PIXKey,
		"emergency_name": person.EmergencyName, "emergency_cellular": person.EmergencyCellular, "emergency_email": person.EmergencyEmail,
		"profile_completion_status": person.ProfileCompletionStatus, "can_create_collaborator": person.CanCreateCollaborator,
		"updated_at": person.UpdatedAt,
	}
}
