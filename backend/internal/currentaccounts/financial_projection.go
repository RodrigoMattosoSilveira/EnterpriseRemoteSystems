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

	personID, err := financialOwnerPersonID(*collaborator)
	if err != nil {
		return nil, err
	}
	balances, err := s.repo.ListPersonBalances(ctx, personID)
	if err != nil {
		return nil, err
	}

	currentBRL, currentGold := projectionBalances(balances)
	today := dateOnlyUTC(time.Now().UTC())
	journeyEnd := dateOnlyUTC(collaborator.ProjectedEndDate)
	calendarPeriods := remainingProjectionPeriods(today, journeyEnd)
	methodCode := canonicalProjectionPaymentMethod(collaborator.PaymentMethod.Code)

	accrualPreview := AccrualProjectionRow{}
	postedPeriods := 0
	if calendarPeriods > 0 {
		accrualPreview, err = s.repo.AccrualProjectionForCollaborator(ctx, collaboratorID, today, journeyEnd)
		if err != nil {
			return nil, err
		}
		postedPeriods, err = s.repo.CountPostedEarningWorkPeriodDates(ctx, collaboratorID, today, journeyEnd)
		if err != nil {
			return nil, err
		}
	}

	readyPeriods := clampProjectionPeriodCount(accrualPreview.WorkPeriodDates, calendarPeriods-postedPeriods)
	estimatedPeriods := clampProjectionPeriodCount(calendarPeriods-postedPeriods-readyPeriods, calendarPeriods)

	result := &FinancialProjectionDTO{
		CollaboratorID:    collaborator.ID,
		CollaboratorLabel: collaboratorLabel(collaborator.Person),
		PaymentMethodCode: methodCode,
		CurrentBalances: ProjectionAmountsDTO{
			BRLAmount:      projectionFloat64Ptr(currentBRL),
			GoldGramAmount: projectionFloat64Ptr(currentGold),
		},
		UnpostedReadyEarnings: ProjectionAmountsDTO{
			BRLAmount:      projectionFloat64Ptr(roundBRL(accrualPreview.BRLAmount)),
			GoldGramAmount: projectionFloat64Ptr(roundGold(accrualPreview.GoldGramAmount)),
		},
		Projection: FinancialProjectionBasisDTO{
			ProjectionDate:             today.Format(dateLayout),
			JourneyEndDate:             journeyEnd.Format(dateLayout),
			PeriodsPerDay:              projectionPeriodsPerDay,
			RemainingWorkPeriods:       estimatedPeriods,
			CalendarWorkPeriods:        calendarPeriods,
			PostedWorkPeriods:          clampProjectionPeriodCount(postedPeriods, calendarPeriods),
			ReadyAccrualWorkPeriods:    readyPeriods,
			EstimatedFutureWorkPeriods: estimatedPeriods,
			PendingAccrualItems:        accrualPreview.PendingItems,
			LocationID:                 collaborator.LocationID,
			LocationLabel:              collaborator.Location.Label,
		},
	}
	if accrualPreview.PendingItems > 0 {
		result.Projection.Warning = ProjectionWarningPendingAccrualInputs
	}

	switch methodCode {
	case ProjectionMethodFixedBRL:
		monthly := projectionValueOrFallback(collaborator.FixedMonthlyBRLAmount, collaborator.PaymentValue)
		estimated := roundBRL(monthly / 30.0 * float64(estimatedPeriods))
		result.Projection.ProductionMethod = ProjectionMethodFixedBRL
		setProjectionBRL(result, currentBRL, accrualPreview.BRLAmount, currentGold, accrualPreview.GoldGramAmount, estimated)
	case ProjectionMethodDailyBRL:
		daily := projectionValueOrFallback(collaborator.DailyBRLAmount, collaborator.PaymentValue)
		estimated := roundBRL(daily * float64(estimatedPeriods))
		result.Projection.ProductionMethod = ProjectionMethodDailyBRL
		setProjectionBRL(result, currentBRL, accrualPreview.BRLAmount, currentGold, accrualPreview.GoldGramAmount, estimated)
	case ProjectionMethodGoldCommission:
		rows, err := s.repo.ListRecentDailyGoldProduction(ctx, collaborator.LocationID, 10)
		if err != nil {
			return nil, err
		}
		result.Projection.ProductionDatesAvailable = len(rows)
		productionValue, method, available := projectionProductionValue(rows)
		result.Projection.ProductionMethod = method
		if !available {
			if result.Projection.Warning == "" {
				result.Projection.Warning = ProjectionWarningNoGoldProductionHistory
			}
			result.EstimatedFutureEarnings = ProjectionAmountsDTO{BRLAmount: projectionFloat64Ptr(0), GoldGramAmount: nil}
			result.ProjectedEarnings = ProjectionAmountsDTO{BRLAmount: projectionFloat64Ptr(roundBRL(accrualPreview.BRLAmount)), GoldGramAmount: nil}
			result.ProjectedFinalBalances = ProjectionAmountsDTO{BRLAmount: projectionFloat64Ptr(roundBRL(currentBRL + accrualPreview.BRLAmount)), GoldGramAmount: nil}
			return result, nil
		}
		result.Projection.ProductionValueUsed = projectionFloat64Ptr(roundGold(productionValue))
		commissionPercent := projectionValueOrFallback(collaborator.GoldCommissionPercent, collaborator.PaymentValue)
		estimated := roundGold(productionValue * commissionPercent / 100.0 * float64(estimatedPeriods) * projectedCommissionAvailabilityFactor(collaborator.PlanningAvailability))
		setProjectionGold(result, currentBRL, accrualPreview.BRLAmount, currentGold, accrualPreview.GoldGramAmount, estimated)
	default:
		result.EstimatedFutureEarnings = ProjectionAmountsDTO{BRLAmount: projectionFloat64Ptr(0), GoldGramAmount: projectionFloat64Ptr(0)}
		result.ProjectedEarnings = ProjectionAmountsDTO{BRLAmount: projectionFloat64Ptr(roundBRL(accrualPreview.BRLAmount)), GoldGramAmount: projectionFloat64Ptr(roundGold(accrualPreview.GoldGramAmount))}
		result.ProjectedFinalBalances = ProjectionAmountsDTO{
			BRLAmount:      projectionFloat64Ptr(roundBRL(currentBRL + accrualPreview.BRLAmount)),
			GoldGramAmount: projectionFloat64Ptr(roundGold(currentGold + accrualPreview.GoldGramAmount)),
		}
	}

	return result, nil
}

