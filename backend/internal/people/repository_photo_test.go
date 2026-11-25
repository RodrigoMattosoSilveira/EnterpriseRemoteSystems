package people_test

import (
	"bytes"
	"context"
	"errors"
	"image"
	"testing"
	"time"

	"enterpriseremotesystems/backend/internal/db"
	"enterpriseremotesystems/backend/internal/people"
	"gorm.io/gorm"
)

// photoFixture is a Global Person with a membership in the default Tenant and,
// optionally, in a second Tenant. It exercises the same tables the photo
// endpoints write through, using the real gorm repository.
type photoFixture struct {
	repo          people.Repository
	database      *gorm.DB
	personID      string
	otherPersonID string
	otherTenantID string
}

func newPhotoFixture(t *testing.T, withOtherTenantMembership bool) (*photoFixture, func()) {
	t.Helper()
	database, cleanup := newRepositoryTestDB(t)
	now := time.Now().UTC()
	otherTenantID := "tenant-photo-other"

	if err := database.Create(&db.Tenant{
		BaseModel:   db.BaseModel{ID: otherTenantID, CreatedAt: now, UpdatedAt: now},
		Code:        "PHOTOOTHER",
		Name:        "Photo Other Tenant",
		Description: "Tenant for photo isolation tests",
		Active:      true,
	}).Error; err != nil {
		cleanup()
		t.Fatalf("create other tenant: %v", err)
	}
	if err := db.SeedTenantData(database, otherTenantID); err != nil {
		cleanup()
		t.Fatalf("seed other tenant: %v", err)
	}
	var otherActive db.ReferenceData
	if err := database.First(&otherActive, "tenant_id = ? AND type = ? AND code = ?", otherTenantID, "person_status", "ACTIVE").Error; err != nil {
		cleanup()
		t.Fatalf("find other Tenant ACTIVE status: %v", err)
	}

	personA := db.GlobalPerson{
		BaseModel: db.BaseModel{ID: "global-photo-a", CreatedAt: now, UpdatedAt: now},
		FirstName: "Photo", LastName: "Alpha", Nickname: "Alpha",
		CPF: "39053344705", RG: "RG-PHOTO-A", Cellular: "11998765432", Email: "photo-a@example.com",
		Country: "Brasil", ProfileCompletionStatus: "PERSONAL_ONLY", OperationalActive: true,
	}
	personB := db.GlobalPerson{
		BaseModel: db.BaseModel{ID: "global-photo-b", CreatedAt: now, UpdatedAt: now},
		FirstName: "Photo", LastName: "Beta", Nickname: "Beta",
		CPF: "93541134780", RG: "RG-PHOTO-B", Cellular: "11987654321", Email: "photo-b@example.com",
		Country: "Brasil", ProfileCompletionStatus: "PERSONAL_ONLY", OperationalActive: true,
	}
	if err := database.Create(&[]db.GlobalPerson{personA, personB}).Error; err != nil {
		cleanup()
		t.Fatalf("create global People: %v", err)
	}
	memberships := []db.PersonTenantMembership{
		{BaseModel: db.BaseModel{ID: "membership-photo-a", CreatedAt: now, UpdatedAt: now}, TenantID: db.DefaultTenantID, PersonID: personA.ID, StatusID: "ref-person-status-active"},
		{BaseModel: db.BaseModel{ID: "membership-photo-b", CreatedAt: now, UpdatedAt: now}, TenantID: db.DefaultTenantID, PersonID: personB.ID, StatusID: "ref-person-status-active"},
	}
	if withOtherTenantMembership {
		memberships = append(memberships, db.PersonTenantMembership{
			BaseModel: db.BaseModel{ID: "membership-photo-a-other", CreatedAt: now, UpdatedAt: now},
			TenantID:  otherTenantID, PersonID: personA.ID, StatusID: otherActive.ID,
		})
	}
	if err := database.Create(&memberships).Error; err != nil {
		cleanup()
		t.Fatalf("create memberships: %v", err)
	}

	return &photoFixture{
		repo:          people.NewRepository(database),
		database:      database,
		personID:      personA.ID,
		otherPersonID: personB.ID,
		otherTenantID: otherTenantID,
	}, cleanup
}

func photoRecord(t *testing.T, data []byte, contentType string) *db.GlobalPersonPhoto {
	t.Helper()
	cfg, format, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil {
		t.Fatalf("decode test photo: %v", err)
	}
	if contentType == "image/png" && format != "png" {
		t.Fatalf("test fixture mismatch: %s data is %s", contentType, format)
	}
	now := time.Now().UTC()
	return &db.GlobalPersonPhoto{
		ContentType: contentType,
		Data:        data,
		ByteSize:    len(data),
		Width:       cfg.Width,
		Height:      cfg.Height,
		UpdatedBy:   "test-admin",
		CreatedAt:   now,
		UpdatedAt:   now,
	}
}

