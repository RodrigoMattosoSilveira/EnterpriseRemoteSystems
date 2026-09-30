package collaborators

type CollaboratorDTO struct {
	ID                             string   `json:"id"`
	TenantID                       string   `json:"tenantId"`
	MembershipID                   string   `json:"membershipId"`
	PersonID                       string   `json:"personId"`
	PersonName                     string   `json:"personName,omitempty"`
	PersonNickname                 string   `json:"personNickname,omitempty"`
	JourneyStartDate               string   `json:"journeyStartDate"`
	DefaultEndDate                 string   `json:"defaultEndDate"`
	ExtensionDays                  int      `json:"extensionDays"`
	ProjectedEndDate               string   `json:"projectedEndDate"`
	PaymentMethodID                string   `json:"paymentMethodId"`
	PaymentMethodLabel             string   `json:"paymentMethodLabel,omitempty"`
	PaymentValue                   float64  `json:"paymentValue"`
	FixedMonthlyBRLAmount          *float64 `json:"fixedMonthlyBrlAmount,omitempty"`
	DailyBRLAmount                 *float64 `json:"dailyBrlAmount,omitempty"`
	GoldCommissionPercent          *float64 `json:"goldCommissionPercent,omitempty"`
	TimeOffGoldSplitPercent        *float64 `json:"timeOffGoldSplitPercent,omitempty"`
	SickDayOffReplacementGoldGrams *float64 `json:"sickDayOffReplacementGoldGrams,omitempty"`
	BonusBRLAmount                 *float64 `json:"bonusBrlAmount,omitempty"`
	BonusDescription               string   `json:"bonusDescription,omitempty"`
	BonusPostedAt                  string   `json:"bonusPostedAt,omitempty"`
	BonusLedgerEntryID             string   `json:"bonusLedgerEntryId,omitempty"`
	PlanningAvailability           string   `json:"planningAvailability"`
	SectorID                       string   `json:"sectorId"`
	SectorLabel                    string   `json:"sectorLabel,omitempty"`
	LocationID                     string   `json:"locationId"`
	LocationLabel                  string   `json:"locationLabel,omitempty"`
	TaskID                         string   `json:"taskId"`
	TaskLabel                      string   `json:"taskLabel,omitempty"`
	StatusID                       string   `json:"statusId"`
	StatusCode                     string   `json:"statusCode,omitempty"`
	StatusLabel                    string   `json:"statusLabel,omitempty"`
	Notes                          string   `json:"notes,omitempty"`
	ClosedAt                       string   `json:"closedAt,omitempty"`
	CreatedAt                      string   `json:"createdAt"`
	UpdatedAt                      string   `json:"updatedAt"`
}

type CreateCollaboratorRequest struct {
	MembershipID                   string   `json:"membershipId"`
	JourneyStartDate               string   `json:"journeyStartDate"`
	PaymentMethodID                string   `json:"paymentMethodId"`
	PaymentValue                   float64  `json:"paymentValue"`
	FixedMonthlyBRLAmount          *float64 `json:"fixedMonthlyBrlAmount"`
	DailyBRLAmount                 *float64 `json:"dailyBrlAmount"`
	GoldCommissionPercent          *float64 `json:"goldCommissionPercent"`
	TimeOffGoldSplitPercent        *float64 `json:"timeOffGoldSplitPercent"`
	SickDayOffReplacementGoldGrams *float64 `json:"sickDayOffReplacementGoldGrams"`
	BonusBRLAmount                 *float64 `json:"bonusBrlAmount"`
	BonusDescription               string   `json:"bonusDescription"`
	PlanningAvailability           string   `json:"planningAvailability"`
	SectorID                       string   `json:"sectorId"`
	LocationID                     string   `json:"locationId"`
	TaskID                         string   `json:"taskId"`
	StatusID                       string   `json:"statusId"`
	Notes                          string   `json:"notes"`
}

type UpdateCollaboratorRequest struct {
	PaymentMethodID                string   `json:"paymentMethodId"`
	PaymentValue                   float64  `json:"paymentValue"`
	FixedMonthlyBRLAmount          *float64 `json:"fixedMonthlyBrlAmount"`
	DailyBRLAmount                 *float64 `json:"dailyBrlAmount"`
	GoldCommissionPercent          *float64 `json:"goldCommissionPercent"`
	TimeOffGoldSplitPercent        *float64 `json:"timeOffGoldSplitPercent"`
	SickDayOffReplacementGoldGrams *float64 `json:"sickDayOffReplacementGoldGrams"`
	BonusBRLAmount                 *float64 `json:"bonusBrlAmount"`
	BonusDescription               string   `json:"bonusDescription"`
	PlanningAvailability           string   `json:"planningAvailability"`
	SectorID                       string   `json:"sectorId"`
	LocationID                     string   `json:"locationId"`
	TaskID                         string   `json:"taskId"`
}

type PostJourneyBonusRequest struct {
	EffectiveDate string `json:"effectiveDate"`
}

type UpdateCollaboratorWorkAssignmentRequest struct {
	SectorID   string `json:"sectorId"`
	LocationID string `json:"locationId"`
	TaskID     string `json:"taskId"`
}

// ExtendCollaboratorJourneyRequest proposes additional calendar days for an open Journey.
// The Journey itself is unchanged until the matching Collaborator accepts the proposal.
type ExtendCollaboratorJourneyRequest struct {
	AdditionalDays int    `json:"additionalDays"`
	Reason         string `json:"reason"`
}

