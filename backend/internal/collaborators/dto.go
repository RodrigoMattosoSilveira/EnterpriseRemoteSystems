package collaborators

type CollaboratorDTO struct {
	ID                 string  `json:"id"`
	TenantID           string  `json:"tenantId"`
	PersonID           string  `json:"personId"`
	PersonName         string  `json:"personName,omitempty"`
	JourneyStartDate   string  `json:"journeyStartDate"`
	DefaultEndDate     string  `json:"defaultEndDate"`
	ExtensionDays      int     `json:"extensionDays"`
	ProjectedEndDate   string  `json:"projectedEndDate"`
	PaymentMethodID    string  `json:"paymentMethodId"`
	PaymentMethodLabel string  `json:"paymentMethodLabel,omitempty"`
	PaymentValue       float64 `json:"paymentValue"`
	SectorID           string  `json:"sectorId"`
	SectorLabel        string  `json:"sectorLabel,omitempty"`
	LocationID         string  `json:"locationId"`
	LocationLabel      string  `json:"locationLabel,omitempty"`
	TaskID             string  `json:"taskId"`
	TaskLabel          string  `json:"taskLabel,omitempty"`
	StatusID           string  `json:"statusId"`
	StatusLabel        string  `json:"statusLabel,omitempty"`
	Notes              string  `json:"notes,omitempty"`
	ClosedAt           string  `json:"closedAt,omitempty"`
	CreatedAt          string  `json:"createdAt"`
	UpdatedAt          string  `json:"updatedAt"`
}

type CreateCollaboratorRequest struct {
	PersonID         string  `json:"personId"`
	JourneyStartDate string  `json:"journeyStartDate"`
	PaymentMethodID  string  `json:"paymentMethodId"`
	PaymentValue     float64 `json:"paymentValue"`
	SectorID         string  `json:"sectorId"`
	LocationID       string  `json:"locationId"`
	TaskID           string  `json:"taskId"`
	StatusID         string  `json:"statusId"`
	Notes            string  `json:"notes"`
}

type CollaboratorListFilter struct {
	StatusID        string `query:"statusId"`
	LocationID      string `query:"locationId"`
	PaymentMethodID string `query:"paymentMethodId"`
	Page            int    `query:"page"`
	PageSize        int    `query:"pageSize"`
}
