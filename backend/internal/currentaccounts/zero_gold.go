package currentaccounts

import (
	"context"
	"crypto/subtle"
	"errors"
	"strings"
	"time"

	"enterpriseremotesystems/backend/internal/db"
	"enterpriseremotesystems/backend/internal/shared/ids"
	"enterpriseremotesystems/backend/internal/shared/tenantctx"
	"gorm.io/gorm"
)

const (
	settlementTypeZeroGold = "ZERO_GOLD"
	settlementStatusPosted = "POSTED"
	ledgerSourceSettlement = "JOURNEY_SETTLEMENT"
	ledgerEntryTypePayout  = "PAYOUT"
	valueUnitGoldGram      = "GOLD_GRAM"
)

var (
	ErrLedgerSettlementDisabled  = errors.New("ledger settlement authorization is not configured")
	ErrLedgerSettlementForbidden = errors.New("ledger settlement authorization failed")
	ErrNoPositiveGoldBalance     = errors.New("collaborator has no positive gold balance")
)

func (s *service) AuthorizeSettlement(providedKey string) error {
	expected := strings.TrimSpace(s.ledgerSettlementKey)
	provided := strings.TrimSpace(providedKey)
	if expected == "" {
		return ErrLedgerSettlementDisabled
	}
	if len(expected) != len(provided) || subtle.ConstantTimeCompare([]byte(expected), []byte(provided)) != 1 {
		return ErrLedgerSettlementForbidden
	}
	return nil
}

func (s *service) ZeroGold(ctx context.Context, collaboratorID, authorizedBy string, req ZeroGoldRequest) (*ZeroGoldResult, error) {
	collaboratorID = strings.TrimSpace(collaboratorID)
	requestID := strings.TrimSpace(req.RequestID)
	if err := ValidateZeroGoldRequest(req, authorizedBy); err != nil {
		return nil, err
	}
	if err := s.requireSecondApprovalWhenConfigured(ctx, tenantctx.TenantID(ctx), req.CorrectionReasonRequest, authorizedBy); err != nil {
		return nil, err
	}
	if _, err := s.repo.FindCollaboratorByID(ctx, collaboratorID); err != nil {
		return nil, err
	}

	if existing, err := s.repo.FindSettlementByRequestID(ctx, collaboratorID, requestID); err == nil {
		entry, entryErr := s.repo.FindLedgerEntryBySource(ctx, ledgerSourceSettlement, existing.ID)
		if entryErr != nil {
			return nil, entryErr
		}
		return zeroGoldResult(*existing, *entry), nil
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	balances, err := s.repo.ListBalances(ctx, collaboratorID)
	if err != nil {
		return nil, err
	}
	var goldBalance float64
	for _, balance := range balances {
		if balance.ValueUnitCode == valueUnitGoldGram {
			goldBalance = balance.Balance
			break
		}
	}
	goldBalance = normalizedZero(goldBalance)
	if goldBalance <= 0 {
		return nil, ErrNoPositiveGoldBalance
	}

	valueUnit, err := s.repo.FindValueUnitByCode(ctx, valueUnitGoldGram)
	if err != nil {
		return nil, err
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
		SettlementType:      settlementTypeZeroGold,
		RequestID:           requestID,
		Status:              settlementStatusPosted,
		EffectiveDate:       effectiveDate,
		GoldGramAmount:      goldBalance,
		Notes:               strings.TrimSpace(req.Notes),
		ReasonCode:          reasonCode,
		ReasonText:          reasonText,
		AuthorizedBy:        actor,
		AuthorizedAt:        &now,
		SecondApprovedBy:    secondApprovedBy,
		SecondApprovedAt:    secondApprovedAt,
		SecondApprovalNotes: secondApprovalNotes,
	}
	entry := db.LedgerEntry{
		BaseModel:            db.BaseModel{ID: "ledger-settlement-" + ids.New(), CreatedAt: now, UpdatedAt: now},
		TenantID:             tenantctx.TenantID(ctx),
		CollaboratorID:       collaboratorID,
		ValueUnitID:          valueUnit.ID,
		EntryType:            ledgerEntryTypePayout,
		Direction:            "DEBIT",
		Amount:               goldBalance,
		EffectiveDate:        effectiveDate,
		SourceType:           ledgerSourceSettlement,
		SourceID:             settlement.ID,
		Description:          strings.TrimSpace(req.Notes),
		Active:               true,
		CorrectionReason:     reasonText,
		CorrectionReasonCode: reasonCode,
		CorrectionReasonText: reasonText,
		CorrectionType:       "ORIGINAL",
		AuthorizedBy:         actor,
		AuthorizedAt:         &now,
		SecondApprovedBy:     secondApprovedBy,
		SecondApprovedAt:     secondApprovedAt,
		SecondApprovalNotes:  secondApprovalNotes,
	}
	if err := s.repo.CreateSettlementWithEntries(ctx, &settlement, &entry); err != nil {
		return nil, err
	}
	reloadedEntry, err := s.repo.FindLedgerEntryBySource(ctx, ledgerSourceSettlement, settlement.ID)
	if err != nil {
		return nil, err
	}
	return zeroGoldResult(settlement, *reloadedEntry), nil
}

func zeroGoldResult(settlement db.JourneySettlement, entry db.LedgerEntry) *ZeroGoldResult {
	return &ZeroGoldResult{
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
		LedgerEntry: ToLedgerEntryDTO(entry),
	}
}
