package collaborators

import (
	"strings"
	"time"

	"enterpriseremotesystems/backend/internal/db"
)

const dateLayout = "2006-01-02"

func ToDTO(row db.CollaboratorJourney) CollaboratorDTO {
	person := row.Membership.Person
	return CollaboratorDTO{
		ID:                             row.ID,
		TenantID:                       row.TenantID,
		MembershipID:                   collaboratorMembershipID(row.MembershipID),
		PersonID:                       strings.TrimSpace(row.Membership.PersonID),
		PersonName:                     globalPersonName(person),
		PersonNickname:                 strings.TrimSpace(person.Nickname),
		JourneyStartDate:               formatDate(row.JourneyStartDate),
		DefaultEndDate:                 formatDate(row.DefaultEndDate),
		ExtensionDays:                  row.ExtensionDays,
		ProjectedEndDate:               formatDate(row.ProjectedEndDate),
		PaymentMethodID:                row.PaymentMethodID,
		PaymentMethodLabel:             row.PaymentMethod.Label,
		PaymentValue:                   paymentValueForCompatibility(row),
		FixedMonthlyBRLAmount:          row.FixedMonthlyBRLAmount,
		DailyBRLAmount:                 row.DailyBRLAmount,
		GoldCommissionPercent:          row.GoldCommissionPercent,
		TimeOffGoldSplitPercent:        row.TimeOffGoldSplitPercent,
		SickDayOffReplacementGoldGrams: row.SickDayOffReplacementGoldGrams,
		BonusBRLAmount:                 row.BonusBRLAmount,
		BonusDescription:               strings.TrimSpace(row.BonusDescription),
		BonusPostedAt:                  formatDateTimePtr(row.BonusPostedAt),
		BonusLedgerEntryID:             strings.TrimSpace(row.BonusLedgerEntryID),
		PlanningAvailability:           normalizePlanningAvailability(row.PlanningAvailability),
		SectorID:                       row.SectorID,
		SectorLabel:                    row.Sector.Label,
		LocationID:                     row.LocationID,
		LocationLabel:                  row.Location.Label,
		TaskID:                         row.TaskID,
		TaskLabel:                      row.Task.Label,
		StatusID:                       row.StatusID,
		StatusCode:                     row.Status.Code,
		StatusLabel:                    row.Status.Label,
		Notes:                          row.Notes,
		ClosedAt:                       formatDateTimePtr(row.ClosedAt),
		CreatedAt:                      row.CreatedAt.Format(time.RFC3339),
		UpdatedAt:                      row.UpdatedAt.Format(time.RFC3339),
	}
}

func paymentValueForCompatibility(row db.CollaboratorJourney) float64 {
	if row.PaymentValue > 0 {
		return row.PaymentValue
	}
	if row.DailyBRLAmount != nil {
		return *row.DailyBRLAmount
	}
	if row.FixedMonthlyBRLAmount != nil {
		return *row.FixedMonthlyBRLAmount
	}
	if row.GoldCommissionPercent != nil {
		return *row.GoldCommissionPercent
	}
	return 0
}

func ToDTOList(rows []db.CollaboratorJourney) []CollaboratorDTO {
	out := make([]CollaboratorDTO, 0, len(rows))
	for _, row := range rows {
		out = append(out, ToDTO(row))
	}
	return out
}

func collaboratorMembershipID(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}

func globalPersonName(person db.GlobalPerson) string {
	return strings.TrimSpace(strings.Join([]string{person.FirstName, person.LastName}, " "))
}

func parseDate(value string) (time.Time, error) {
	return time.Parse(dateLayout, strings.TrimSpace(value))
}

func formatDate(value time.Time) string {
	if value.IsZero() {
		return ""
	}
	return value.Format(dateLayout)
}

func formatDateTimePtr(value *time.Time) string {
	if value == nil || value.IsZero() {
		return ""
	}
	return value.UTC().Format(time.RFC3339)
}

