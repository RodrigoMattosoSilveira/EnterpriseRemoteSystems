package pricelists

import (
	"testing"

	"enterpriseremotesystems/backend/internal/authz"
)

func TestGoldPriceViewIsRestrictedOnlyForCollaboratorOnlyActors(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name      string
		delegated []authz.Permission
		want      bool
	}{
		{name: "collaborator with intrinsic read only is restricted", delegated: nil, want: true},
		{name: "tenant viewer sees full history", delegated: []authz.Permission{authz.PermissionGoldPricesRead}, want: false},
		{name: "tenant administrator sees full history", delegated: []authz.Permission{authz.PermissionGoldPricesManage}, want: false},
		{name: "application wildcard sees full history", delegated: []authz.Permission{authz.PermissionAll}, want: false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			actor := &authz.Actor{ID: "actor-1", DelegatedPermissions: map[authz.Permission]struct{}{}}
			for _, permission := range tc.delegated {
				actor.DelegatedPermissions[permission] = struct{}{}
			}
			if got := goldPriceViewIsRestricted(actor); got != tc.want {
				t.Fatalf("goldPriceViewIsRestricted() = %v, want %v", got, tc.want)
			}
		})
	}

	if goldPriceViewIsRestricted(nil) {
		t.Fatal("nil actor must not be treated as a restricted collaborator")
	}
}
