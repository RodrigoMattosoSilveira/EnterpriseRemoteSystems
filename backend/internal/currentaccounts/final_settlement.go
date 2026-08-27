package currentaccounts

import (
	"context"
	"errors"
	"math"
	"strings"
	"time"

	"enterpriseremotesystems/backend/internal/db"
	"enterpriseremotesystems/backend/internal/shared/ids"
	"enterpriseremotesystems/backend/internal/shared/tenantctx"
	"gorm.io/gorm"
)

const (
	settlementTypeFinalTenantPayment       = "FINAL_TENANT_PAYMENT"
	settlementTypeFinalCollaboratorPayment = "FINAL_COLLABORATOR_PAYMENT"
	ledgerEntryTypeFinalSettlement         = "FINAL_SETTLEMENT"
)

var (
	ErrNoTenantOwedBalance       = errors.New("Journey has no positive balance owed by the Tenant")
	ErrNoCollaboratorOwedBalance = errors.New("Journey has no negative balance owed by the Collaborator")
)

func (s *service) FinalTenantPayment(ctx context.Context, collaboratorID, authorizedBy string, req FinalSettlementRequest) (*FinalSettlementResult, error) {
	return s.postFinalSettlement(ctx, collaboratorID, authorizedBy, req, true)
}

func (s *service) FinalCollaboratorPayment(ctx context.Context, collaboratorID, authorizedBy string, req FinalSettlementRequest) (*FinalSettlementResult, error) {
	return s.postFinalSettlement(ctx, collaboratorID, authorizedBy, req, false)
}

