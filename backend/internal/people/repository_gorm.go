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
	filter PersonListFilter,
) ([]db.Person, int64, error) {
	var rows []db.Person
	var total int64

	q := r.db.WithContext(ctx).
		Model(&db.Person{}).
		Preload("Status")

	if filter.Search != "" {
		like := "%" + filter.Search + "%"
		q = q.Where(
			`first_name LIKE ?
			OR last_name LIKE ?
			OR nickname LIKE ?
			OR cpf LIKE ?
			OR rg LIKE ?
			OR cellular LIKE ?
			OR email LIKE ?`,
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
func (r *gormRepository) FindByID(ctx context.Context, id string) (*db.Person, error) {
	var row db.Person
	err := r.db.WithContext(ctx).First(&row, "id = ?", id).Error
	if err != nil {
		return nil, err
	}
	return &row, nil
}
func (r *gormRepository) Update(ctx context.Context, person *db.Person) error {
	return r.db.WithContext(ctx).Save(person).Error
}
func (r *gormRepository) ExistsByUniqueFields(
	ctx context.Context,
	cpf string,
	rg string,
	cellular string,
	email string,
	pixKey *string,
	excludeID *string,
) (bool, error) {
	var count int64

	query := r.db.WithContext(ctx).Model(&db.Person{})

	if excludeID != nil && *excludeID != "" {
		query = query.Where("id <> ?", *excludeID)
	}

	conditions := r.db.
		Where("cpf = ?", cpf).
		Or("rg = ?", rg).
		Or("cellular = ?", cellular).
		Or("email = ?", email)

	if pixKey != nil && *pixKey != "" {
		conditions = conditions.Or("pix_key = ?", *pixKey)
	}

	if err := query.Where(conditions).Count(&count).Error; err != nil {
		return false, err
	}

	return count > 0, nil
}
