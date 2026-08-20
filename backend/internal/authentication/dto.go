package authentication

import "time"

type LoginRequest struct {
	Login    string `json:"login"`
	Password string `json:"password"`
}

type ChangePasswordRequest struct {
	CurrentPassword string `json:"currentPassword"`
	NewPassword     string `json:"newPassword"`
}

type ResetPasswordRequest struct {
	Token       string `json:"token"`
	NewPassword string `json:"newPassword"`
}

type CreateAccountRequest struct {
	ActorID            string `json:"actorId"`
	TenantID           string `json:"-"`
	Login              string `json:"login"`
	TemporaryPassword  string `json:"temporaryPassword"`
	MustChangePassword *bool  `json:"mustChangePassword,omitempty"`
}

type SetAccountActiveRequest struct {
	Active *bool `json:"active"`
}

type AccountActorResponse struct {
	ActorID        string `json:"actorId"`
	ActorKey       string `json:"actorKey"`
	DisplayName    string `json:"displayName"`
	Scope          string `json:"scope"`
	TenantID       string `json:"tenantId,omitempty"`
	TenantName     string `json:"tenantName,omitempty"`
	MembershipID   string `json:"membershipId,omitempty"`
	PersonID       string `json:"personId,omitempty"`
	PersonName     string `json:"personName,omitempty"`
	PersonNickname string `json:"personNickname,omitempty"`
	CollaboratorID string `json:"collaboratorId,omitempty"`
	Active         bool   `json:"active"`
	Primary        bool   `json:"primary"`
}

type AccountResponse struct {
	ID                 string                 `json:"id"`
	ActorID            string                 `json:"actorId"`
	ActorKey           string                 `json:"actorKey"`
	DisplayName        string                 `json:"displayName"`
	GlobalPersonID     string                 `json:"globalPersonId,omitempty"`
	GlobalPersonName   string                 `json:"globalPersonName,omitempty"`
	GlobalPersonEmail  string                 `json:"globalPersonEmail,omitempty"`
	Actors             []AccountActorResponse `json:"actors"`
	Login              string                 `json:"login"`
	Active             bool                   `json:"active"`
	ActorActive        bool                   `json:"actorActive"`
	MustChangePassword bool                   `json:"mustChangePassword"`
	LastLoginAt        *time.Time             `json:"lastLoginAt,omitempty"`
	PasswordChangedAt  *time.Time             `json:"passwordChangedAt,omitempty"`
	CreatedAt          time.Time              `json:"createdAt"`
	UpdatedAt          time.Time              `json:"updatedAt"`
}

type SessionResponse struct {
	AccountID          string    `json:"accountId"`
	DisplayName        string    `json:"displayName"`
	Login              string    `json:"login"`
	MustChangePassword bool      `json:"mustChangePassword"`
	ExpiresAt          time.Time `json:"expiresAt"`

	// Bite 30E makes the HTTP session Account-authenticated. These legacy actor
	// fields remain available only to isolated compatibility tests and route
	// fallbacks until Bite 30J removes the old single-Actor assumptions; they are
	// deliberately no longer part of the browser session contract.
	ActorID        string `json:"-"`
	ActorKey       string `json:"-"`
	PersonID       string `json:"-"`
	CollaboratorID string `json:"-"`
}

type SelfServicePersonResponse struct {
	ID                      string `json:"id"`
	FirstName               string `json:"firstName"`
	LastName                string `json:"lastName"`
	Nickname                string `json:"nickname"`
	CPF                     string `json:"cpf"`
	RG                      string `json:"rg"`
	Cellular                string `json:"cellular"`
	Email                   string `json:"email"`
	Street1                 string `json:"street1,omitempty"`
	Street2                 string `json:"street2,omitempty"`
	State                   string `json:"state,omitempty"`
	City                    string `json:"city,omitempty"`
	CEP                     string `json:"cep,omitempty"`
	Country                 string `json:"country"`
	BankName                string `json:"bankName,omitempty"`
	BankNumber              string `json:"bankNumber,omitempty"`
	CheckingAccount         string `json:"checkingAccount,omitempty"`
	PIXKey                  string `json:"pixKey,omitempty"`
	EmergencyName           string `json:"emergencyName,omitempty"`
	EmergencyCellular       string `json:"emergencyCellular,omitempty"`
	EmergencyEmail          string `json:"emergencyEmail,omitempty"`
	ProfileCompletionStatus string `json:"profileCompletionStatus"`
	CanCreateCollaborator   bool   `json:"canCreateCollaborator"`
}

