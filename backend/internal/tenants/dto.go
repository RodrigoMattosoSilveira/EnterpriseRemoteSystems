package tenants

import "time"

type OperationalStatus string

const (
	OperationalStatusActiveReady   OperationalStatus = "ACTIVE_READY"
	OperationalStatusActiveNoAdmin OperationalStatus = "ACTIVE_NO_TENANT_ADMIN"
	OperationalStatusInactive      OperationalStatus = "INACTIVE"
)

type TenantDTO struct {
	ID                         string            `json:"id"`
	Code                       string            `json:"code"`
	Name                       string            `json:"name"`
	Description                string            `json:"description,omitempty"`
	Active                     bool              `json:"active"`
	OperationalStatus          OperationalStatus `json:"operationalStatus"`
	TenantAdminCount           int64             `json:"tenantAdminCount"`
	TenantAdminAssignmentCount int64             `json:"tenantAdminAssignmentCount"`
	CreatedAt                  time.Time         `json:"createdAt"`
	UpdatedAt                  time.Time         `json:"updatedAt"`
}

type CreateTenantRequest struct {
	Code        string `json:"code"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Active      *bool  `json:"active"`
}

type UpdateTenantRequest struct {
	Code        string `json:"code"`
	Name        string `json:"name"`
	Description string `json:"description"`
}

type SetTenantActiveRequest struct {
	Active *bool `json:"active"`
}

type AssignTenantAdminRequest struct {
	ActorID string `json:"actorId"`
}

type TenantAdminCandidateDTO struct {
	ActorID             string `json:"actorId"`
	ActorKey            string `json:"actorKey"`
	DisplayName         string `json:"displayName"`
	GlobalPersonID      string `json:"globalPersonId,omitempty"`
	Active              bool   `json:"active"`
	Assigned            bool   `json:"assigned"`
	Eligible            bool   `json:"eligible"`
	IneligibilityReason string `json:"ineligibilityReason,omitempty"`
	TenantAdminTenantID string `json:"tenantAdminTenantId,omitempty"`
}
