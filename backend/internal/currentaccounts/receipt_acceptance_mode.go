package currentaccounts

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

	"enterpriseremotesystems/backend/internal/db"
)

const (
	receiptAcceptanceModeReferenceType = "receipt_acceptance_mode"
	receiptAcceptanceScopeExpenseDebit = "EXPENSE_DEBIT"
	receiptAcceptanceModeBoth          = "BOTH"
	receiptAcceptanceModePaperOnly     = "PAPER_ONLY"
	receiptAcceptanceModeElectronic    = "ELECTRONIC_ONLY"
	receiptLedgerDebitPurpose          = "LEDGER_DEBIT"
	receiptMaxUserAgentLength          = 512
)

var (
	ErrReceiptAcceptanceModeBlocked = errors.New("this tenant accepts expense receipts on paper only")
	ErrReceiptReturnModeBlocked     = errors.New("this tenant accepts expense receipts electronically only")
	ErrReceiptAcceptanceModeInvalid = errors.New("receipt acceptance mode setting is invalid")
	ErrReceiptNotIssued             = errors.New("receipt must be issued before it can be accepted")
)

// ReceiptClientInfo is request evidence captured at acceptance. It is taken
// from the transport layer, never from the request body.
type ReceiptClientInfo struct {
	IP        string
	UserAgent string
}

type receiptClientInfoKey struct{}

// WithReceiptClientInfo attaches client evidence to the context for the
// repository write that records the acceptance.
func WithReceiptClientInfo(ctx context.Context, info ReceiptClientInfo) context.Context {
	return context.WithValue(ctx, receiptClientInfoKey{}, info)
}

func receiptClientInfoFrom(ctx context.Context) ReceiptClientInfo {
	info, _ := ctx.Value(receiptClientInfoKey{}).(ReceiptClientInfo)
	if len(info.UserAgent) > receiptMaxUserAgentLength {
		info.UserAgent = info.UserAgent[:receiptMaxUserAgentLength]
	}
	info.IP = strings.TrimSpace(info.IP)
	info.UserAgent = strings.TrimSpace(info.UserAgent)
	return info
}

// receiptAcceptanceScope returns the acceptance-mode scope for a receipt, or
// an empty string when the receipt is outside the mode setting. Only debit
// receipts created by expenses are governed by the setting today.
func receiptAcceptanceScope(row db.LedgerReceipt) string {
	if strings.ToUpper(strings.TrimSpace(row.ReceiptPurpose)) != receiptLedgerDebitPurpose {
		return ""
	}
	switch strings.ToUpper(strings.TrimSpace(row.LedgerEntry.SourceType)) {
	case "EXPENSE", "EXPENSE_REPLACEMENT":
		return receiptAcceptanceScopeExpenseDebit
	}
	return ""
}

// receiptAcceptanceMode reads the tenant's mode for a scope from reference
// data. A missing row means BOTH, so new tenants work without seeding.
func (s *service) receiptAcceptanceMode(ctx context.Context, scope string) (string, error) {
	raw, found, err := s.repo.FindReceiptAcceptanceModeMetadata(ctx, scope)
	if err != nil {
		return "", err
	}
	if !found || strings.TrimSpace(raw) == "" {
		return receiptAcceptanceModeBoth, nil
	}
	var meta struct {
		Mode string `json:"mode"`
	}
	if err := json.Unmarshal([]byte(raw), &meta); err != nil {
		return "", ErrReceiptAcceptanceModeInvalid
	}
	mode := strings.ToUpper(strings.TrimSpace(meta.Mode))
	switch mode {
	case receiptAcceptanceModeBoth, receiptAcceptanceModePaperOnly, receiptAcceptanceModeElectronic:
		return mode, nil
	}
	return "", ErrReceiptAcceptanceModeInvalid
}