func ToWorkCreditEvidenceDTO(record WorkCreditEvidenceRecord) WorkCreditEvidenceDTO {
	work := make([]WorkCreditWorkEvidenceDTO, 0, len(record.WorkRecognized))
	for _, row := range record.WorkRecognized {
		work = append(work, WorkCreditWorkEvidenceDTO{
			AssignmentID:      row.AssignmentID,
			WorkPeriodID:      row.WorkPeriodID,
			WorkDate:          row.WorkDate,
			PeriodCode:        row.PeriodCode,
			WorkPeriodName:    row.WorkPeriodName,
			WorkPeriodStatus:  row.WorkPeriodStatus,
			PlannedStatus:     row.PlannedStatus,
			ActualStatus:      row.ActualStatus,
			SectorID:          row.SectorID,
			SectorLabel:       row.SectorLabel,
			LocationID:        row.LocationID,
			LocationLabel:     row.LocationLabel,
			TaskID:            row.TaskID,
			TaskLabel:         row.TaskLabel,
			ProductionEntries: row.ProductionEntries,
			GoldGramsProduced: row.GoldGramsProduced,
		})
	}

	accruals := make([]WorkCreditAccrualEvidenceDTO, 0, len(record.EarningsCalculated))
	for _, row := range record.EarningsCalculated {
		accruals = append(accruals, WorkCreditAccrualEvidenceDTO{
			ID:                     row.ID,
			AccrualRunID:           row.AccrualRunID,
			AccrualRunStatus:       row.AccrualRunStatus,
			AccrualDate:            row.AccrualDate,
			WorkPeriodID:           row.WorkPeriodID,
			WorkDate:               row.WorkDate,
			WorkPeriodAssignmentID: row.WorkPeriodAssignmentID,
			CalculationType:        row.CalculationType,
			Direction:              row.Direction,
			BRLAmount:              row.BRLAmount,
			GoldGramAmount:         row.GoldGramAmount,
			Status:                 row.Status,
			PendingReason:          row.PendingReason,
			Description:            row.Description,
		})
	}

	postings := make([]WorkCreditAccountPostingDTO, 0, len(record.AccountPostings))
	for _, row := range record.AccountPostings {
		posting := WorkCreditAccountPostingDTO{
			ID:                   row.ID,
			EntryType:            row.EntryType,
			Direction:            row.Direction,
			Amount:               row.Amount,
			SignedAmount:         workCreditSignedAmount(row.Direction, row.Amount),
			ValueUnitCode:        row.ValueUnit.Code,
			ValueUnitLabel:       row.ValueUnit.Label,
			EffectiveDate:        formatDate(row.EffectiveDate),
			SourceType:           row.SourceType,
			SourceID:             row.SourceID,
			Description:          row.Description,
			Active:               row.Active,
			CorrectionType:       row.CorrectionType,
			RelatedEntryID:       collaboratorMembershipID(row.RelatedEntryID),
			CorrectionReasonCode: row.CorrectionReasonCode,
			CorrectionReasonText: row.CorrectionReasonText,
		}
		if row.Receipt != nil {
			posting.Receipt = &WorkCreditReceiptEvidenceDTO{
				ID:               row.Receipt.ID,
				ReceiptNumber:    collaboratorMembershipID(row.Receipt.ReceiptNumber),
				ReceiptPurpose:   strings.TrimSpace(row.Receipt.ReceiptPurpose),
				PaymentDirection: strings.TrimSpace(row.Receipt.PaymentDirection),
				AcceptingParty:   strings.TrimSpace(row.Receipt.AcceptingParty),
				Status:           strings.TrimSpace(row.Receipt.Status),
				Outstanding:      workCreditReceiptOutstanding(row.Receipt.Status),
				ReturnedAt:       formatDateTimePtr(row.Receipt.ReturnedAt),
				AcceptedAt:       formatDateTimePtr(row.Receipt.AcceptedAt),
			}
		}
		postings = append(postings, posting)
	}

	return WorkCreditEvidenceDTO{
		Journey:            ToDTO(record.Journey),
		WorkRecognized:     work,
		EarningsCalculated: accruals,
		AccountPostings:    postings,
	}
}

func workCreditSignedAmount(direction string, amount float64) float64 {
	if strings.EqualFold(strings.TrimSpace(direction), "DEBIT") {
		return -amount
	}
	return amount
}

func workCreditReceiptOutstanding(status string) bool {
	switch strings.ToUpper(strings.TrimSpace(status)) {
	case "PENDING_ISSUE", "ISSUED", "PRINTED", "SIGNED":
		return true
	default:
		return false
	}
}
