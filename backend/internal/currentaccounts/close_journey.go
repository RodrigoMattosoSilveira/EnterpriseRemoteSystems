package currentaccounts

import (
	"context"
	"errors"
	"strings"
	"time"

	"enterpriseremotesystems/backend/internal/db"
	"enterpriseremotesystems/backend/internal/shared/ids"
	"gorm.io/gorm"
)

const settlementTypeCloseJourney = "CLOSE_JOURNEY"

var (
	ErrJourneyAlreadyClosed = errors.New("collaborator journey is already closed")
	ErrJourneyCloseBlocked  = errors.New("collaborator journey cannot close while settlement blockers remain")
)

func (s *service) CloseJourney(ctx context.Context, collaboratorID, authorizedBy string, req CloseJourneyRequest) (*CloseJourneyResult, error) {
	collaboratorID = strings.TrimSpace(collaboratorID)
	requestID := strings.TrimSpace(req.RequestID)
	if err := ValidateCloseJourneyRequest(req, authorizedBy); err != nil {
		return nil, err
	}
	if err := s.requireSecondApprovalWhenConfigured(ctx, defaultTenantID, req.CorrectionReasonRequest, authorizedBy); err != nil {
		return nil, err
	}

	if existing, err := s.repo.FindSettlementByRequestID(ctx, collaboratorID, requestID); err == nil {
		entries, entryErr := s.repo.FindLedgerEntriesBySource(ctx, ledgerSourceSettlement, existing.ID)
		if entryErr != nil {
			return nil, entryErr
		}
		collaborator, collaboratorErr := s.repo.FindCollaboratorByID(ctx, collaboratorID)
		if collaboratorErr != nil {
			return nil, collaboratorErr
		}
		return closeJourneyResult(*existing, entries, *collaborator), nil
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	preview, err := s.SettlementPreview(ctx, collaboratorID)
	if err != nil {
		return nil, err
	}
	for _, blocker := range preview.BlockingReasons {
		if blocker == SettlementBlockerJourneyAlreadyClosed {
			return nil, ErrJourneyAlreadyClosed
		}
	}
	if !preview.CanClose {
		return nil, ErrJourneyCloseBlocked
	}

	finishedStatus, err := s.repo.FindCollaboratorStatusByCode(ctx, "FINISHED")
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
		TenantID:            defaultTenantID,
		CollaboratorID:      collaboratorID,
		SettlementType:      settlementTypeCloseJourney,
		RequestID:           requestID,
		Status:              settlementStatusPosted,
		EffectiveDate:       effectiveDate,
		BRLAmount:           maxPositive(preview.BRLBalance),
		GoldGramAmount:      maxPositive(preview.GoldGramBalance),
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
	if settlement.BRLAmount > 0 {
		valueUnit, findErr := s.repo.FindValueUnitByCode(ctx, valueUnitBRL)
		if findErr != nil {
			return nil, findErr
		}
		entries = append(entries, payoutLedgerEntry(settlement, *valueUnit, settlement.BRLAmount, actor, effectiveDate, now))
	}
	if settlement.GoldGramAmount > 0 {
		valueUnit, findErr := s.repo.FindValueUnitByCode(ctx, valueUnitGoldGram)
		if findErr != nil {
			return nil, findErr
		}
		entries = append(entries, payoutLedgerEntry(settlement, *valueUnit, settlement.GoldGramAmount, actor, effectiveDate, now))
	}

	if err := s.repo.CloseJourneyWithSettlement(ctx, collaboratorID, finishedStatus.ID, now, &settlement, entries...); err != nil {
		return nil, err
	}
	collaborator, err := s.repo.FindCollaboratorByID(ctx, collaboratorID)
	if err != nil {
		return nil, err
	}
	rows, err := s.repo.FindLedgerEntriesBySource(ctx, ledgerSourceSettlement, settlement.ID)
	if err != nil {
		return nil, err
	}
	return closeJourneyResult(settlement, rows, *collaborator), nil
}

func maxPositive(value float64) float64 {
	value = normalizedZero(value)
	if value > 0 {
		return value
	}
	return 0
}

func closeJourneyResult(settlement db.JourneySettlement, entries []db.LedgerEntry, collaborator db.CollaboratorJourney) *CloseJourneyResult {
	return &CloseJourneyResult{
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
		JourneyStatus: collaborator.Status.Code,
		ClosedAt:      formatOptionalTime(collaborator.ClosedAt),
	}
}
