package authentication

import (
	"context"
	"io"
	"time"
)

type Service interface {
	Login(ctx context.Context, req LoginRequest, userAgent string, ipAddress string) (LoginResult, error)
	ResolveSession(ctx context.Context, rawToken string) (SessionResponse, error)
	GetSelfServiceHome(ctx context.Context, accountID string) (SelfServiceHomeResponse, error)
	Logout(ctx context.Context, rawToken string) error
	ChangePassword(ctx context.Context, rawToken string, req ChangePasswordRequest) error
	ResetPassword(ctx context.Context, req ResetPasswordRequest) (PasswordResetResult, error)
	ListAccounts(ctx context.Context) ([]AccountResponse, error)
	GetAccount(ctx context.Context, id string) (AccountResponse, error)
	CreateAccount(ctx context.Context, req CreateAccountRequest) (AccountResponse, error)
	SetAccountActive(ctx context.Context, id string, active bool) (AccountResponse, error)
	IssuePasswordResetToken(ctx context.Context, accountID string) (PasswordResetTokenResponse, error)
	IssueTenantPersonPasswordResetToken(ctx context.Context, tenantID string, personID string) (PasswordResetTokenResponse, error)
	GetPersonAuthenticationStatus(ctx context.Context, tenantID string, personID string) (PersonAuthenticationStatusResponse, error)
	EnablePersonAuthentication(ctx context.Context, tenantID string, personID string, req EnablePersonAuthenticationRequest) (PersonAuthenticationStatusResponse, error)
	RequestSelfReactivation(ctx context.Context, req RequestAccountReactivationRequest, userAgent string, ipAddress string) (ReactivationRequestAcknowledgement, error)
	RequestTenantPersonReactivation(ctx context.Context, tenantID string, personID string, requesterActorID string, userAgent string, ipAddress string) (ReactivationRequestAcknowledgement, error)
	ListReactivationRequests(ctx context.Context) ([]AccountReactivationRequestResponse, error)
	ReviewReactivationRequest(ctx context.Context, requestID string, reviewerActorID string, req ReviewAccountReactivationRequest) (AccountReactivationRequestResponse, error)
}

type ServiceConfig struct {
	SessionTTL       time.Duration
	PasswordResetTTL time.Duration
	PasswordHashCost int
	Clock            func() time.Time
	RandomReader     io.Reader
}
