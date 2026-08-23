package currentaccounts

import (
	"context"
	"testing"
	"time"

	"enterpriseremotesystems/backend/internal/db"
)

type financialProjectionPersonBalanceRepository struct {
	Repository
	collaborator               db.CollaboratorJourney
	personBalancePersonID      string
	journeyBalancesWereQueried bool
}

func (r *financialProjectionPersonBalanceRepository) FindCollaboratorByID(context.Context, string) (*db.CollaboratorJourney, error) {
	row := r.collaborator
	return &row, nil
}

func (r *financialProjectionPersonBalanceRepository) ListPersonBalances(_ context.Context, personID string) ([]BalanceRow, error) {
	r.personBalancePersonID = personID
	return []BalanceRow{{PersonID: personID, ValueUnitCode: "BRL", Balance: 125}}, nil
}

func (r *financialProjectionPersonBalanceRepository) ListBalances(context.Context, string) ([]BalanceRow, error) {
	r.journeyBalancesWereQueried = true
	return []BalanceRow{{ValueUnitCode: "BRL", Balance: 25}}, nil
}

func TestFinancialProjectionUsesPersonTenantCurrentBalanceAcrossJourneys(t *testing.T) {
	personID := "global-person-a"
	repo := &financialProjectionPersonBalanceRepository{
		collaborator: db.CollaboratorJourney{
			BaseModel:        db.BaseModel{ID: "journey-2"},
			ProjectedEndDate: time.Now().UTC().AddDate(0, 0, -1),
			Membership:       db.PersonTenantMembership{PersonID: personID},
			PaymentMethod:    db.ReferenceData{Code: "DAILY_BRL"},
		},
	}

	result, err := NewService(repo, "", "").FinancialProjection(context.Background(), repo.collaborator.ID)
	if err != nil {
		t.Fatalf("financial projection: %v", err)
	}
	if repo.personBalancePersonID != personID {
		t.Fatalf("expected Person-owned balance query for %q, got %q", personID, repo.personBalancePersonID)
	}
	if repo.journeyBalancesWereQueried {
		t.Fatal("financial projection must not derive its current balance from the selected Collaborator Journey")
	}
	if result.CurrentBalances.BRLAmount == nil || *result.CurrentBalances.BRLAmount != 125 {
		t.Fatalf("expected Person + Tenant current BRL balance 125, got %+v", result.CurrentBalances.BRLAmount)
	}
	if result.ProjectedFinalBalances.BRLAmount == nil || *result.ProjectedFinalBalances.BRLAmount != 125 {
		t.Fatalf("expected carried Person + Tenant final BRL balance 125, got %+v", result.ProjectedFinalBalances.BRLAmount)
	}
}
