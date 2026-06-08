package currentaccounts

type LedgerEntryDTO struct {
	ID                string  `json:"id"`
	TenantID          string  `json:"tenantId"`
	CollaboratorID    string  `json:"collaboratorId"`
	CollaboratorLabel string  `json:"collaboratorLabel,omitempty"`
	ValueUnitID       string  `json:"valueUnitId"`
	ValueUnitLabel    string  `json:"valueUnitLabel,omitempty"`
	ValueUnitCode     string  `json:"valueUnitCode,omitempty"`
	EntryType         string  `json:"entryType"`
	Direction         string  `json:"direction"`
	Amount            float64 `json:"amount"`
	SignedAmount      float64 `json:"signedAmount"`
	EffectiveDate     string  `json:"effectiveDate"`
	SourceType        string  `json:"sourceType"`
	SourceID          string  `json:"sourceId"`
	Description       string  `json:"description,omitempty"`
	Active            bool    `json:"active"`
	CorrectionType    string  `json:"correctionType"`
	RelatedEntryID    string  `json:"relatedEntryId,omitempty"`
	CorrectionReason  string  `json:"correctionReason,omitempty"`
	AuthorizedBy      string  `json:"authorizedBy,omitempty"`
	AuthorizedAt      string  `json:"authorizedAt,omitempty"`
	CreatedAt         string  `json:"createdAt"`
	UpdatedAt         string  `json:"updatedAt"`
}

type CurrentAccountBalanceDTO struct {
	CollaboratorID    string  `json:"collaboratorId"`
	CollaboratorLabel string  `json:"collaboratorLabel,omitempty"`
	ValueUnitID       string  `json:"valueUnitId"`
	ValueUnitCode     string  `json:"valueUnitCode,omitempty"`
	ValueUnitLabel    string  `json:"valueUnitLabel,omitempty"`
	Balance           float64 `json:"balance"`
}

type CurrentAccountDetailDTO struct {
	CollaboratorID    string                     `json:"collaboratorId"`
	CollaboratorLabel string                     `json:"collaboratorLabel,omitempty"`
	Balances          []CurrentAccountBalanceDTO `json:"balances"`
	LedgerEntries     LedgerEntryListResult      `json:"ledgerEntries"`
}

type LedgerEntryListFilter struct {
	ValueUnitID     string `query:"valueUnitId"`
	EntryType       string `query:"entryType"`
	SourceType      string `query:"sourceType"`
	DateFrom        string `query:"dateFrom"`
	DateTo          string `query:"dateTo"`
	IncludeInactive bool   `query:"includeInactive"`
	Page            int    `query:"page"`
	PageSize        int    `query:"pageSize"`
}

type LedgerEntryListResult struct {
	Items    []LedgerEntryDTO `json:"items"`
	Total    int64            `json:"total"`
	Page     int              `json:"page"`
	PageSize int              `json:"pageSize"`
}

type ReverseLedgerEntryRequest struct {
	Reason        string `json:"reason"`
	EffectiveDate string `json:"effectiveDate"`
}

type ReplaceLedgerEntryRequest struct {
	Reason        string  `json:"reason"`
	ValueUnitID   string  `json:"valueUnitId"`
	EntryType     string  `json:"entryType"`
	Direction     string  `json:"direction"`
	Amount        float64 `json:"amount"`
	EffectiveDate string  `json:"effectiveDate"`
	Description   string  `json:"description"`
}

type LedgerCorrectionResult struct {
	Original    LedgerEntryDTO  `json:"original"`
	Reversal    LedgerEntryDTO  `json:"reversal"`
	Replacement *LedgerEntryDTO `json:"replacement,omitempty"`
}

const (
	SettlementBlockerJourneyAlreadyClosed = "JOURNEY_ALREADY_CLOSED"
	SettlementBlockerNegativeBalance      = "NEGATIVE_BALANCE"
	SettlementBlockerPendingAccruals      = "PENDING_ACCRUALS"
)

type SettlementPreviewDTO struct {
	CollaboratorID      string   `json:"collaboratorId"`
	CollaboratorLabel   string   `json:"collaboratorLabel,omitempty"`
	JourneyStatusCode   string   `json:"journeyStatusCode,omitempty"`
	BRLBalance          float64  `json:"brlBalance"`
	GoldGramBalance     float64  `json:"goldGramBalance"`
	PendingAccrualItems int64    `json:"pendingAccrualItems"`
	CanClose            bool     `json:"canClose"`
	BlockingReasons     []string `json:"blockingReasons"`
}
