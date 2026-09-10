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
	var memberships []db.PersonTenantMembership
	var total int64

	q := r.db.WithContext(ctx).
		Model(&db.PersonTenantMembership{}).
		Joins(`JOIN global_people gp ON gp.id = person_tenant_memberships.person_id`).
		Where("person_tenant_memberships.tenant_id = ?", tenantID)

	if filter.Search != "" {
		like := "%" + filter.Search + "%"
		condition := `(gp.first_name LIKE ?
			OR gp.last_name LIKE ?
			OR TRIM(gp.first_name || ' ' || gp.last_name) LIKE ?
			OR gp.nickname LIKE ?
			OR gp.cpf LIKE ?
			OR gp.rg LIKE ?
			OR gp.cellular LIKE ?
			OR gp.email LIKE ?`
		args := []any{like, like, like, like, like, like, like, like}

		// Authentication aliases are identity metadata for the same global Person.
		// Scope Actor matching to this Membership's Tenant so another tenant can
		// never make the Person appear in the current Tenant directory.
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
					AND aa.tenant_id = person_tenant_memberships.tenant_id
				LEFT JOIN authz_actors actor ON actor.id = aa.actor_id
				WHERE ap.person_id = person_tenant_memberships.person_id
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
		q = q.Where("person_tenant_memberships.status_id = ?", filter.StatusID)
	}
	if filter.ProfileCompletionStatus != "" {
		q = q.Where("gp.profile_completion_status = ?", filter.ProfileCompletionStatus)
	}
	if filter.CanCreateCollaborator != nil {
		q = q.Where("gp.can_create_collaborator = ?", *filter.CanCreateCollaborator)
	}

	if err := q.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	page, pageSize := filter.Page, filter.PageSize
	if page <= 0 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 50
	}

	if err := q.
		Preload("Person").
		Preload("Status").
		Order("gp.last_name ASC, gp.first_name ASC").
		Limit(pageSize).
		Offset((page - 1) * pageSize).
		Find(&memberships).Error; err != nil {
		return nil, 0, err
	}

	rows := make([]db.Person, 0, len(memberships))
	for _, membership := range memberships {
		rows = append(rows, membershipPersonProjection(membership))
	}
	return rows, total, nil
}

// Create establishes the canonical identity layers atomically: the global
// Person and the current Tenant's Person-Tenant Membership. 30K.3A no longer
// creates or updates a tenant-local legacy Person projection.
func (r *gormRepository) Create(ctx context.Context, person *db.Person) error {
	if person == nil {
		return errors.New("person is required")
	}
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		global := globalPersonFromProjection(*person)
		statusCode, err := personStatusCodeTx(tx, person.TenantID, person.StatusID)
		if err != nil {
			return err
		}
		global.OperationalActive = statusCode != "INACTIVE"
		if err := tx.Create(&global).Error; err != nil {
			return err
		}
		if !global.OperationalActive {
			if err := tx.Model(&db.GlobalPerson{}).Where("id = ?", global.ID).Update("operational_active", false).Error; err != nil {
				return err
			}
		}
		membership := db.PersonTenantMembership{
			BaseModel: db.BaseModel{ID: ids.New(), CreatedAt: person.CreatedAt, UpdatedAt: person.UpdatedAt},
			TenantID:  person.TenantID,
			PersonID:  global.ID,
			StatusID:  person.StatusID,
			Notes:     person.Notes,
		}
		if err := tx.Create(&membership).Error; err != nil {
			return err
		}
		person.ID = global.ID
		person.GlobalPersonID = global.ID
		person.MembershipID = membership.ID
		return nil
	})
}

func (r *gormRepository) FindByID(ctx context.Context, tenantID string, id string) (*db.Person, error) {
	membership, err := r.findMembershipByPersonIdentifier(ctx, tenantID, id)
	if err != nil {
		return nil, err
	}
	row := membershipPersonProjection(*membership)
	return &row, nil
}