func setProjectionBRL(result *FinancialProjectionDTO, currentBRL float64, readyBRL float64, currentGold float64, readyGold float64, estimatedBRL float64) {
	result.EstimatedFutureEarnings = ProjectionAmountsDTO{BRLAmount: projectionFloat64Ptr(estimatedBRL), GoldGramAmount: projectionFloat64Ptr(0)}
	result.ProjectedEarnings = ProjectionAmountsDTO{BRLAmount: projectionFloat64Ptr(roundBRL(readyBRL + estimatedBRL)), GoldGramAmount: projectionFloat64Ptr(roundGold(readyGold))}
	result.ProjectedFinalBalances = ProjectionAmountsDTO{BRLAmount: projectionFloat64Ptr(roundBRL(currentBRL + readyBRL + estimatedBRL)), GoldGramAmount: projectionFloat64Ptr(roundGold(currentGold + readyGold))}
}

func setProjectionGold(result *FinancialProjectionDTO, currentBRL float64, readyBRL float64, currentGold float64, readyGold float64, estimatedGold float64) {
	result.EstimatedFutureEarnings = ProjectionAmountsDTO{BRLAmount: projectionFloat64Ptr(0), GoldGramAmount: projectionFloat64Ptr(estimatedGold)}
	result.ProjectedEarnings = ProjectionAmountsDTO{BRLAmount: projectionFloat64Ptr(roundBRL(readyBRL)), GoldGramAmount: projectionFloat64Ptr(roundGold(readyGold + estimatedGold))}
	result.ProjectedFinalBalances = ProjectionAmountsDTO{BRLAmount: projectionFloat64Ptr(roundBRL(currentBRL + readyBRL)), GoldGramAmount: projectionFloat64Ptr(roundGold(currentGold + readyGold + estimatedGold))}
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

func clampProjectionPeriodCount(value int, max int) int {
	if value < 0 || max <= 0 {
		return 0
	}
	if value > max {
		return max
	}
	return value
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

func projectedCommissionAvailabilityFactor(planningAvailability string) float64 {
	switch strings.ToUpper(strings.TrimSpace(planningAvailability)) {
	case "DAY_OFF", "LEAVE_OF_ABSENCE":
		return 0.5
	default:
		return 1.0
	}
}
