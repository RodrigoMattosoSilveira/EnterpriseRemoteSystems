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
	OperationalActive bool
	CollaboratorID    string
	ActorActive       bool
	AnyActorActive    bool
	Actors            []AccountActorRecord
}

type PersonAuthenticationRecord struct {
	TenantID             string
	LegacyPersonID       string
	GlobalPersonID       string
	MembershipID         string
	Login                string
	AccountID            string
	AccountExists        bool
	Enabled              bool
	AccountActive        bool
	SecuritySuspended    bool
	MembershipActive     bool
	OperationalActive    bool
	MembershipStatusCode string
}

type ReactivationRequestRecord struct {
	AccountReactivationRequest
	Login            string
	GlobalPersonName string
}

type SelfServicePersonRecord struct {
	ID                      string
	FirstName               string
	LastName                string
	Nickname                string
	CPF                     string
	RG                      string
	Cellular                string
	Email                   string
	Street1                 string
	Street2                 string
	State                   string
	City                    string
	CEP                     string
	Country                 string
	BankName                string
	BankNumber              string
	CheckingAccount         string
	PIXKey                  string
	EmergencyName           string
	EmergencyCellular       string
	EmergencyEmail          string
	ProfileCompletionStatus string
	CanCreateCollaborator   bool
}

type SelfServiceBalanceRecord struct {
	TenantID       string
	TenantName     string
	ValueUnitID    string
	ValueUnitCode  string
	ValueUnitLabel string
	Balance        float64
}

type SelfServiceLedgerEntryRecord struct {
	ID             string
	TenantID       string
	PersonID       string
	TenantName     string
	CollaboratorID string
	ValueUnitID    string
	ValueUnitCode  string
	ValueUnitLabel string
	EntryType      string
	Direction      string
	Amount         float64
	EffectiveDate  time.Time
	SourceType     string
	SourceID       string
	Description    string
}

type SelfServiceHomeRecord struct {
	Person   SelfServicePersonRecord
	Balances []SelfServiceBalanceRecord
	Entries  []SelfServiceLedgerEntryRecord
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
	CreateAccount(ctx context.Context, account Account) (AccountRecord, error)
	CreatePersonAccount(ctx context.Context, tenantID string, personID string, account Account) (AccountRecord, error)
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
	FindPersonAuthentication(ctx context.Context, tenantID string, personID string) (PersonAuthenticationRecord, error)
	FindSelfServiceHome(ctx context.Context, accountID string) (SelfServiceHomeRecord, error)
	CreateOrRefreshReactivationRequest(ctx context.Context, accountID string, source string, requesterActorID string, tenantID string, userAgent string, ipAddress string, now time.Time) (ReactivationRequestRecord, error)
	ListReactivationRequests(ctx context.Context) ([]ReactivationRequestRecord, error)
	ReviewReactivationRequest(ctx context.Context, requestID string, reviewerActorID string, approve bool, reason string, now time.Time) (ReactivationRequestRecord, error)
}
