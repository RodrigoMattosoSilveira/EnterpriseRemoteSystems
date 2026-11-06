package workperiodassignments

import (
	"testing"

	"enterpriseremotesystems/backend/internal/db"
)

func TestByte353NextPlanWorkReferenceGuardsTenantTypeAndActive(t *testing.T) {
	id := "actual-ref"
	valid := &db.ReferenceData{
		BaseModel: db.BaseModel{ID: id},
		TenantID:  "tenant-a", Type: "sector", Label: "Actual Sector", Active: true,
	}
	for _, tc := range []struct {
		name string
		ref  *db.ReferenceData
		want string
	}{
		{name: "valid_actual", ref: valid, want: id},
		{name: "no_reference", ref: nil, want: "informed"},
		{name: "other_tenant", ref: &db.ReferenceData{BaseModel: db.BaseModel{ID: id}, TenantID: "tenant-b", Type: "sector", Active: true}, want: "informed"},
		{name: "wrong_type", ref: &db.ReferenceData{BaseModel: db.BaseModel{ID: id}, TenantID: "tenant-a", Type: "location", Active: true}, want: "informed"},
		{name: "inactive", ref: &db.ReferenceData{BaseModel: db.BaseModel{ID: id}, TenantID: "tenant-a", Type: "sector", Active: false}, want: "informed"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, label := nextPlanWorkReference("informed", "Informed Sector", &id, tc.ref, "tenant-a", "sector")
			if got != tc.want {
				t.Fatalf("got %q want %q", got, tc.want)
			}
			if tc.want == "informed" && label != "Informed Sector" {
				t.Fatalf("fallback label is %q, want Informed Sector", label)
			}
			if tc.want == id && label != "Actual Sector" {
				t.Fatalf("actual label is %q, want Actual Sector", label)
			}
		})
	}
}
