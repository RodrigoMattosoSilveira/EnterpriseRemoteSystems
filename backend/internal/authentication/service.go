package authentication

import (
	"context"
	"io"
	"time"
)

type Service interface {
	Login(ctx context.Context, req LoginRequest, userAgent string, ipAddress string) (LoginResult, error)
	ResolveSession(ctx context.Context, rawToken string) (SessionResponse, error)
	Logout(ctx context.Context, rawToken string) error
	ChangePassword(ctx context.Context, rawToken string, req ChangePasswordRequest) error
	ResetPassword(ctx context.Context, req ResetPasswordRequest) (PasswordResetResult, error)
	ListAccounts(ctx context.Context) ([]AccountResponse, error)
	GetAccount(ctx context.Context, id string) (AccountResponse, error)
	CreateAccount(ctx context.Context, req CreateAccountRequest) (AccountResponse, error)
	SetAccountActive(ctx context.Context, id string, active bool) (AccountResponse, error)
	IssuePasswordResetToken(ctx context.Context, accountID string) (PasswordResetTokenResponse, error)
}

type ServiceConfig struct {
	SessionTTL       time.Duration
	PasswordResetTTL time.Duration
	PasswordHashCost int
	Clock            func() time.Time
	RandomReader     io.Reader
}
