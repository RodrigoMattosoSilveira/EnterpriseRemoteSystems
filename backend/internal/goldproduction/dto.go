package goldproduction

type GoldProductionEntryDTO struct {
	ID                string  `json:"id"`
	TenantID          string  `json:"tenantId"`
	WorkPeriodID      string  `json:"workPeriodId"`
	LocationID        string  `json:"locationId"`
	LocationLabel     string  `json:"locationLabel,omitempty"`
	ProductionDate    string  `json:"productionDate"`
	GoldGramsProduced float64 `json:"goldGramsProduced"`
	Active            bool    `json:"active"`
	Notes             string  `json:"notes,omitempty"`
	CreatedAt         string  `json:"createdAt"`
	UpdatedAt         string  `json:"updatedAt"`
}

type CreateGoldProductionEntryRequest struct {
	LocationID        string  `json:"locationId"`
	ProductionDate    string  `json:"productionDate"`
	GoldGramsProduced float64 `json:"goldGramsProduced"`
	Notes             string  `json:"notes"`
}

type UpdateGoldProductionEntryRequest struct {
	LocationID        string  `json:"locationId"`
	ProductionDate    string  `json:"productionDate"`
	GoldGramsProduced float64 `json:"goldGramsProduced"`
	Notes             string  `json:"notes"`
}

type GoldProductionEntryListFilter struct {
	LocationID      string `query:"locationId"`
	DateFrom        string `query:"dateFrom"`
	DateTo          string `query:"dateTo"`
	IncludeInactive bool   `query:"includeInactive"`
	Page            int    `query:"page"`
	PageSize        int    `query:"pageSize"`
}

type GoldProductionEntryListResult struct {
	Items    []GoldProductionEntryDTO `json:"items"`
	Total    int64                    `json:"total"`
	Page     int                      `json:"page"`
	PageSize int                      `json:"pageSize"`
}
