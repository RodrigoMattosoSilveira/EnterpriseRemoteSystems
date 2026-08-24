package currentaccounts

import (
	"context"
	"testing"
	"time"

	"enterpriseremotesystems/backend/internal/db"
)

type financialProjectionJourneyBalanceRepository struct {
	Repository
	collaborator              db.CollaboratorJourney
	journeyBalanceID          string
	personBalancesWereQueried bool
}

func (r *financialProjectionJourneyBalanceRepository) FindCollaboratorByID(context.Context, string) (*db.CollaboratorJourney, error) {
	row := r.collaborator
	return &row, nil
}

func (r *financialProjectionJourneyBalanceRepository) ListBalances(_ context.Context, collaboratorID string) ([]BalanceRow, error) {
	r.journeyBalanceID = collaboratorID
	return []BalanceRow{{CollaboratorID: collaboratorID, ValueUnitCode: "BRL", Balance: 25}}, nil
}

func (r *financialProjectionJourneyBalanceRepository) ListPersonBalances(context.Context, string) ([]BalanceRow, error) {
	r.personBalancesWereQueried = true
	return []BalanceRow{{ValueUnitCode: "BRL", Balance: 125}}, nil
}

func TestFinancialProjectionUsesSelectedJourneyCurrentBalance(t *testing.T) {
	repo := &financialProjectionJourneyBalanceRepository{
		collaborator: db.CollaboratorJourney{
			BaseModel:        db.BaseModel{ID: "journey-2"},
			ProjectedEndDate: time.Now().UTC().AddDate(0, 0, -1),
			PaymentMethod:    db.ReferenceData{Code: "DAILY_BRL"},
		},
	}

	result, err := NewService(repo, "", "").FinancialProjection(context.Background(), repo.collaborator.ID)
	if err != nil {
		t.Fatalf("financial projection: %v", err)
	}
	if repo.journeyBalanceID != repo.collaborator.ID {
		t.Fatalf("expected Journey balance query for %q, got %q", repo.collaborator.ID, repo.journeyBalanceID)
	}
	if repo.personBalancesWereQueried {
		t.Fatal("financial projection must not carry Person + Tenant balances from prior Journeys into the selected Journey")
	}
	if result.CurrentBalances.BRLAmount == nil || *result.CurrentBalances.BRLAmount != 25 {
		t.Fatalf("expected selected Journey current BRL balance 25, got %+v", result.CurrentBalances.BRLAmount)
	}
	if result.ProjectedFinalBalances.BRLAmount == nil || *result.ProjectedFinalBalances.BRLAmount != 25 {
		t.Fatalf("expected selected Journey final BRL balance 25, got %+v", result.ProjectedFinalBalances.BRLAmount)
	}
}
