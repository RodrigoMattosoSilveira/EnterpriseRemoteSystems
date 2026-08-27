package collaborators

type CollaboratorDTO struct {
	ID                             string   `json:"id"`
	TenantID                       string   `json:"tenantId"`
	MembershipID                   string   `json:"membershipId"`
	PersonID                       string   `json:"personId"`
	LegacyPersonID                 string   `json:"legacyPersonId,omitempty"`
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
	MembershipID string `json:"membershipId"`
	// PersonID is a deprecated Bite 30 compatibility selector. The service
	// resolves it to an ACTIVE Membership and never stores it as the parent.
	PersonID                       string   `json:"personId,omitempty"`
	JourneyStartDate               string   `json:"journeyStartDate"`
	PaymentMethodID                string   `json:"paymentMethodId"`
	PaymentValue                   float64  `json:"paymentValue"`
	FixedMonthlyBRLAmount          *float64 `json:"fixedMonthlyBrlAmount"`
	DailyBRLAmount                 *float64 `json:"dailyBrlAmount"`
	GoldCommissionPercent          *float64 `json:"goldCommissionPercent"`
	TimeOffGoldSplitPercent        *float64 `json:"timeOffGoldSplitPercent"`
	SickDayOffReplacementGoldGrams *float64 `json:"sickDayOffReplacementGoldGrams"`
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
	PlanningAvailability           string   `json:"planningAvailability"`
	SectorID                       string   `json:"sectorId"`
	LocationID                     string   `json:"locationId"`
	TaskID                         string   `json:"taskId"`
	ExtensionDays                  int      `json:"extensionDays"`
}

type UpdateCollaboratorWorkAssignmentRequest struct {
	SectorID   string `json:"sectorId"`
	LocationID string `json:"locationId"`
	TaskID     string `json:"taskId"`
}

// ExtendCollaboratorJourneyRequest adds calendar days to an open Journey.
// ExtensionDays on the Journey remains the cumulative extension from its
// DefaultEndDate; callers provide only the additional days for this action.
type ExtendCollaboratorJourneyRequest struct {
	AdditionalDays int `json:"additionalDays"`
}

type CollaboratorListFilter struct {
	Search          string `query:"search"`
	StatusID        string `query:"statusId"`
	LocationID      string `query:"locationId"`
	PaymentMethodID string `query:"paymentMethodId"`
	Page            int    `query:"page"`
	PageSize        int    `query:"pageSize"`
}
