package referencedata

type ReferenceDataDTO struct {
	ID           string `json:"id"`
	TenantID     string `json:"tenantId"`
	Type         string `json:"type"`
	Code         string `json:"code"`
	Label        string `json:"label"`
	Description  string `json:"description,omitempty"`
	Active       bool   `json:"active"`
	SortOrder    int    `json:"sortOrder"`
	MetadataJSON string `json:"metadataJson,omitempty"`
}
type CreateReferenceDataRequest struct {
	Code         string `json:"code"`
	Label        string `json:"label"`
	Description  string `json:"description,omitempty"`
	Active       bool   `json:"active"`
	SortOrder    int    `json:"sortOrder"`
	MetadataJSON string `json:"metadataJson,omitempty"`
}
