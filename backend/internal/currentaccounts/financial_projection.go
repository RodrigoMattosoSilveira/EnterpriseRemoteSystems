package currentaccounts

import (
	"context"
	"math"
	"sort"
	"strings"
	"time"
)

const projectionPeriodsPerDay = 1

func (s *service) FinancialProjection(ctx context.Context, collaboratorID string) (*FinancialProjectionDTO, error) {
	collaboratorID = strings.TrimSpace(collaboratorID)
	collaborator, err := s.repo.FindCollaboratorByID(ctx, collaboratorID)
	if err != nil {
		return nil, err
	}

	balances, err := s.repo.ListBalances(ctx, collaboratorID)
	if err != nil {
		return nil, err
	}

	currentBRL, currentGold := projectionBalances(balances)
	today := dateOnlyUTC(time.Now().UTC())
	journeyEnd := dateOnlyUTC(collaborator.ProjectedEndDate)
	remainingPeriods := remainingProjectionPeriods(today, journeyEnd)
	methodCode := canonicalProjectionPaymentMethod(collaborator.PaymentMethod.Code)

	result := &FinancialProjectionDTO{
		CollaboratorID:    collaborator.ID,
		CollaboratorLabel: collaboratorLabel(collaborator.Person),
		PaymentMethodCode: methodCode,
		CurrentBalances: ProjectionAmountsDTO{
			BRLAmount:      projectionFloat64Ptr(currentBRL),
			GoldGramAmount: projectionFloat64Ptr(currentGold),
		},
		Projection: FinancialProjectionBasisDTO{
			ProjectionDate:       today.Format(dateLayout),
			JourneyEndDate:       journeyEnd.Format(dateLayout),
			PeriodsPerDay:        projectionPeriodsPerDay,
			RemainingWorkPeriods: remainingPeriods,
			LocationID:           collaborator.LocationID,
			LocationLabel:        collaborator.Location.Label,
		},
	}

	switch methodCode {
	case ProjectionMethodFixedBRL:
		monthly := projectionValueOrFallback(collaborator.FixedMonthlyBRLAmount, collaborator.PaymentValue)
		projected := roundBRL(monthly / 30.0 * float64(remainingPeriods))
		result.ProjectedEarnings = ProjectionAmountsDTO{BRLAmount: projectionFloat64Ptr(projected), GoldGramAmount: projectionFloat64Ptr(0)}
		result.ProjectedFinalBalances = ProjectionAmountsDTO{BRLAmount: projectionFloat64Ptr(roundBRL(currentBRL + projected)), GoldGramAmount: projectionFloat64Ptr(currentGold)}
		result.Projection.ProductionMethod = ProjectionMethodFixedBRL
	case ProjectionMethodDailyBRL:
		daily := projectionValueOrFallback(collaborator.DailyBRLAmount, collaborator.PaymentValue)
		projected := roundBRL(daily * float64(remainingPeriods))
		result.ProjectedEarnings = ProjectionAmountsDTO{BRLAmount: projectionFloat64Ptr(projected), GoldGramAmount: projectionFloat64Ptr(0)}
		result.ProjectedFinalBalances = ProjectionAmountsDTO{BRLAmount: projectionFloat64Ptr(roundBRL(currentBRL + projected)), GoldGramAmount: projectionFloat64Ptr(currentGold)}
		result.Projection.ProductionMethod = ProjectionMethodDailyBRL
	case ProjectionMethodGoldCommission:
		rows, err := s.repo.ListRecentDailyGoldProduction(ctx, collaborator.LocationID, 10)
		if err != nil {
			return nil, err
		}
		result.Projection.ProductionDatesAvailable = len(rows)
		productionValue, method, available := projectionProductionValue(rows)
		result.Projection.ProductionMethod = method
		if !available {
			result.Projection.Warning = ProjectionWarningNoGoldProductionHistory
			result.ProjectedEarnings = ProjectionAmountsDTO{BRLAmount: projectionFloat64Ptr(0), GoldGramAmount: nil}
			result.ProjectedFinalBalances = ProjectionAmountsDTO{BRLAmount: projectionFloat64Ptr(currentBRL), GoldGramAmount: nil}
			return result, nil
		}
		result.Projection.ProductionValueUsed = projectionFloat64Ptr(roundGold(productionValue))
		commissionPercent := projectionValueOrFallback(collaborator.GoldCommissionPercent, collaborator.PaymentValue)
		projected := roundGold(productionValue * commissionPercent / 100.0 * float64(remainingPeriods))
		result.ProjectedEarnings = ProjectionAmountsDTO{BRLAmount: projectionFloat64Ptr(0), GoldGramAmount: projectionFloat64Ptr(projected)}
		result.ProjectedFinalBalances = ProjectionAmountsDTO{BRLAmount: projectionFloat64Ptr(currentBRL), GoldGramAmount: projectionFloat64Ptr(roundGold(currentGold + projected))}
	default:
		result.ProjectedEarnings = ProjectionAmountsDTO{BRLAmount: projectionFloat64Ptr(0), GoldGramAmount: projectionFloat64Ptr(0)}
		result.ProjectedFinalBalances = ProjectionAmountsDTO{BRLAmount: projectionFloat64Ptr(currentBRL), GoldGramAmount: projectionFloat64Ptr(currentGold)}
	}

	return result, nil
}