func (r *gormRepository) Update(ctx context.Context, tenantID string, person *db.Person) error {
	if person == nil {
		return errors.New("person is required")
	}
	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		membership, err := findMembershipByPersonIdentifierTx(ctx, tx, tenantID, person.ID)
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

		global := globalPersonFromProjection(*person)
		global.ID = membership.PersonID
		if err := tx.Model(&db.GlobalPerson{}).Where("id = ?", membership.PersonID).Updates(globalPersonUpdateMap(global)).Error; err != nil {
			return err
		}

		if err := tx.Model(&db.PersonTenantMembership{}).Where("id = ? AND tenant_id = ?", membership.ID, tenantID).Updates(map[string]any{
			"status_id": person.StatusID, "notes": person.Notes, "updated_at": person.UpdatedAt,
		}).Error; err != nil {
			return err
		}
		if currentStatusCode != "INACTIVE" && requestedStatusCode == "INACTIVE" {
			return deactivateOperationalPersonTx(tx, membership.PersonID, person.UpdatedAt)
		}
		return nil
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
	var result db.PersonTenantMembership
	err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var global db.GlobalPerson
		if err := tx.First(&global, "id = ?", strings.TrimSpace(req.PersonID)).Error; err != nil {
			return err
		}
		var existing int64
		if err := tx.Model(&db.PersonTenantMembership{}).Where("person_id = ? AND tenant_id = ?", global.ID, tenantID).Count(&existing).Error; err != nil {
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
		membership := db.PersonTenantMembership{
			BaseModel: db.BaseModel{ID: ids.New(), CreatedAt: now, UpdatedAt: now},
			TenantID:  tenantID, PersonID: global.ID, StatusID: initialStatusID, Notes: strings.TrimSpace(req.Notes),
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
			if err := reactivateTenantMembershipTx(tx, tenantID, membership.ID, now); err != nil {
				return err
			}
			membership.StatusID = strings.TrimSpace(req.StatusID)
		}
		membership.Person = global
		if err := tx.Preload("Status").First(&membership, "id = ?", membership.ID).Error; err != nil {
			return err
		}
		result = membership
		return nil
	})
	if err != nil {
		return nil, err
	}
	row := membershipPersonProjection(result)
	return &row, nil
}

func (r *gormRepository) Reactivate(ctx context.Context, tenantID string, personID string) (*db.Person, error) {
	membership, err := r.findMembershipByPersonIdentifier(ctx, tenantID, personID)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC()
	if err := r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		return reactivateTenantMembershipTx(tx, strings.TrimSpace(tenantID), membership.ID, now)
	}); err != nil {
		return nil, err
	}
	return r.FindByID(ctx, tenantID, membership.PersonID)
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
		identifier := strings.TrimSpace(*excludeID)
		var membership db.PersonTenantMembership
		if err := r.db.WithContext(ctx).Where("person_id = ?", identifier).First(&membership).Error; err == nil {
			globalExcludeID = membership.PersonID
		} else {
			globalExcludeID = identifier
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
		if count > 0 {
			conflicts[check.field] = true
		}
	}
	return conflicts, nil
}

func (r *gormRepository) findMembershipByPersonIdentifier(ctx context.Context, tenantID string, identifier string) (*db.PersonTenantMembership, error) {
	identifier = strings.TrimSpace(identifier)
	var membership db.PersonTenantMembership
	if err := r.db.WithContext(ctx).
		Preload("Person").
		Preload("Status").
		Where("tenant_id = ? AND person_id = ?", strings.TrimSpace(tenantID), identifier).
		First(&membership).Error; err != nil {
		return nil, err
	}
	return &membership, nil
}

