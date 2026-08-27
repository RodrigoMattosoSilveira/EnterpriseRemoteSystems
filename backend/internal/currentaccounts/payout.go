package currentaccounts

import (
	"context"
	"errors"
	"strings"
	"time"

	"enterpriseremotesystems/backend/internal/db"
	"enterpriseremotesystems/backend/internal/shared/ids"
	"enterpriseremotesystems/backend/internal/shared/tenantctx"
	"gorm.io/gorm"
)

const (
	settlementTypePartialPayout = "PAYOUT"
	valueUnitBRL                = "BRL"
)

var ErrPayoutExceedsAvailableBalance = errors.New("requested payout exceeds the available positive balance")

func (s *service) PartialPayout(ctx context.Context, collaboratorID, authorizedBy string, req PartialPayoutRequest) (*PartialPayoutResult, error) {
	collaboratorID = strings.TrimSpace(collaboratorID)
	requestID := strings.TrimSpace(req.RequestID)
	if err := ValidatePartialPayoutRequest(req, authorizedBy); err != nil {
		return nil, err
	}
	if err := s.requireSecondApprovalWhenConfigured(ctx, tenantctx.TenantID(ctx), req.CorrectionReasonRequest, authorizedBy); err != nil {
		return nil, err
	}
	collaborator, err := s.repo.FindCollaboratorByID(ctx, collaboratorID)
	if err != nil {
		return nil, err
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
		return partialPayoutResult(*existing, entries), nil
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	balances, err := s.repo.ListBalances(ctx, collaboratorID)
	if err != nil {
		return nil, err
	}
	var brlBalance, goldBalance float64
	for _, balance := range balances {
		switch balance.ValueUnitCode {
		case valueUnitBRL:
			brlBalance = normalizedZero(balance.Balance)
		case valueUnitGoldGram:
			goldBalance = normalizedZero(balance.Balance)
		}
	}
	if req.BRLAmount > brlBalance+balanceZeroTolerance || req.GoldGramAmount > goldBalance+balanceZeroTolerance {
		return nil, ErrPayoutExceedsAvailableBalance
	}

	effectiveDate, _ := parseDate(req.EffectiveDate)
	now := time.Now().UTC()
	actor := strings.TrimSpace(authorizedBy)
	reasonCode, reasonText := normalizedCorrectionReason(req.CorrectionReasonRequest)
	secondApprovedBy, secondApprovalNotes := normalizedSecondApproval(req.CorrectionReasonRequest)
	secondApprovedAt := optionalApprovalTime(secondApprovedBy, now)
	settlement := db.JourneySettlement{
		BaseModel:           db.BaseModel{ID: "journey-settlement-" + ids.New(), CreatedAt: now, UpdatedAt: now},
		TenantID:            tenantctx.TenantID(ctx),
		CollaboratorID:      collaboratorID,
		SettlementType:      settlementTypePartialPayout,
		RequestID:           requestID,
		Status:              settlementStatusPosted,
		EffectiveDate:       effectiveDate,
		BRLAmount:           req.BRLAmount,
		GoldGramAmount:      req.GoldGramAmount,
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
	if req.BRLAmount > 0 {
		valueUnit, findErr := s.repo.FindValueUnitByCode(ctx, valueUnitBRL)
		if findErr != nil {
			return nil, findErr
		}
		entries = append(entries, payoutLedgerEntry(settlement, personID, *valueUnit, req.BRLAmount, actor, effectiveDate, now))
	}
	if req.GoldGramAmount > 0 {
		valueUnit, findErr := s.repo.FindValueUnitByCode(ctx, valueUnitGoldGram)
		if findErr != nil {
			return nil, findErr
		}
		entries = append(entries, payoutLedgerEntry(settlement, personID, *valueUnit, req.GoldGramAmount, actor, effectiveDate, now))
	}
	if err := s.repo.CreateSettlementWithEntries(ctx, &settlement, entries...); err != nil {
		return nil, err
	}
	rows, err := s.repo.FindLedgerEntriesBySource(ctx, ledgerSourceSettlement, settlement.ID)
	if err != nil {
		return nil, err
	}
	return partialPayoutResult(settlement, rows), nil
}

func payoutLedgerEntry(settlement db.JourneySettlement, personID string, valueUnit db.ReferenceData, amount float64, actor string, effectiveDate, now time.Time) *db.LedgerEntry {
	return &db.LedgerEntry{
		BaseModel:            db.BaseModel{ID: "ledger-settlement-" + ids.New(), CreatedAt: now, UpdatedAt: now},
		TenantID:             settlement.TenantID,
		PersonID:             personID,
		CollaboratorID:       settlement.CollaboratorID,
		ValueUnitID:          valueUnit.ID,
		ValueUnit:            valueUnit,
		EntryType:            ledgerEntryTypePayout,
		Direction:            "DEBIT",
		Amount:               amount,
		EffectiveDate:        effectiveDate,
		SourceType:           ledgerSourceSettlement,
		SourceID:             settlement.ID,
		Description:          settlement.Notes,
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

func partialPayoutResult(settlement db.JourneySettlement, entries []db.LedgerEntry) *PartialPayoutResult {
	return &PartialPayoutResult{
		Settlement: JourneySettlementDTO{
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
		},
		LedgerEntries: ToLedgerEntryDTOList(entries),
	}
}