func projectionBalances(rows []BalanceRow) (float64, float64) {
	var brl float64
	var gold float64
	for _, row := range rows {
		switch strings.ToUpper(strings.TrimSpace(row.ValueUnitCode)) {
		case "BRL":
			brl = row.Balance
		case "GOLD_GRAM":
			gold = row.Balance
		}
	}
	return projectionNormalizedZero(brl), projectionNormalizedZero(gold)
}

func canonicalProjectionPaymentMethod(code string) string {
	switch strings.ToUpper(strings.TrimSpace(code)) {
	case "DAILY", "DAILY_WAGES", "DAILY_BRL":
		return ProjectionMethodDailyBRL
	case "SALARY", "FIXED_BRL":
		return ProjectionMethodFixedBRL
	case "COMMISSION", "GOLD_COMMISSION":
		return ProjectionMethodGoldCommission
	default:
		return strings.ToUpper(strings.TrimSpace(code))
	}
}

func projectionProductionValue(rows []DailyGoldProductionRow) (float64, string, bool) {
	if len(rows) >= 10 {
		values := make([]float64, 10)
		for i := range 10 {
			values[i] = rows[i].GoldGrams
		}
		sort.Float64s(values)
		return values[4], ProjectionMethodDiscreteLowerMedianLast10, true
	}
	for _, row := range rows {
		if math.Abs(row.GoldGrams) > 0.00000001 {
			return row.GoldGrams, ProjectionMethodMostRecentNonZero, true
		}
	}
	return 0, "", false
}

func remainingProjectionPeriods(start, end time.Time) int {
	start = dateOnlyUTC(start)
	end = dateOnlyUTC(end)
	if end.Before(start) {
		return 0
	}
	return int(end.Sub(start).Hours()/24) + 1
}

func dateOnlyUTC(value time.Time) time.Time {
	value = value.UTC()
	return time.Date(value.Year(), value.Month(), value.Day(), 0, 0, 0, 0, time.UTC)
}

func projectionValueOrFallback(value *float64, fallback float64) float64 {
	if value != nil {
		return *value
	}
	return fallback
}

func projectionNormalizedZero(value float64) float64 {
	if math.Abs(value) <= 0.00000001 {
		return 0
	}
	return value
}

func projectionFloat64Ptr(value float64) *float64 { return &value }
func roundBRL(value float64) float64              { return math.Round(value*100) / 100 }
func roundGold(value float64) float64             { return math.Round(value*100000000) / 100000000 }
