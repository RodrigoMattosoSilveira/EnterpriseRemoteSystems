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

type AccountResponse struct {
	ID                 string     `json:"id"`
	ActorID            string     `json:"actorId"`
	ActorKey           string     `json:"actorKey"`
	DisplayName        string     `json:"displayName"`
	Login              string     `json:"login"`
	Active             bool       `json:"active"`
	ActorActive        bool       `json:"actorActive"`
	MustChangePassword bool       `json:"mustChangePassword"`
	LastLoginAt        *time.Time `json:"lastLoginAt,omitempty"`
	PasswordChangedAt  *time.Time `json:"passwordChangedAt,omitempty"`
	CreatedAt          time.Time  `json:"createdAt"`
	UpdatedAt          time.Time  `json:"updatedAt"`
}

type SessionResponse struct {
	AccountID          string    `json:"accountId"`
	ActorID            string    `json:"actorId"`
	ActorKey           string    `json:"actorKey"`
	DisplayName        string    `json:"displayName"`
	PersonID           string    `json:"personId,omitempty"`
	CollaboratorID     string    `json:"collaboratorId,omitempty"`
	Login              string    `json:"login"`
	MustChangePassword bool      `json:"mustChangePassword"`
	ExpiresAt          time.Time `json:"expiresAt"`
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
