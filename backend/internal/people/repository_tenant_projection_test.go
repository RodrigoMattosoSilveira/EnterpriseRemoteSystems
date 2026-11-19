package people_test

import (
	"context"
	"testing"

	"enterpriseremotesystems/backend/internal/db"
)

// Tenant B view of a shared Global Person: global identity fields are the same in both Tenants,
// while membership status, membership id, and notes come only from the requesting Tenant.
func TestRepositoryPersonProjectionUsesOnlyRequestingTenantMembership(t *testing.T) {
	fx, cleanup := newPhotoFixture(t, true) // Person A: membership in default (A) and tenant-photo-other (B)
	defer cleanup()
	ctx := context.Background()

	if err := fx.database.Model(&db.PersonTenantMembership{}).Where("id = ?", "membership-photo-a").Update("notes", "TENANT A PRIVATE NOTE").Error; err != nil {
		t.Fatalf("set Tenant A note: %v", err)
	}
	if err := fx.database.Model(&db.PersonTenantMembership{}).Where("id = ?", "membership-photo-a-other").Update("notes", "TENANT B NOTE").Error; err != nil {
		t.Fatalf("set Tenant B note: %v", err)
	}

	asA, err := fx.repo.FindByID(ctx, db.DefaultTenantID, fx.personID)
	if err != nil {
		t.Fatalf("find as Tenant A: %v", err)
	}
	asB, err := fx.repo.FindByID(ctx, fx.otherTenantID, fx.personID)
	if err != nil {
		t.Fatalf("find as Tenant B: %v", err)
	}

	// Global identity is shared.
	if asA.ID != asB.ID || asA.GlobalPersonID != asB.GlobalPersonID || asA.FirstName != asB.FirstName || asA.CPF != asB.CPF {
		t.Fatalf("global identity must match across Tenants: A=%+v B=%+v", asA, asB)
	}

	// Tenant-specific fields come only from the requesting membership.
	if asB.TenantID != fx.otherTenantID || asB.MembershipID != "membership-photo-a-other" {
		t.Fatalf("Tenant B view must carry Tenant B membership, got tenant=%q membership=%q", asB.TenantID, asB.MembershipID)
	}
	if asB.Notes != "TENANT B NOTE" {
		t.Fatalf("Tenant B view must show only Tenant B notes, got %q", asB.Notes)
	}
	if asB.StatusID == asA.StatusID {
		t.Fatalf("Tenant B view must carry Tenant B status, but both Tenants show %q", asB.StatusID)
	}
	for _, leaked := range []string{asB.Notes, asB.MembershipID, asB.StatusID} {
		if leaked == "TENANT A PRIVATE NOTE" || leaked == "membership-photo-a" || leaked == asA.StatusID {
			t.Fatalf("Tenant A-only data leaked into the Tenant B view: %q", leaked)
		}
	}
}