func assertPhotoEquals(t *testing.T, got *db.GlobalPersonPhoto, want []byte, width, height int) {
	t.Helper()
	if got == nil {
		t.Fatalf("expected a stored photo, got nil")
	}
	if !bytes.Equal(got.Data, want) {
		t.Fatalf("stored photo bytes differ from expected (got %d bytes, want %d)", len(got.Data), len(want))
	}
	if got.Width != width || got.Height != height {
		t.Fatalf("expected %dx%d, got %dx%d", width, height, got.Width, got.Height)
	}
}

func countPhotoRows(t *testing.T, database *gorm.DB, personID string) int64 {
	t.Helper()
	var count int64
	if err := database.Model(&db.GlobalPersonPhoto{}).Where("person_id = ?", personID).Count(&count).Error; err != nil {
		t.Fatalf("count photo rows: %v", err)
	}
	return count
}

// Collaborator upload: a valid photo is persisted against the Global Person.
func TestRepositoryPhotoUploadPersistsOnGlobalPerson(t *testing.T) {
	fx, cleanup := newPhotoFixture(t, false)
	defer cleanup()
	ctx := context.Background()
	data := pngBytes(t, 96, 80)

	if err := fx.repo.UpsertPhoto(ctx, db.DefaultTenantID, fx.personID, photoRecord(t, data, "image/png")); err != nil {
		t.Fatalf("upsert photo: %v", err)
	}
	got, err := fx.repo.GetPhoto(ctx, db.DefaultTenantID, fx.personID)
	if err != nil {
		t.Fatalf("get photo after upload: %v", err)
	}
	assertPhotoEquals(t, got, data, 96, 80)
	if got.ContentType != "image/png" {
		t.Fatalf("expected image/png, got %q", got.ContentType)
	}
	if got.PersonID != fx.personID {
		t.Fatalf("photo must be keyed by the Global Person %q, got %q", fx.personID, got.PersonID)
	}
}

// Collaborator replacement: a second upload overwrites the first and leaves one row.
func TestRepositoryPhotoReplacementOverwritesExisting(t *testing.T) {
	fx, cleanup := newPhotoFixture(t, false)
	defer cleanup()
	ctx := context.Background()
	first := pngBytes(t, 96, 80)
	second := pngBytes(t, 120, 120)

	if err := fx.repo.UpsertPhoto(ctx, db.DefaultTenantID, fx.personID, photoRecord(t, first, "image/png")); err != nil {
		t.Fatalf("first upsert: %v", err)
	}
	if err := fx.repo.UpsertPhoto(ctx, db.DefaultTenantID, fx.personID, photoRecord(t, second, "image/png")); err != nil {
		t.Fatalf("replacement upsert: %v", err)
	}
	got, err := fx.repo.GetPhoto(ctx, db.DefaultTenantID, fx.personID)
	if err != nil {
		t.Fatalf("get replaced photo: %v", err)
	}
	assertPhotoEquals(t, got, second, 120, 120)
	if rows := countPhotoRows(t, fx.database, fx.personID); rows != 1 {
		t.Fatalf("replacement must keep a single photo row, found %d", rows)
	}
}

// Collaborator deletion: the photo is removed and stays absent.
func TestRepositoryPhotoDeleteRemovesAndStaysAbsent(t *testing.T) {
	fx, cleanup := newPhotoFixture(t, false)
	defer cleanup()
	ctx := context.Background()
	data := pngBytes(t, 96, 80)

	if err := fx.repo.UpsertPhoto(ctx, db.DefaultTenantID, fx.personID, photoRecord(t, data, "image/png")); err != nil {
		t.Fatalf("upsert photo: %v", err)
	}
	if err := fx.repo.DeletePhoto(ctx, db.DefaultTenantID, fx.personID); err != nil {
		t.Fatalf("delete photo: %v", err)
	}
	if _, err := fx.repo.GetPhoto(ctx, db.DefaultTenantID, fx.personID); !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("expected deleted photo to be absent (ErrRecordNotFound), got %v", err)
	}
	if rows := countPhotoRows(t, fx.database, fx.personID); rows != 0 {
		t.Fatalf("expected no photo rows after delete, found %d", rows)
	}
	if err := fx.repo.DeletePhoto(ctx, db.DefaultTenantID, fx.personID); err != nil {
		t.Fatalf("second delete should be a no-op, got %v", err)
	}
}

