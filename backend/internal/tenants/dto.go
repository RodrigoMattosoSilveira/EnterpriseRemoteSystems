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
	ActorID                            string `json:"actorId"`
	ActorKey                           string `json:"actorKey"`
	DisplayName                        string `json:"displayName"`
	GlobalPersonID                     string `json:"globalPersonId,omitempty"`
	PersonName                         string `json:"personName,omitempty"`
	PersonNickname                     string `json:"personNickname,omitempty"`
	AccountLogin                       string `json:"accountLogin,omitempty"`
	Active                             bool   `json:"active"`
	Assigned                           bool   `json:"assigned"`
	Eligible                           bool   `json:"eligible"`
	IneligibilityReason                string `json:"ineligibilityReason,omitempty"`
	HasDelegatedAuthorityInOtherTenant bool   `json:"hasDelegatedAuthorityInOtherTenant"`
}

// CreateInitialTenantAdminCandidateRequest is for an empty Tenant only. It
// establishes the canonical Person/Account/Actor foundation, NOT a role grant.
// A separate, explicit Assign Tenant Administrator action grants authority.
type CreateInitialTenantAdminCandidateRequest struct {
	ActorKey          string `json:"actorKey"`
	FirstName         string `json:"firstName"`
	LastName          string `json:"lastName"`
	Nickname          string `json:"nickname"`
	CPF               string `json:"cpf"`
	RG                string `json:"rg"`
	Cellular          string `json:"cellular"`
	Email             string `json:"email"`
	TemporaryPassword string `json:"temporaryPassword"`
}

type InitialTenantAdminCandidateDTO struct {
	ActorID        string `json:"actorId"`
	ActorKey       string `json:"actorKey"`
	AccountID      string `json:"accountId"`
	Login          string `json:"login"`
	GlobalPersonID string `json:"globalPersonId"`
	MembershipID   string `json:"membershipId"`
	TenantID       string `json:"tenantId"`
}
