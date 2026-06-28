package currentaccounts

type SecondPersonApprovalPolicyDTO struct {
	TenantID  string `json:"tenantId"`
	Required  bool   `json:"required"`
	UpdatedBy string `json:"updatedBy,omitempty"`
	UpdatedAt string `json:"updatedAt,omitempty"`
}

type UpdateSecondPersonApprovalPolicyRequest struct {
	Required bool `json:"required"`
}

type LedgerEntryReceiptDTO struct {
	ID                string `json:"id"`
	ReceiptNumber     string `json:"receiptNumber,omitempty"`
	Status            string `json:"status"`
	Outstanding       bool   `json:"outstanding"`
	PrintedAt         string `json:"printedAt,omitempty"`
	ReturnedAt        string `json:"returnedAt,omitempty"`
	SignedDocumentRef string `json:"signedDocumentRef,omitempty"`
}

type LedgerEntryDTO struct {
	ID                   string                 `json:"id"`
	TenantID             string                 `json:"tenantId"`
	CollaboratorID       string                 `json:"collaboratorId"`
	CollaboratorLabel    string                 `json:"collaboratorLabel,omitempty"`
	ValueUnitID          string                 `json:"valueUnitId"`
	ValueUnitLabel       string                 `json:"valueUnitLabel,omitempty"`
	ValueUnitCode        string                 `json:"valueUnitCode,omitempty"`
	EntryType            string                 `json:"entryType"`
	Direction            string                 `json:"direction"`
	Amount               float64                `json:"amount"`
	SignedAmount         float64                `json:"signedAmount"`
	EffectiveDate        string                 `json:"effectiveDate"`
	SourceType           string                 `json:"sourceType"`
	SourceID             string                 `json:"sourceId"`
	Description          string                 `json:"description,omitempty"`
	Active               bool                   `json:"active"`
	CorrectionType       string                 `json:"correctionType"`
	RelatedEntryID       string                 `json:"relatedEntryId,omitempty"`
	CorrectionReason     string                 `json:"correctionReason,omitempty"`
	CorrectionReasonCode string                 `json:"correctionReasonCode,omitempty"`
	CorrectionReasonText string                 `json:"correctionReasonText,omitempty"`
	AuthorizedBy         string                 `json:"authorizedBy,omitempty"`
	AuthorizedAt         string                 `json:"authorizedAt,omitempty"`
	SecondApprovedBy     string                 `json:"secondApprovedBy,omitempty"`
	SecondApprovedAt     string                 `json:"secondApprovedAt,omitempty"`
	SecondApprovalNotes  string                 `json:"secondApprovalNotes,omitempty"`
	CreatedAt            string                 `json:"createdAt"`
	UpdatedAt            string                 `json:"updatedAt"`
	Receipt              *LedgerEntryReceiptDTO `json:"receipt,omitempty"`
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
	ValueUnitID         string `query:"valueUnitId"`
	EntryType           string `query:"entryType"`
	Direction           string `query:"direction"`
	SourceType          string `query:"sourceType"`
	OutstandingReceipts bool   `query:"outstandingReceipts"`
	DateFrom            string `query:"dateFrom"`
	DateTo              string `query:"dateTo"`
	IncludeInactive     bool   `query:"includeInactive"`
	Page                int    `query:"page"`
	PageSize            int    `query:"pageSize"`
}

type LedgerEntryListResult struct {
	Items    []LedgerEntryDTO `json:"items"`
	Total    int64            `json:"total"`
	Page     int              `json:"page"`
	PageSize int              `json:"pageSize"`
}

type SecondApprovalRequest struct {
	ApprovedBy string `json:"approvedBy"`
	Notes      string `json:"notes"`
}

type CorrectionReasonRequest struct {
	ReasonCode string `json:"reasonCode"`
	ReasonText string `json:"reasonText"`
	// Reason is kept as a backwards-compatible alias for reasonText.
	Reason string `json:"reason"`
	// SecondApproval is optional. When supplied, it records that a second person
	// reviewed and approved the sensitive correction operation.
	SecondApproval *SecondApprovalRequest `json:"secondApproval,omitempty"`
}

type ReverseLedgerEntryRequest struct {
	CorrectionReasonRequest
	EffectiveDate string `json:"effectiveDate"`
}

type ReplaceLedgerEntryRequest struct {
	CorrectionReasonRequest
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
	SettlementBlockerOutstandingReceipts  = "OUTSTANDING_RECEIPTS"
)

type SettlementPreviewDTO struct {
	CollaboratorID      string   `json:"collaboratorId"`
	CollaboratorLabel   string   `json:"collaboratorLabel,omitempty"`
	JourneyStatusCode   string   `json:"journeyStatusCode,omitempty"`
	BRLBalance          float64  `json:"brlBalance"`
	GoldGramBalance     float64  `json:"goldGramBalance"`
	PendingAccrualItems int64    `json:"pendingAccrualItems"`
	OutstandingReceipts int64    `json:"outstandingReceipts"`
	CanClose            bool     `json:"canClose"`
	BlockingReasons     []string `json:"blockingReasons"`
}

