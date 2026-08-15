package authentication

import (
	"context"
	"time"
)

type AccountActorRecord struct {
	ActorID        string
	ActorKey       string
	DisplayName    string
	PersonID       string
	PersonName     string
	PersonNickname string
	CollaboratorID string
	ScopeType      string
	TenantID       string
	TenantName     string
	MembershipID   string
	Active         bool
	Primary        bool
}

type AccountRecord struct {
	Account
	ActorKey          string
	DisplayName       string
	PersonID          string
	GlobalPersonID    string
	GlobalPersonName  string
	GlobalPersonEmail string
	CollaboratorID    string
	ActorActive       bool
	AnyActorActive    bool
	Actors            []AccountActorRecord
}

type SessionRecord struct {
	Session
	AccountRecord
}

type Repository interface {
	ListAccounts(ctx context.Context) ([]AccountRecord, error)
	FindAccountByID(ctx context.Context, id string) (AccountRecord, error)
	FindAccountByLogin(ctx context.Context, login string) (AccountRecord, error)
	ActorHasActiveTenantAccess(ctx context.Context, actorID string) (bool, error)
	EnsureActorPersonSelfAccess(ctx context.Context, actorID string, now time.Time) error
	CreateAccount(ctx context.Context, account Account) (AccountRecord, error)
	CreatePersonAccount(ctx context.Context, tenantID string, account Account) (AccountRecord, error)
	SetAccountActive(ctx context.Context, id string, active bool, now time.Time) (AccountRecord, error)
	UpdateLastLogin(ctx context.Context, id string, now time.Time) error
	UpdatePasswordAndRevokeSessions(ctx context.Context, id string, passwordHash string, mustChangePassword bool, now time.Time) error
	CreateSession(ctx context.Context, session Session) error
	FindSessionByTokenHash(ctx context.Context, tokenHash string) (SessionRecord, error)
	RevokeSession(ctx context.Context, id string, now time.Time) error
	RevokeSessionsForAccount(ctx context.Context, accountID string, now time.Time) error
	TouchSession(ctx context.Context, id string, now time.Time) error
	CreatePasswordResetToken(ctx context.Context, token PasswordResetToken, now time.Time) error
	FindPasswordResetToken(ctx context.Context, tokenHash string) (PasswordResetToken, error)
	ConsumePasswordResetToken(ctx context.Context, tokenID string, passwordHash string, now time.Time) error
}