func (s *service) postFinalSettlement(ctx context.Context, collaboratorID, authorizedBy string, req FinalSettlementRequest, tenantPays bool) (*FinalSettlementResult, error) {
	collaboratorID = strings.TrimSpace(collaboratorID)
	requestID := strings.TrimSpace(req.RequestID)
	if err := ValidateFinalSettlementRequest(req, authorizedBy); err != nil {
		return nil, err
	}
	if err := s.requireSecondApprovalWhenConfigured(ctx, tenantctx.TenantID(ctx), req.CorrectionReasonRequest, authorizedBy); err != nil {
		return nil, err
	}
	collaborator, err := s.repo.FindCollaboratorByID(ctx, collaboratorID)
	if err != nil {
		return nil, err
	}
	if strings.EqualFold(strings.TrimSpace(collaborator.Status.Code), "FINISHED") || collaborator.ClosedAt != nil {
		return nil, ErrJourneyAlreadyClosed
	}
	personID, err := financialOwnerPersonID(*collaborator)
	if err != nil {
		return nil, err
	}

	if existing, err := s.repo.FindSettlementByRequestID(ctx, collaboratorID, requestID); err == nil {
		entries, entryErr := s.repo.FindLedgerEntriesBySource(ctx, ledgerSourceSettlement, existing.ID)
		if entryErr != nil {
			return nil, entryErr
		}
		return finalSettlementResult(*existing, entries), nil
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	balances, err := s.repo.ListBalances(ctx, collaboratorID)
	if err != nil {
		return nil, err
	}
	var brlAmount, goldAmount float64
	for _, balance := range balances {
		amount := normalizedZero(balance.Balance)
		if tenantPays && amount <= 0 {
			continue
		}
		if !tenantPays && amount >= 0 {
			continue
		}
		magnitude := math.Abs(amount)
		switch balance.ValueUnitCode {
		case valueUnitBRL:
			brlAmount = magnitude
		case valueUnitGoldGram:
			goldAmount = magnitude
		}
	}
	if brlAmount == 0 && goldAmount == 0 {
		if tenantPays {
			return nil, ErrNoTenantOwedBalance
		}
		return nil, ErrNoCollaboratorOwedBalance
	}

	effectiveDate, _ := parseDate(req.EffectiveDate)
	now := time.Now().UTC()
	actor := strings.TrimSpace(authorizedBy)
	reasonCode, reasonText := normalizedCorrectionReason(req.CorrectionReasonRequest)
	secondApprovedBy, secondApprovalNotes := normalizedSecondApproval(req.CorrectionReasonRequest)
	secondApprovedAt := optionalApprovalTime(secondApprovedBy, now)
	settlementType := settlementTypeFinalTenantPayment
	direction := "DEBIT"
	description := "Final Journey payment from Tenant to Collaborator"
	if !tenantPays {
		settlementType = settlementTypeFinalCollaboratorPayment
		direction = "CREDIT"
		description = "Final Journey payment from Collaborator to Tenant"
	}
	if strings.TrimSpace(req.Notes) != "" {
		description = strings.TrimSpace(req.Notes)
	}
	settlement := db.JourneySettlement{
		BaseModel:           db.BaseModel{ID: "journey-settlement-" + ids.New(), CreatedAt: now, UpdatedAt: now},
		TenantID:            tenantctx.TenantID(ctx),
		CollaboratorID:      collaboratorID,
		SettlementType:      settlementType,
		RequestID:           requestID,
		Status:              settlementStatusPosted,
		EffectiveDate:       effectiveDate,
		BRLAmount:           brlAmount,
		GoldGramAmount:      goldAmount,
		Notes:               strings.TrimSpace(req.Notes),
		ReasonCode:          reasonCode,
		ReasonText:          reasonText,
		AuthorizedBy:        actor,
		AuthorizedAt:        &now,
		SecondApprovedBy:    secondApprovedBy,
		SecondApprovedAt:    secondApprovedAt,
		SecondApprovalNotes: secondApprovalNotes,
	}

	entries := make([]*db.LedgerEntry, 0, 2)
	if brlAmount > 0 {
		valueUnit, findErr := s.repo.FindValueUnitByCode(ctx, valueUnitBRL)
		if findErr != nil {
			return nil, findErr
		}
		entries = append(entries, finalSettlementLedgerEntry(settlement, personID, *valueUnit, direction, brlAmount, actor, description, effectiveDate, now))
	}
	if goldAmount > 0 {
		valueUnit, findErr := s.repo.FindValueUnitByCode(ctx, valueUnitGoldGram)
		if findErr != nil {
			return nil, findErr
		}
		entries = append(entries, finalSettlementLedgerEntry(settlement, personID, *valueUnit, direction, goldAmount, actor, description, effectiveDate, now))
	}
	if err := s.repo.CreateSettlementWithEntries(ctx, &settlement, entries...); err != nil {
		return nil, err
	}
	rows, err := s.repo.FindLedgerEntriesBySource(ctx, ledgerSourceSettlement, settlement.ID)
	if err != nil {
		return nil, err
	}
	return finalSettlementResult(settlement, rows), nil
}

func finalSettlementLedgerEntry(settlement db.JourneySettlement, personID string, valueUnit db.ReferenceData, direction string, amount float64, actor, description string, effectiveDate, now time.Time) *db.LedgerEntry {
	return &db.LedgerEntry{
		BaseModel:            db.BaseModel{ID: "ledger-final-settlement-" + ids.New(), CreatedAt: now, UpdatedAt: now},
		TenantID:             settlement.TenantID,
		PersonID:             personID,
		CollaboratorID:       settlement.CollaboratorID,
		ValueUnitID:          valueUnit.ID,
		ValueUnit:            valueUnit,
		EntryType:            ledgerEntryTypeFinalSettlement,
		Direction:            direction,
		Amount:               amount,
		EffectiveDate:        effectiveDate,
		SourceType:           ledgerSourceSettlement,
		SourceID:             settlement.ID,
		Description:          description,
		Active:               true,
		CorrectionReason:     settlement.ReasonText,
		CorrectionReasonCode: settlement.ReasonCode,
		CorrectionReasonText: settlement.ReasonText,
		CorrectionType:       "ORIGINAL",
		AuthorizedBy:         actor,
		AuthorizedAt:         &now,
		SecondApprovedBy:     settlement.SecondApprovedBy,
		SecondApprovedAt:     settlement.SecondApprovedAt,
		SecondApprovalNotes:  settlement.SecondApprovalNotes,
	}
}

func finalSettlementResult(settlement db.JourneySettlement, entries []db.LedgerEntry) *FinalSettlementResult {
	return &FinalSettlementResult{
		Settlement:    journeySettlementDTO(settlement),
		LedgerEntries: ToLedgerEntryDTOList(entries),
	}
}

func journeySettlementDTO(settlement db.JourneySettlement) JourneySettlementDTO {
	return JourneySettlementDTO{
		ID:                  settlement.ID,
		CollaboratorID:      settlement.CollaboratorID,
		SettlementType:      settlement.SettlementType,
		RequestID:           settlement.RequestID,
		Status:              settlement.Status,
		EffectiveDate:       settlement.EffectiveDate.Format(dateLayout),
		BRLAmount:           settlement.BRLAmount,
		GoldGramAmount:      settlement.GoldGramAmount,
		Notes:               settlement.Notes,
		ReasonCode:          settlement.ReasonCode,
		ReasonText:          settlement.ReasonText,
		AuthorizedBy:        settlement.AuthorizedBy,
		AuthorizedAt:        formatOptionalTime(settlement.AuthorizedAt),
		SecondApprovedBy:    settlement.SecondApprovedBy,
		SecondApprovedAt:    formatOptionalTime(settlement.SecondApprovedAt),
		SecondApprovalNotes: settlement.SecondApprovalNotes,
	}
}