type ZeroGoldRequest struct {
	CorrectionReasonRequest
	RequestID     string `json:"requestId"`
	EffectiveDate string `json:"effectiveDate"`
	Notes         string `json:"notes"`
}

type JourneySettlementDTO struct {
	ID                  string  `json:"id"`
	CollaboratorID      string  `json:"collaboratorId"`
	SettlementType      string  `json:"settlementType"`
	RequestID           string  `json:"requestId"`
	Status              string  `json:"status"`
	EffectiveDate       string  `json:"effectiveDate"`
	BRLAmount           float64 `json:"brlAmount"`
	GoldGramAmount      float64 `json:"goldGramAmount"`
	Notes               string  `json:"notes,omitempty"`
	ReasonCode          string  `json:"reasonCode,omitempty"`
	ReasonText          string  `json:"reasonText,omitempty"`
	AuthorizedBy        string  `json:"authorizedBy,omitempty"`
	AuthorizedAt        string  `json:"authorizedAt,omitempty"`
	SecondApprovedBy    string  `json:"secondApprovedBy,omitempty"`
	SecondApprovedAt    string  `json:"secondApprovedAt,omitempty"`
	SecondApprovalNotes string  `json:"secondApprovalNotes,omitempty"`
}

type ZeroGoldResult struct {
	Settlement  JourneySettlementDTO `json:"settlement"`
	LedgerEntry LedgerEntryDTO       `json:"ledgerEntry"`
}

// PartialPayoutRequest pays selected positive BRL and/or GOLD_GRAM balances.
type PartialPayoutRequest struct {
	CorrectionReasonRequest
	RequestID      string  `json:"requestId"`
	EffectiveDate  string  `json:"effectiveDate"`
	BRLAmount      float64 `json:"brlAmount"`
	GoldGramAmount float64 `json:"goldGramAmount"`
	Notes          string  `json:"notes"`
}

type PartialPayoutResult struct {
	Settlement    JourneySettlementDTO `json:"settlement"`
	LedgerEntries []LedgerEntryDTO     `json:"ledgerEntries"`
}

// CloseJourneyRequest confirms final settlement and closes the Collaborator Journey.
type CloseJourneyRequest struct {
	CorrectionReasonRequest
	RequestID     string `json:"requestId"`
	EffectiveDate string `json:"effectiveDate"`
	Confirm       bool   `json:"confirm"`
	Notes         string `json:"notes"`
}

type CloseJourneyResult struct {
	Settlement    JourneySettlementDTO `json:"settlement"`
	LedgerEntries []LedgerEntryDTO     `json:"ledgerEntries"`
	JourneyStatus string               `json:"journeyStatus"`
	ClosedAt      string               `json:"closedAt"`
}

const (
	ProjectionMethodFixedBRL                  = "FIXED_BRL"
	ProjectionMethodDailyBRL                  = "DAILY_BRL"
	ProjectionMethodGoldCommission            = "GOLD_COMMISSION"
	ProjectionMethodDiscreteLowerMedianLast10 = "DISCRETE_LOWER_MEDIAN_LAST_10_RECORDED_DATES"
	ProjectionMethodMostRecentNonZero         = "MOST_RECENT_NON_ZERO"
	ProjectionWarningNoGoldProductionHistory  = "NO_GOLD_PRODUCTION_HISTORY"
	ProjectionWarningPendingAccrualInputs     = "PENDING_ACCRUAL_INPUTS"
)

type ProjectionAmountsDTO struct {
	BRLAmount      *float64 `json:"brlAmount"`
	GoldGramAmount *float64 `json:"goldGramAmount"`
}

type FinancialProjectionBasisDTO struct {
	ProjectionDate             string   `json:"projectionDate"`
	JourneyEndDate             string   `json:"journeyEndDate"`
	PeriodsPerDay              int      `json:"periodsPerDay"`
	RemainingWorkPeriods       int      `json:"remainingWorkPeriods"`
	CalendarWorkPeriods        int      `json:"calendarWorkPeriods"`
	PostedWorkPeriods          int      `json:"postedWorkPeriods"`
	ReadyAccrualWorkPeriods    int      `json:"readyAccrualWorkPeriods"`
	EstimatedFutureWorkPeriods int      `json:"estimatedFutureWorkPeriods"`
	PendingAccrualItems        int64    `json:"pendingAccrualItems"`
	LocationID                 string   `json:"locationId,omitempty"`
	LocationLabel              string   `json:"locationLabel,omitempty"`
	ProductionMethod           string   `json:"productionMethod,omitempty"`
	ProductionDatesAvailable   int      `json:"productionDatesAvailable"`
	ProductionValueUsed        *float64 `json:"productionValueUsed,omitempty"`
	Warning                    string   `json:"warning,omitempty"`
}

