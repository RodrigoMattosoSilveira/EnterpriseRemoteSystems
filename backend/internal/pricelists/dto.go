package pricelists

type PriceListItemDTO struct {
	ID           string  `json:"id"`
	TenantID     string  `json:"tenantId"`
	ItemType     string  `json:"itemType"`
	Code         string  `json:"code"`
	Description  string  `json:"description"`
	UnitPriceBRL float64 `json:"unitPriceBrl"`
	Active       bool    `json:"active"`
	SortOrder    int     `json:"sortOrder"`
	CreatedAt    string  `json:"createdAt"`
	UpdatedAt    string  `json:"updatedAt"`
}

type CreatePriceListItemRequest struct {
	ItemType     string  `json:"itemType"`
	Code         string  `json:"code"`
	Description  string  `json:"description"`
	UnitPriceBRL float64 `json:"unitPriceBrl"`
	SortOrder    int     `json:"sortOrder"`
}

type UpdatePriceListItemRequest struct {
	ItemType     string  `json:"itemType"`
	Code         string  `json:"code"`
	Description  string  `json:"description"`
	UnitPriceBRL float64 `json:"unitPriceBrl"`
	SortOrder    int     `json:"sortOrder"`
}

type PriceListItemListFilter struct {
	ItemType        string `query:"itemType"`
	IncludeInactive bool   `query:"includeInactive"`
}

type GoldPriceDTO struct {
	ID         string  `json:"id"`
	TenantID   string  `json:"tenantId"`
	PriceDate  string  `json:"priceDate"`
	BRLPerGram float64 `json:"brlPerGram"`
	RecordedBy string  `json:"recordedBy"`
	Notes      string  `json:"notes,omitempty"`
	Active     bool    `json:"active"`
	CreatedAt  string  `json:"createdAt"`
	UpdatedAt  string  `json:"updatedAt"`
}

type CreateGoldPriceRequest struct {
	PriceDate  string  `json:"priceDate"`
	BRLPerGram float64 `json:"brlPerGram"`
	RecordedBy string  `json:"recordedBy"`
	Notes      string  `json:"notes"`
}

type GoldPriceListFilter struct {
	IncludeInactive bool `query:"includeInactive"`
}
