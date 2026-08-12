package people

import (
	"context"

	"gorm.io/gorm"

	db "enterpriseremotesystems/backend/internal/db"
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
		Where("tenant_id = ?", tenantID).
		Preload("Status")

	if filter.Search != "" {
		like := "%" + filter.Search + "%"
		q = q.Where(
			`(first_name LIKE ?
			OR last_name LIKE ?
			OR nickname LIKE ?
			OR cpf LIKE ?
			OR rg LIKE ?
			OR cellular LIKE ?
			OR email LIKE ?)`,
			like, like, like, like, like, like, like,
		)
	}

	if filter.StatusID != "" {
		q = q.Where("status_id = ?", filter.StatusID)
	}

	if filter.ProfileCompletionStatus != "" {
		q = q.Where("profile_completion_status = ?", filter.ProfileCompletionStatus)
	}

	if filter.CanCreateCollaborator != nil {
		q = q.Where("can_create_collaborator = ?", *filter.CanCreateCollaborator)
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

	err := q.
		Order("last_name ASC, first_name ASC").
		Limit(pageSize).
		Offset((page - 1) * pageSize).
		Find(&rows).Error

	return rows, total, err
}
func (r *gormRepository) Create(ctx context.Context, person *db.Person) error {
	return r.db.WithContext(ctx).Create(person).Error
}
func (r *gormRepository) FindByID(ctx context.Context, tenantID string, id string) (*db.Person, error) {
	var row db.Person
	err := r.db.WithContext(ctx).Preload("Status").First(&row, "id = ? AND tenant_id = ?", id, tenantID).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}
func (r *gormRepository) Update(ctx context.Context, tenantID string, person *db.Person) error {
	return r.db.WithContext(ctx).
		Model(&db.Person{}).
		Where("id = ? AND tenant_id = ?", person.ID, tenantID).
		Updates(map[string]any{
			"first_name":                person.FirstName,
			"last_name":                 person.LastName,
			"nickname":                  person.Nickname,
			"cpf":                       person.CPF,
			"rg":                        person.RG,
			"cellular":                  person.Cellular,
			"email":                     person.Email,
			"street1":                   person.Street1,
			"street2":                   person.Street2,
			"city":                      person.City,
			"state":                     person.State,
			"cep":                       person.CEP,
			"country":                   person.Country,
			"bank_name":                 person.BankName,
			"bank_number":               person.BankNumber,
			"checking_account":          person.CheckingAccount,
			"pix_key":                   person.PIXKey,
			"emergency_name":            person.EmergencyName,
			"emergency_cellular":        person.EmergencyCellular,
			"emergency_email":           person.EmergencyEmail,
			"profile_completion_status": person.ProfileCompletionStatus,
			"can_create_collaborator":   person.CanCreateCollaborator,
			"status_id":                 person.StatusID,
			"notes":                     person.Notes,
			"updated_at":                person.UpdatedAt,
		}).Error
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

func (r *gormRepository) UniqueConflicts(
	ctx context.Context,
	tenantID string,
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

	if pixKey != nil && *pixKey != "" {
		checks = append(checks, struct {
			field  string
			column string
			value  string
		}{field: "pixKey", column: "pix_key", value: *pixKey})
	}

	for _, check := range checks {
		query := r.db.WithContext(ctx).Model(&db.Person{}).Where("tenant_id = ?", tenantID).Where(check.column+" = ?", check.value)
		if excludeID != nil && *excludeID != "" {
			query = query.Where("id <> ?", *excludeID)
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