func membershipPersonProjection(membership db.PersonTenantMembership) db.Person {
	global := membership.Person
	row := db.Person{
		BaseModel:               membership.BaseModel,
		GlobalPersonID:          membership.PersonID,
		MembershipID:            membership.ID,
		TenantID:                membership.TenantID,
		FirstName:               global.FirstName,
		LastName:                global.LastName,
		Nickname:                global.Nickname,
		CPF:                     global.CPF,
		RG:                      global.RG,
		Cellular:                global.Cellular,
		Email:                   global.Email,
		Street1:                 global.Street1,
		Street2:                 global.Street2,
		State:                   global.State,
		City:                    global.City,
		CEP:                     global.CEP,
		Country:                 global.Country,
		BankName:                global.BankName,
		BankNumber:              global.BankNumber,
		CheckingAccount:         global.CheckingAccount,
		PIXKey:                  global.PIXKey,
		EmergencyName:           global.EmergencyName,
		EmergencyCellular:       global.EmergencyCellular,
		EmergencyEmail:          global.EmergencyEmail,
		ProfileCompletionStatus: global.ProfileCompletionStatus,
		CanCreateCollaborator:   global.CanCreateCollaborator,
		StatusID:                membership.StatusID,
		Notes:                   membership.Notes,
		Status:                  membership.Status,
	}
	// From 30K.1 onward the public People identifier is the canonical Global Person ID.
	row.ID = membership.PersonID
	if global.CreatedAt.Before(row.CreatedAt) || row.CreatedAt.IsZero() {
		row.CreatedAt = global.CreatedAt
	}
	if global.UpdatedAt.After(row.UpdatedAt) {
		row.UpdatedAt = global.UpdatedAt
	}
	return row
}

func findMembershipByPersonIdentifierTx(ctx context.Context, tx *gorm.DB, tenantID string, identifier string) (*db.PersonTenantMembership, error) {
	identifier = strings.TrimSpace(identifier)
	var membership db.PersonTenantMembership
	if err := tx.WithContext(ctx).
		Where("tenant_id = ? AND person_id = ?", strings.TrimSpace(tenantID), identifier).
		First(&membership).Error; err != nil {
		return nil, err
	}
	return &membership, nil
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
	for _, membership := range memberships {
		inactiveStatusID, err := personStatusIDByCodeTx(tx, membership.TenantID, "INACTIVE")
		if err != nil {
			return err
		}
		if err := tx.Model(&db.PersonTenantMembership{}).Where("id = ?", membership.ID).Updates(map[string]any{"status_id": inactiveStatusID, "updated_at": now}).Error; err != nil {
			return err
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

func reactivateTenantMembershipTx(tx *gorm.DB, tenantID string, membershipID string, now time.Time) error {
	var membership db.PersonTenantMembership
	result := tx.Where("id = ? AND tenant_id = ?", strings.TrimSpace(membershipID), strings.TrimSpace(tenantID)).Limit(1).Find(&membership)
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
	bindingResult := tx.Table("auth_account_actors").Select("actor_id").Where("account_id = ? AND scope_type = ? AND tenant_id = ? AND membership_id = ?", account.ID, "TENANT", tenantID, membership.ID).Limit(1).Scan(&binding)
	if bindingResult.Error != nil {
		return bindingResult.Error
	}
	actorID := strings.TrimSpace(binding.ActorID)
	if actorID == "" {
		var global db.GlobalPerson
		if err := tx.First(&global, "id = ?", membership.PersonID).Error; err != nil {
			return err
		}
		actorID = ids.New()
		actorKey := "person:" + membership.PersonID + "::tenant::" + tenantID
		displayName := strings.TrimSpace(global.FirstName + " " + global.LastName)
		if nickname := strings.TrimSpace(global.Nickname); nickname != "" {
			if displayName != "" {
				displayName += " (" + nickname + ")"
			} else {
				displayName = nickname
			}
		}
		if displayName == "" {
			displayName = strings.TrimSpace(global.Email)
		}
		if err := tx.Table("authz_actors").Create(map[string]any{"id": actorID, "actor_key": actorKey, "display_name": displayName, "active": true, "created_at": now, "updated_at": now}).Error; err != nil {
			return err
		}
		if err := tx.Table("auth_account_actors").Create(map[string]any{"account_id": account.ID, "actor_id": actorID, "scope_type": "TENANT", "tenant_id": tenantID, "membership_id": membership.ID, "created_at": now, "updated_at": now}).Error; err != nil {
			return err
		}
	} else if err := tx.Table("authz_actors").Where("id = ?", actorID).Updates(map[string]any{"active": true, "updated_at": now}).Error; err != nil {
		return err
	}
	// Deliberately do not clear lifecycle_suspended. Previous delegated grants
	// remain historical until the Tenant explicitly grants each role again.
	return nil
}

func escapeLike(value string) string {
	return strings.NewReplacer(`!`, `!!`, `%`, `!%`, `_`, `!_`).Replace(value)
}

func globalPersonFromProjection(person db.Person) db.GlobalPerson {
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
