package currentaccounts

import (
	"context"
	"crypto/subtle"
	"errors"
	"strings"
	"time"

	"enterpriseremotesystems/backend/internal/db"
	"enterpriseremotesystems/backend/internal/shared/ids"
)

var (
	ErrLedgerCorrectionDisabled   = errors.New("ledger correction authorization is not configured")
	ErrLedgerCorrectionForbidden  = errors.New("ledger correction authorization failed")
	ErrLedgerEntryAlreadyReversed = errors.New("ledger entry has already been reversed")
	ErrLedgerEntryNotCorrectable  = errors.New("ledger reversal entries cannot be corrected")
)

func (s *service) AuthorizeCorrection(providedKey string) error {
	expected := strings.TrimSpace(s.ledgerCorrectionKey)
	provided := strings.TrimSpace(providedKey)
	if expected == "" {
		return ErrLedgerCorrectionDisabled
	}
	if len(expected) != len(provided) || subtle.ConstantTimeCompare([]byte(expected), []byte(provided)) != 1 {
		return ErrLedgerCorrectionForbidden
	}
	return nil
}

func (s *service) ReverseEntry(ctx context.Context, entryID, authorizedBy string, req ReverseLedgerEntryRequest) (*LedgerCorrectionResult, error) {
	entryID = strings.TrimSpace(entryID)
	if err := ValidateReverseLedgerEntryRequest(req, authorizedBy); err != nil {
		return nil, err
	}
	if err := s.requireSecondApprovalWhenConfigured(ctx, defaultTenantID, req.CorrectionReasonRequest, authorizedBy); err != nil {
		return nil, err
	}
	original, err := s.requireCorrectableEntry(ctx, entryID)
	if err != nil {
		return nil, err
	}
	effectiveDate, _ := parseDate(req.EffectiveDate)
	now := time.Now().UTC()
	reasonCode, reasonText := normalizedCorrectionReason(req.CorrectionReasonRequest)
	secondApprovedBy, secondApprovalNotes := normalizedSecondApproval(req.CorrectionReasonRequest)
	reversal := newCorrectionEntry(*original, oppositeDirection(original.Direction), original.ValueUnitID, original.EntryType, original.Amount, effectiveDate, original.Description, "REVERSAL", reasonCode, reasonText, strings.TrimSpace(authorizedBy), secondApprovedBy, secondApprovalNotes, now)
	if err := s.repo.CreateCorrectionEntries(ctx, &reversal); err != nil {
		return nil, err
	}
	return correctionResult(*original, reversal, nil), nil
}

func (s *service) ReplaceEntry(ctx context.Context, entryID, authorizedBy string, req ReplaceLedgerEntryRequest) (*LedgerCorrectionResult, error) {
	entryID = strings.TrimSpace(entryID)
	if err := ValidateReplaceLedgerEntryRequest(req, authorizedBy); err != nil {
		return nil, err
	}
	if err := s.requireSecondApprovalWhenConfigured(ctx, defaultTenantID, req.CorrectionReasonRequest, authorizedBy); err != nil {
		return nil, err
	}
	original, err := s.requireCorrectableEntry(ctx, entryID)
	if err != nil {
		return nil, err
	}
	if _, err := s.repo.FindValueUnitByID(ctx, strings.TrimSpace(req.ValueUnitID)); err != nil {
		return nil, err
	}
	effectiveDate, _ := parseDate(req.EffectiveDate)
	now := time.Now().UTC()
	reasonCode, reasonText := normalizedCorrectionReason(req.CorrectionReasonRequest)
	secondApprovedBy, secondApprovalNotes := normalizedSecondApproval(req.CorrectionReasonRequest)
	actor := strings.TrimSpace(authorizedBy)
	reversal := newCorrectionEntry(*original, oppositeDirection(original.Direction), original.ValueUnitID, original.EntryType, original.Amount, effectiveDate, original.Description, "REVERSAL", reasonCode, reasonText, actor, secondApprovedBy, secondApprovalNotes, now)
	replacement := newCorrectionEntry(*original, strings.ToUpper(strings.TrimSpace(req.Direction)), strings.TrimSpace(req.ValueUnitID), strings.TrimSpace(req.EntryType), req.Amount, effectiveDate, strings.TrimSpace(req.Description), "REPLACEMENT", reasonCode, reasonText, actor, secondApprovedBy, secondApprovalNotes, now)
	if err := s.repo.CreateCorrectionEntries(ctx, &reversal, &replacement); err != nil {
		return nil, err
	}
	return correctionResult(*original, reversal, &replacement), nil
}

func (s *service) requireCorrectableEntry(ctx context.Context, entryID string) (*db.LedgerEntry, error) {
	entry, err := s.repo.FindEntryByID(ctx, entryID)
	if err != nil {
		return nil, err
	}
	if strings.EqualFold(entry.CorrectionType, "REVERSAL") {
		return nil, ErrLedgerEntryNotCorrectable
	}
	reversed, err := s.repo.HasReversal(ctx, entry.ID)
	if err != nil {
		return nil, err
	}
	if reversed {
		return nil, ErrLedgerEntryAlreadyReversed
	}
	return entry, nil
}

func newCorrectionEntry(original db.LedgerEntry, direction, valueUnitID, entryType string, amount float64, effectiveDate time.Time, description, correctionType, reasonCode, reasonText, authorizedBy, secondApprovedBy, secondApprovalNotes string, now time.Time) db.LedgerEntry {
	originalID := original.ID
	secondApprovedAt := optionalApprovalTime(secondApprovedBy, now)
	return db.LedgerEntry{
		BaseModel:            db.BaseModel{ID: "ledger-correction-" + ids.New(), CreatedAt: now, UpdatedAt: now},
		TenantID:             original.TenantID,
		CollaboratorID:       original.CollaboratorID,
		ValueUnitID:          valueUnitID,
		EntryType:            entryType,
		Direction:            direction,
		Amount:               amount,
		EffectiveDate:        effectiveDate,
		SourceType:           "LEDGER_CORRECTION",
		SourceID:             ids.New(),
		Description:          description,
		Active:               true,
		CorrectionType:       correctionType,
		RelatedEntryID:       &originalID,
		CorrectionReason:     reasonText,
		CorrectionReasonCode: reasonCode,
		CorrectionReasonText: reasonText,
		AuthorizedBy:         authorizedBy,
		AuthorizedAt:         &now,
		SecondApprovedBy:     secondApprovedBy,
		SecondApprovedAt:     secondApprovedAt,
		SecondApprovalNotes:  secondApprovalNotes,
	}
}

func correctionResult(original, reversal db.LedgerEntry, replacement *db.LedgerEntry) *LedgerCorrectionResult {
	out := &LedgerCorrectionResult{Original: ToLedgerEntryDTO(original), Reversal: ToLedgerEntryDTO(reversal)}
	if replacement != nil {
		dto := ToLedgerEntryDTO(*replacement)
		out.Replacement = &dto
	}
	return out
}

func oppositeDirection(direction string) string {
	if strings.EqualFold(direction, "CREDIT") {
		return "DEBIT"
	}
	return "CREDIT"
}
