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