// Other Person: writes and deletes for one Global Person never touch another's photo.
func TestRepositoryPhotoWritesAreIsolatedPerPerson(t *testing.T) {
	fx, cleanup := newPhotoFixture(t, false)
	defer cleanup()
	ctx := context.Background()
	dataA := pngBytes(t, 96, 80)
	dataB := pngBytes(t, 100, 100)

	if err := fx.repo.UpsertPhoto(ctx, db.DefaultTenantID, fx.personID, photoRecord(t, dataA, "image/png")); err != nil {
		t.Fatalf("upsert A: %v", err)
	}
	if err := fx.repo.UpsertPhoto(ctx, db.DefaultTenantID, fx.otherPersonID, photoRecord(t, dataB, "image/png")); err != nil {
		t.Fatalf("upsert B: %v", err)
	}
	if err := fx.repo.DeletePhoto(ctx, db.DefaultTenantID, fx.otherPersonID); err != nil {
		t.Fatalf("delete B: %v", err)
	}
	got, err := fx.repo.GetPhoto(ctx, db.DefaultTenantID, fx.personID)
	if err != nil {
		t.Fatalf("person A photo should survive deletion of person B: %v", err)
	}
	assertPhotoEquals(t, got, dataA, 96, 80)
}

// Cross-Tenant denial: a Tenant with no membership for the Person cannot write or delete the photo,
// and the existing photo is unchanged.
func TestRepositoryPhotoCrossTenantWriteAndDeleteAreRejected(t *testing.T) {
	fx, cleanup := newPhotoFixture(t, false) // Person A is only a member of the default Tenant
	defer cleanup()
	ctx := context.Background()
	existing := pngBytes(t, 96, 80)
	attempt := pngBytes(t, 120, 120)

	if err := fx.repo.UpsertPhoto(ctx, db.DefaultTenantID, fx.personID, photoRecord(t, existing, "image/png")); err != nil {
		t.Fatalf("seed photo in member Tenant: %v", err)
	}
	if err := fx.repo.UpsertPhoto(ctx, fx.otherTenantID, fx.personID, photoRecord(t, attempt, "image/png")); err == nil {
		t.Fatalf("expected cross-Tenant upload to be rejected")
	}
	if err := fx.repo.DeletePhoto(ctx, fx.otherTenantID, fx.personID); err == nil {
		t.Fatalf("expected cross-Tenant delete to be rejected")
	}
	got, err := fx.repo.GetPhoto(ctx, db.DefaultTenantID, fx.personID)
	if err != nil {
		t.Fatalf("existing photo must survive rejected cross-Tenant writes: %v", err)
	}
	assertPhotoEquals(t, got, existing, 96, 80)
	if _, err := fx.repo.GetPhoto(ctx, fx.otherTenantID, fx.personID); err == nil {
		t.Fatalf("cross-Tenant read must not expose the photo")
	}
	if rows := countPhotoRows(t, fx.database, fx.personID); rows != 1 {
		t.Fatalf("cross-Tenant attempts must not change photo rows, found %d", rows)
	}
}

// Global Person sharing (MT-09 at repository level): a photo written through one membership
// is returned through the other membership, and deletion through either removes it for both.
func TestRepositoryPhotoIsSharedAcrossMembershipsOfOneGlobalPerson(t *testing.T) {
	fx, cleanup := newPhotoFixture(t, true) // Person A is a member of default and other Tenant
	defer cleanup()
	ctx := context.Background()
	data := pngBytes(t, 96, 80)

	if err := fx.repo.UpsertPhoto(ctx, db.DefaultTenantID, fx.personID, photoRecord(t, data, "image/png")); err != nil {
		t.Fatalf("upload through Tenant A: %v", err)
	}
	got, err := fx.repo.GetPhoto(ctx, fx.otherTenantID, fx.personID)
	if err != nil {
		t.Fatalf("photo should be visible through Tenant B membership: %v", err)
	}
	assertPhotoEquals(t, got, data, 96, 80)

	if err := fx.repo.DeletePhoto(ctx, fx.otherTenantID, fx.personID); err != nil {
		t.Fatalf("delete through Tenant B membership: %v", err)
	}
	if _, err := fx.repo.GetPhoto(ctx, db.DefaultTenantID, fx.personID); !errors.Is(err, gorm.ErrRecordNotFound) {
		t.Fatalf("deletion through one membership must remove the shared photo, got %v", err)
	}
}