type FinancialProjectionDTO struct {
	CollaboratorID          string                      `json:"collaboratorId"`
	CollaboratorLabel       string                      `json:"collaboratorLabel,omitempty"`
	PaymentMethodCode       string                      `json:"paymentMethodCode"`
	CurrentBalances         ProjectionAmountsDTO        `json:"currentBalances"`
	UnpostedReadyEarnings   ProjectionAmountsDTO        `json:"unpostedReadyEarnings"`
	EstimatedFutureEarnings ProjectionAmountsDTO        `json:"estimatedFutureEarnings"`
	ProjectedEarnings       ProjectionAmountsDTO        `json:"projectedEarnings"`
	ProjectedFinalBalances  ProjectionAmountsDTO        `json:"projectedFinalBalances"`
	Projection              FinancialProjectionBasisDTO `json:"projection"`
}

type ReceiptListFilter struct {
	Status       string `query:"status"`
	Collaborator string `query:"collaborator"`
	SourceType   string `query:"sourceType"`
	Page         int    `query:"page"`
	PageSize     int    `query:"pageSize"`
}

type OutstandingReceiptDTO struct {
	ID                    string  `json:"id"`
	ReceiptNumber         string  `json:"receiptNumber"`
	ReceiptType           string  `json:"receiptType"`
	Status                string  `json:"status"`
	IssuedAt              string  `json:"issuedAt,omitempty"`
	IssuedBy              string  `json:"issuedBy,omitempty"`
	PrintedAt             string  `json:"printedAt,omitempty"`
	SignedAt              string  `json:"signedAt,omitempty"`
	ReturnedAt            string  `json:"returnedAt,omitempty"`
	ReceivedBy            string  `json:"receivedBy,omitempty"`
	SignedDocumentRef     string  `json:"signedDocumentRef,omitempty"`
	Notes                 string  `json:"notes,omitempty"`
	LedgerEntryID         string  `json:"ledgerEntryId"`
	EntryType             string  `json:"entryType"`
	EffectiveDate         string  `json:"effectiveDate"`
	ValueUnitCode         string  `json:"valueUnitCode"`
	ValueUnitLabel        string  `json:"valueUnitLabel"`
	Amount                float64 `json:"amount"`
	Description           string  `json:"description,omitempty"`
	SourceType            string  `json:"sourceType"`
	SourceID              string  `json:"sourceId"`
	CollaboratorID        string  `json:"collaboratorId"`
	CollaboratorLabel     string  `json:"collaboratorLabel"`
	CollaboratorLegalName string  `json:"collaboratorLegalName"`
	CollaboratorCPF       string  `json:"collaboratorCpf"`
	CreatedAt             string  `json:"createdAt"`
}

type ReceiptStatusSummaryDTO struct {
	PendingIssue int64 `json:"pendingIssue"`
	Issued       int64 `json:"issued"`
	Printed      int64 `json:"printed"`
	Signed       int64 `json:"signed"`
	Total        int64 `json:"total"`
}

type OutstandingReceiptListResult struct {
	Items    []OutstandingReceiptDTO `json:"items"`
	Total    int64                   `json:"total"`
	Page     int                     `json:"page"`
	PageSize int                     `json:"pageSize"`
	Summary  ReceiptStatusSummaryDTO `json:"summary"`
}

type PrintableReceiptDTO struct {
	ID                    string  `json:"id"`
	ReceiptNumber         string  `json:"receiptNumber"`
	ReceiptType           string  `json:"receiptType"`
	Status                string  `json:"status"`
	IssuedAt              string  `json:"issuedAt,omitempty"`
	IssuedBy              string  `json:"issuedBy,omitempty"`
	PrintedAt             string  `json:"printedAt,omitempty"`
	SignedAt              string  `json:"signedAt,omitempty"`
	ReturnedAt            string  `json:"returnedAt,omitempty"`
	ReceivedBy            string  `json:"receivedBy,omitempty"`
	SignedDocumentRef     string  `json:"signedDocumentRef,omitempty"`
	Notes                 string  `json:"notes,omitempty"`
	LedgerEntryID         string  `json:"ledgerEntryId"`
	EntryType             string  `json:"entryType"`
	EffectiveDate         string  `json:"effectiveDate"`
	ValueUnitCode         string  `json:"valueUnitCode"`
	ValueUnitLabel        string  `json:"valueUnitLabel"`
	Amount                float64 `json:"amount"`
	Description           string  `json:"description,omitempty"`
	CollaboratorID        string  `json:"collaboratorId"`
	CollaboratorLabel     string  `json:"collaboratorLabel"`
	CollaboratorLegalName string  `json:"collaboratorLegalName"`
	CollaboratorCPF       string  `json:"collaboratorCpf"`
	CreatedAt             string  `json:"createdAt"`
}

type ReturnReceiptRequest struct {
	SignedDocumentRef string `json:"signedDocumentRef"`
	Notes             string `json:"notes"`
}

type ReceiptBackfillRequest struct {
	CorrectionReasonRequest
}

type ReceiptBackfillResult struct {
	EligibleDebitEntries int64  `json:"eligibleDebitEntries"`
	ExistingReceipts     int64  `json:"existingReceipts"`
	MissingReceipts      int64  `json:"missingReceipts"`
	CreatedReceipts      int64  `json:"createdReceipts"`
	DryRun               bool   `json:"dryRun"`
	RequestedBy          string `json:"requestedBy"`
}