type JourneyExtensionRequestDTO struct {
	ID                    string `json:"id"`
	CollaboratorJourneyID string `json:"collaboratorJourneyId"`
	ReceiptNumber         string `json:"receiptNumber"`
	PreviousEndDate       string `json:"previousEndDate"`
	ProposedEndDate       string `json:"proposedEndDate"`
	AdditionalDays        int    `json:"additionalDays"`
	Reason                string `json:"reason"`
	Status                string `json:"status"`
	RequestedBy           string `json:"requestedBy"`
	RequestedAt           string `json:"requestedAt"`
	AcceptedBy            string `json:"acceptedBy,omitempty"`
	AcceptedAt            string `json:"acceptedAt,omitempty"`
	RejectedBy            string `json:"rejectedBy,omitempty"`
	RejectedAt            string `json:"rejectedAt,omitempty"`
	CancelledBy           string `json:"cancelledBy,omitempty"`
	CancelledAt           string `json:"cancelledAt,omitempty"`
}

type CollaboratorListFilter struct {
	Search          string `query:"search"`
	StatusID        string `query:"statusId"`
	LocationID      string `query:"locationId"`
	PaymentMethodID string `query:"paymentMethodId"`
	Page            int    `query:"page"`
	PageSize        int    `query:"pageSize"`
}

type WorkCreditEvidenceDTO struct {
	Journey            CollaboratorDTO                `json:"journey"`
	WorkRecognized     []WorkCreditWorkEvidenceDTO    `json:"workRecognized"`
	EarningsCalculated []WorkCreditAccrualEvidenceDTO `json:"earningsCalculated"`
	AccountPostings    []WorkCreditAccountPostingDTO  `json:"accountPostings"`
}

type WorkCreditWorkEvidenceDTO struct {
	AssignmentID      string  `json:"assignmentId"`
	WorkPeriodID      string  `json:"workPeriodId"`
	WorkDate          string  `json:"workDate"`
	PeriodCode        string  `json:"periodCode"`
	WorkPeriodName    string  `json:"workPeriodName,omitempty"`
	WorkPeriodStatus  string  `json:"workPeriodStatus"`
	PlannedStatus     string  `json:"plannedStatus"`
	ActualStatus      string  `json:"actualStatus,omitempty"`
	SectorID          string  `json:"sectorId"`
	SectorLabel       string  `json:"sectorLabel,omitempty"`
	LocationID        string  `json:"locationId"`
	LocationLabel     string  `json:"locationLabel,omitempty"`
	TaskID            string  `json:"taskId"`
	TaskLabel         string  `json:"taskLabel,omitempty"`
	ProductionEntries int64   `json:"productionEntries"`
	GoldGramsProduced float64 `json:"goldGramsProduced"`
}

type WorkCreditAccrualEvidenceDTO struct {
	ID                     string   `json:"id"`
	AccrualRunID           string   `json:"accrualRunId"`
	AccrualRunStatus       string   `json:"accrualRunStatus"`
	AccrualDate            string   `json:"accrualDate"`
	WorkPeriodID           string   `json:"workPeriodId"`
	WorkDate               string   `json:"workDate"`
	WorkPeriodAssignmentID string   `json:"workPeriodAssignmentId,omitempty"`
	CalculationType        string   `json:"calculationType"`
	Direction              string   `json:"direction"`
	BRLAmount              *float64 `json:"brlAmount,omitempty"`
	GoldGramAmount         *float64 `json:"goldGramAmount,omitempty"`
	Status                 string   `json:"status"`
	PendingReason          string   `json:"pendingReason,omitempty"`
	Description            string   `json:"description,omitempty"`
}

type WorkCreditAccountPostingDTO struct {
	ID                   string                        `json:"id"`
	EntryType            string                        `json:"entryType"`
	Direction            string                        `json:"direction"`
	Amount               float64                       `json:"amount"`
	SignedAmount         float64                       `json:"signedAmount"`
	ValueUnitCode        string                        `json:"valueUnitCode,omitempty"`
	ValueUnitLabel       string                        `json:"valueUnitLabel,omitempty"`
	EffectiveDate        string                        `json:"effectiveDate"`
	SourceType           string                        `json:"sourceType"`
	SourceID             string                        `json:"sourceId"`
	Description          string                        `json:"description,omitempty"`
	Active               bool                          `json:"active"`
	CorrectionType       string                        `json:"correctionType"`
	RelatedEntryID       string                        `json:"relatedEntryId,omitempty"`
	CorrectionReasonCode string                        `json:"correctionReasonCode,omitempty"`
	CorrectionReasonText string                        `json:"correctionReasonText,omitempty"`
	Receipt              *WorkCreditReceiptEvidenceDTO `json:"receipt,omitempty"`
}

type WorkCreditReceiptEvidenceDTO struct {
	ID               string `json:"id"`
	ReceiptNumber    string `json:"receiptNumber,omitempty"`
	ReceiptPurpose   string `json:"receiptPurpose,omitempty"`
	PaymentDirection string `json:"paymentDirection,omitempty"`
	AcceptingParty   string `json:"acceptingParty,omitempty"`
	Status           string `json:"status"`
	Outstanding      bool   `json:"outstanding"`
	ReturnedAt       string `json:"returnedAt,omitempty"`
	AcceptedAt       string `json:"acceptedAt,omitempty"`
}
