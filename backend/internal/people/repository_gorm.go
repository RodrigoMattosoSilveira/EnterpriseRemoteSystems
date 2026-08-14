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
		q = q.Where(
			`(COALESCE(gp.first_name, people.first_name) LIKE ?
			OR COALESCE(gp.last_name, people.last_name) LIKE ?
			OR COALESCE(gp.nickname, people.nickname) LIKE ?
			OR COALESCE(gp.cpf, people.cpf) LIKE ?
			OR COALESCE(gp.rg, people.rg) LIKE ?
			OR COALESCE(gp.cellular, people.cellular) LIKE ?
			OR COALESCE(gp.email, people.email) LIKE ?)`,
			like, like, like, like, like, like, like,
		)
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
		if err := tx.Create(&global).Error; err != nil {
			return err
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

		// Status and notes belong only to the originating Membership/Tenant.
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
		q = q.Where(`(first_name LIKE ? ESCAPE '!' OR last_name LIKE ? ESCAPE '!' OR nickname LIKE ? ESCAPE '!' OR cpf LIKE ? ESCAPE '!' OR rg LIKE ? ESCAPE '!' OR cellular LIKE ? ESCAPE '!' OR LOWER(email) LIKE LOWER(?) ESCAPE '!')`,
			like, like, like, like, like, like, like)
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
		legacy := legacyPersonFromGlobal(global, tenantID, strings.TrimSpace(req.StatusID), strings.TrimSpace(req.Notes), ids.New(), now)
		if err := tx.Create(&legacy).Error; err != nil {
			return err
		}
		legacyID := legacy.ID
		membership := db.PersonTenantMembership{
			BaseModel:      db.BaseModel{ID: ids.New(), CreatedAt: now, UpdatedAt: now},
			TenantID:       tenantID,
			PersonID:       global.ID,
			StatusID:       strings.TrimSpace(req.StatusID),
			Notes:          strings.TrimSpace(req.Notes),
			LegacyPersonID: &legacyID,
		}
		if err := tx.Create(&membership).Error; err != nil {
			return err
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
		if err := tx.WithContext(ctx).Create(&global).Error; err != nil {
			return nil, err
		}
	}
	now := time.Now().UTC()
	membership = db.PersonTenantMembership{
		BaseModel: db.BaseModel{ID: ids.New(), CreatedAt: now, UpdatedAt: now}, TenantID: tenantID,
		PersonID: global.ID, StatusID: legacy.StatusID, Notes: legacy.Notes, LegacyPersonID: &legacy.ID,
	}
	if err := tx.WithContext(ctx).Create(&membership).Error; err != nil {
		return nil, err
	}
	return &membership, nil
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