type SelfServiceBalanceResponse struct {
	TenantID       string  `json:"tenantId"`
	TenantName     string  `json:"tenantName"`
	ValueUnitID    string  `json:"valueUnitId"`
	ValueUnitCode  string  `json:"valueUnitCode"`
	ValueUnitLabel string  `json:"valueUnitLabel"`
	Balance        float64 `json:"balance"`
}

type SelfServiceLedgerEntryResponse struct {
	ID             string    `json:"id"`
	TenantID       string    `json:"tenantId"`
	TenantName     string    `json:"tenantName"`
	CollaboratorID string    `json:"collaboratorId"`
	ValueUnitID    string    `json:"valueUnitId"`
	ValueUnitCode  string    `json:"valueUnitCode"`
	ValueUnitLabel string    `json:"valueUnitLabel"`
	EntryType      string    `json:"entryType"`
	Direction      string    `json:"direction"`
	Amount         float64   `json:"amount"`
	SignedAmount   float64   `json:"signedAmount"`
	EffectiveDate  time.Time `json:"effectiveDate"`
	SourceType     string    `json:"sourceType"`
	SourceID       string    `json:"sourceId"`
	Description    string    `json:"description,omitempty"`
}

type SelfServiceHomeResponse struct {
	AccountID string                           `json:"accountId"`
	Person    SelfServicePersonResponse        `json:"person"`
	Balances  []SelfServiceBalanceResponse     `json:"balances"`
	Entries   []SelfServiceLedgerEntryResponse `json:"entries"`
}

type LoginResult struct {
	Token   string
	Session SessionResponse
}

type PasswordResetTokenResponse struct {
	AccountID string    `json:"accountId"`
	Login     string    `json:"login"`
	Token     string    `json:"token"`
	ExpiresAt time.Time `json:"expiresAt"`
}

type PasswordResetResult struct {
	AccountID         string    `json:"accountId"`
	Login             string    `json:"login"`
	PasswordChangedAt time.Time `json:"passwordChangedAt"`
}

type EnablePersonAuthenticationRequest struct {
	TemporaryPassword string `json:"temporaryPassword"`
}

type PersonAuthenticationStatusResponse struct {
	Login                     string `json:"login"`
	Enabled                   bool   `json:"enabled"`
	AccountActive             bool   `json:"accountActive"`
	CanRequestReactivation    bool   `json:"canRequestReactivation"`
	RequiresTemporaryPassword bool   `json:"requiresTemporaryPassword"`
	Status                    string `json:"status"`
}

type RequestAccountReactivationRequest struct {
	Login    string `json:"login"`
	Password string `json:"password"`
}

type ReviewAccountReactivationRequest struct {
	Approve bool   `json:"approve"`
	Reason  string `json:"reason"`
}

type AccountReactivationRequestResponse struct {
	ID                string     `json:"id"`
	AccountID         string     `json:"accountId"`
	Login             string     `json:"login"`
	GlobalPersonName  string     `json:"globalPersonName,omitempty"`
	Status            string     `json:"status"`
	RequestedByType   string     `json:"requestedByType"`
	RequestedTenantID string     `json:"requestedTenantId,omitempty"`
	FirstRequestedAt  time.Time  `json:"firstRequestedAt"`
	LastRequestedAt   time.Time  `json:"lastRequestedAt"`
	RequestCount      int        `json:"requestCount"`
	ReviewedByActorID string     `json:"reviewedByActorId,omitempty"`
	ReviewedAt        *time.Time `json:"reviewedAt,omitempty"`
	ReviewReason      string     `json:"reviewReason,omitempty"`
}

type ReactivationRequestAcknowledgement struct {
	Status string `json:"status"`
}
