package authentication

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"strings"
	"time"
	"unicode/utf8"

	"enterpriseremotesystems/backend/internal/shared/ids"
	"golang.org/x/crypto/bcrypt"
)

const (
	defaultSessionTTL        = 12 * time.Hour
	defaultPasswordResetTTL  = 30 * time.Minute
	minimumPasswordLength    = 12
	maximumBcryptPasswordLen = 72
	maximumLoginLength       = 254
)

type service struct {
	repository        Repository
	sessionTTL        time.Duration
	passwordResetTTL  time.Duration
	passwordHashCost  int
	clock             func() time.Time
	randomReader      io.Reader
	dummyPasswordHash []byte
}

func NewService(repository Repository, cfg ServiceConfig) Service {
	if cfg.SessionTTL <= 0 {
		cfg.SessionTTL = defaultSessionTTL
	}
	if cfg.PasswordResetTTL <= 0 {
		cfg.PasswordResetTTL = defaultPasswordResetTTL
	}
	if cfg.PasswordHashCost < bcrypt.MinCost || cfg.PasswordHashCost > bcrypt.MaxCost {
		cfg.PasswordHashCost = bcrypt.DefaultCost
	}
	if cfg.Clock == nil {
		cfg.Clock = func() time.Time { return time.Now().UTC() }
	}
	if cfg.RandomReader == nil {
		cfg.RandomReader = rand.Reader
	}
	dummyHash, err := bcrypt.GenerateFromPassword([]byte("ers-invalid-authentication-password"), cfg.PasswordHashCost)
	if err != nil {
		panic(fmt.Sprintf("create authentication comparison hash: %v", err))
	}
	return &service{
		repository:        repository,
		sessionTTL:        cfg.SessionTTL,
		passwordResetTTL:  cfg.PasswordResetTTL,
		passwordHashCost:  cfg.PasswordHashCost,
		clock:             cfg.Clock,
		randomReader:      cfg.RandomReader,
		dummyPasswordHash: dummyHash,
	}
}

func (s *service) Login(ctx context.Context, req LoginRequest, userAgent string, ipAddress string) (LoginResult, error) {
	login := normalizeLogin(req.Login)
	if err := validateLoginAndPassword(login, req.Password); err != nil {
		return LoginResult{}, err
	}

	account, err := s.repository.FindAccountByLogin(ctx, login)
	if err != nil {
		if isNotFound(err) {
			_ = bcrypt.CompareHashAndPassword(s.dummyPasswordHash, []byte(req.Password))
			return LoginResult{}, ErrInvalidCredentials
		}
		return LoginResult{}, err
	}
	if err := bcrypt.CompareHashAndPassword([]byte(account.PasswordHash), []byte(req.Password)); err != nil {
		return LoginResult{}, ErrInvalidCredentials
	}
	if !account.Active {
		return LoginResult{}, ErrAccountInactive
	}
	now := s.clock().UTC()

	rawToken, tokenHash, err := s.newToken("ers_s_")
	if err != nil {
		return LoginResult{}, err
	}
	expiresAt := now.Add(s.sessionTTL)
	session := Session{
		ID:         ids.New(),
		AccountID:  account.ID,
		TokenHash:  tokenHash,
		ExpiresAt:  expiresAt,
		LastSeenAt: now,
		UserAgent:  strings.TrimSpace(userAgent),
		IPAddress:  strings.TrimSpace(ipAddress),
		CreatedAt:  now,
		UpdatedAt:  now,
	}
	if err := s.repository.CreateSession(ctx, session); err != nil {
		return LoginResult{}, err
	}
	refreshedAccount, err := s.repository.FindAccountByID(ctx, account.ID)
	if err != nil {
		_ = s.repository.RevokeSession(ctx, session.ID, now)
		return LoginResult{}, err
	}
	if !refreshedAccount.Active {
		_ = s.repository.RevokeSession(ctx, session.ID, now)
		return LoginResult{}, ErrAccountInactive
	}
	if err := s.repository.UpdateLastLogin(ctx, account.ID, now); err != nil {
		_ = s.repository.RevokeSession(ctx, session.ID, now)
		return LoginResult{}, err
	}

	return LoginResult{
		Token:   rawToken,
		Session: sessionResponse(account, expiresAt),
	}, nil
}

func (s *service) ResolveSession(ctx context.Context, rawToken string) (SessionResponse, error) {
	rawToken = strings.TrimSpace(rawToken)
	if rawToken == "" {
		return SessionResponse{}, ErrAuthenticationRequired
	}
	record, err := s.repository.FindSessionByTokenHash(ctx, hashToken(rawToken))
	if err != nil {
		if isNotFound(err) {
			return SessionResponse{}, ErrAuthenticationRequired
		}
		return SessionResponse{}, err
	}
	now := s.clock().UTC()
	if !record.Account.Active {
		_ = s.repository.RevokeSession(ctx, record.Session.ID, now)
		return SessionResponse{}, ErrAccountInactive
	}
	if record.RevokedAt != nil {
		return SessionResponse{}, ErrAuthenticationRequired
	}
	if !record.ExpiresAt.After(now) {
		_ = s.repository.RevokeSession(ctx, record.Session.ID, now)
		return SessionResponse{}, ErrSessionExpired
	}
	if now.Sub(record.LastSeenAt) >= 5*time.Minute {
		if err := s.repository.TouchSession(ctx, record.Session.ID, now); err != nil {
			return SessionResponse{}, err
		}
	}
	return sessionResponse(record.AccountRecord, record.ExpiresAt), nil
}

func (s *service) GetSelfServiceHome(ctx context.Context, accountID string) (SelfServiceHomeResponse, error) {
	accountID = strings.TrimSpace(accountID)
	if accountID == "" {
		return SelfServiceHomeResponse{}, ErrAuthenticationRequired
	}

	record, err := s.repository.FindSelfServiceHome(ctx, accountID)
	if err != nil {
		return SelfServiceHomeResponse{}, err
	}

	person := record.Person
	balances := make([]SelfServiceBalanceResponse, 0, len(record.Balances))
	for _, balance := range record.Balances {
		balances = append(balances, SelfServiceBalanceResponse{
			TenantID:       balance.TenantID,
			TenantName:     balance.TenantName,
			ValueUnitID:    balance.ValueUnitID,
			ValueUnitCode:  balance.ValueUnitCode,
			ValueUnitLabel: balance.ValueUnitLabel,
			Balance:        balance.Balance,
		})
	}

	entries := make([]SelfServiceLedgerEntryResponse, 0, len(record.Entries))
	for _, entry := range record.Entries {
		signedAmount := entry.Amount
		if strings.EqualFold(strings.TrimSpace(entry.Direction), "DEBIT") {
			signedAmount = -entry.Amount
		}
		entries = append(entries, SelfServiceLedgerEntryResponse{
			ID:             entry.ID,
			TenantID:       entry.TenantID,
			TenantName:     entry.TenantName,
			PersonID:       entry.PersonID,
			CollaboratorID: entry.CollaboratorID,
			ValueUnitID:    entry.ValueUnitID,
			ValueUnitCode:  entry.ValueUnitCode,
			ValueUnitLabel: entry.ValueUnitLabel,
			EntryType:      entry.EntryType,
			Direction:      entry.Direction,
			Amount:         entry.Amount,
			SignedAmount:   signedAmount,
			EffectiveDate:  entry.EffectiveDate,
			SourceType:     entry.SourceType,
			SourceID:       entry.SourceID,
			Description:    entry.Description,
		})
	}

	return SelfServiceHomeResponse{
		AccountID: accountID,
		Person: SelfServicePersonResponse{
			ID:                      person.ID,
			FirstName:               person.FirstName,
			LastName:                person.LastName,
			Nickname:                person.Nickname,
			CPF:                     person.CPF,
			RG:                      person.RG,
			Cellular:                person.Cellular,
			Email:                   person.Email,
			Street1:                 person.Street1,
			Street2:                 person.Street2,
			State:                   person.State,
			City:                    person.City,
			CEP:                     person.CEP,
			Country:                 person.Country,
			BankName:                person.BankName,
			BankNumber:              person.BankNumber,
			CheckingAccount:         person.CheckingAccount,
			PIXKey:                  person.PIXKey,
			EmergencyName:           person.EmergencyName,
			EmergencyCellular:       person.EmergencyCellular,
			EmergencyEmail:          person.EmergencyEmail,
			ProfileCompletionStatus: person.ProfileCompletionStatus,
			CanCreateCollaborator:   person.CanCreateCollaborator,
		},
		Balances: balances,
		Entries:  entries,
	}, nil
}

func (s *service) Logout(ctx context.Context, rawToken string) error {
	rawToken = strings.TrimSpace(rawToken)
	if rawToken == "" {
		return nil
	}
	record, err := s.repository.FindSessionByTokenHash(ctx, hashToken(rawToken))
	if err != nil {
		if isNotFound(err) {
			return nil
		}
		return err
	}
	return s.repository.RevokeSession(ctx, record.Session.ID, s.clock().UTC())
}

func (s *service) ChangePassword(ctx context.Context, rawToken string, req ChangePasswordRequest) error {
	if strings.TrimSpace(req.CurrentPassword) == "" {
		return &ValidationError{Fields: map[string]string{"currentPassword": "Current password is required"}}
	}
	if err := validateNewPassword(req.NewPassword); err != nil {
		return err
	}
	record, err := s.repository.FindSessionByTokenHash(ctx, hashToken(strings.TrimSpace(rawToken)))
	if err != nil {
		if isNotFound(err) {
			return ErrAuthenticationRequired
		}
		return err
	}
	if _, err := s.ResolveSession(ctx, rawToken); err != nil {
		return err
	}
	if err := bcrypt.CompareHashAndPassword([]byte(record.PasswordHash), []byte(req.CurrentPassword)); err != nil {
		return ErrInvalidCredentials
	}
	if bcrypt.CompareHashAndPassword([]byte(record.PasswordHash), []byte(req.NewPassword)) == nil {
		return &ValidationError{Fields: map[string]string{"newPassword": "New password must differ from the current password"}}
	}
	passwordHash, err := s.hashPassword(req.NewPassword)
	if err != nil {
		return err
	}
	return s.repository.UpdatePasswordAndRevokeSessions(ctx, record.Account.ID, passwordHash, false, s.clock().UTC())
}

func (s *service) ResetPassword(ctx context.Context, req ResetPasswordRequest) (PasswordResetResult, error) {
	if strings.TrimSpace(req.Token) == "" {
		return PasswordResetResult{}, &ValidationError{Fields: map[string]string{"token": "Password reset token is required"}}
	}
	if err := validateNewPassword(req.NewPassword); err != nil {
		return PasswordResetResult{}, err
	}
	token, err := s.repository.FindPasswordResetToken(ctx, hashToken(strings.TrimSpace(req.Token)))
	if err != nil {
		if isNotFound(err) {
			return PasswordResetResult{}, ErrResetTokenInvalid
		}
		return PasswordResetResult{}, err
	}
	account, err := s.repository.FindAccountByID(ctx, token.AccountID)
	if err != nil {
		if isNotFound(err) {
			return PasswordResetResult{}, ErrResetTokenInvalid
		}
		return PasswordResetResult{}, err
	}
	if !account.Active {
		return PasswordResetResult{}, ErrAccountInactive
	}
	now := s.clock().UTC()
	if !token.ExpiresAt.After(now) {
		return PasswordResetResult{}, ErrResetTokenExpired
	}
	passwordHash, err := s.hashPassword(req.NewPassword)
	if err != nil {
		return PasswordResetResult{}, err
	}
	if err := s.repository.ConsumePasswordResetToken(ctx, token.ID, passwordHash, now); err != nil {
		if isNotFound(err) {
			return PasswordResetResult{}, ErrResetTokenInvalid
		}
		return PasswordResetResult{}, err
	}
	updated, err := s.repository.FindAccountByID(ctx, token.AccountID)
	if err != nil {
		return PasswordResetResult{}, err
	}
	if err := bcrypt.CompareHashAndPassword([]byte(updated.PasswordHash), []byte(req.NewPassword)); err != nil {
		return PasswordResetResult{}, fmt.Errorf("verify persisted authentication password: %w", err)
	}
	if updated.PasswordChangedAt == nil {
		return PasswordResetResult{}, fmt.Errorf("verify persisted authentication password timestamp")
	}
	return PasswordResetResult{
		AccountID:         updated.ID,
		Login:             normalizeLogin(updated.Login),
		PasswordChangedAt: *updated.PasswordChangedAt,
	}, nil
}

func (s *service) ListAccounts(ctx context.Context) ([]AccountResponse, error) {
	accounts, err := s.repository.ListAccounts(ctx)
	if err != nil {
		return nil, err
	}
	responses := make([]AccountResponse, 0, len(accounts))
	for _, account := range accounts {
		responses = append(responses, accountResponse(account))
	}
	return responses, nil
}

func (s *service) GetAccount(ctx context.Context, id string) (AccountResponse, error) {
	account, err := s.repository.FindAccountByID(ctx, strings.TrimSpace(id))
	if err != nil {
		return AccountResponse{}, err
	}
	return accountResponse(account), nil
}

func (s *service) CreateAccount(ctx context.Context, req CreateAccountRequest) (AccountResponse, error) {
	actorID := strings.TrimSpace(req.ActorID)
	tenantID := strings.TrimSpace(req.TenantID)
	login := normalizeLogin(req.Login)
	fields := map[string]string{}
	if actorID == "" && tenantID == "" {
		fields["actorId"] = "Select an authorization actor or create the account in a selected tenant"
	}
	if login == "" {
		fields["login"] = "Login is required"
	} else if utf8.RuneCountInString(login) > maximumLoginLength {
		fields["login"] = "Login must be 254 characters or fewer"
	}
	if err := validatePasswordValue(req.TemporaryPassword, "temporaryPassword"); err != nil {
		for key, value := range err.ValidationFields() {
			fields[key] = value
		}
	}
	if len(fields) > 0 {
		return AccountResponse{}, &ValidationError{Fields: fields}
	}

	passwordHash, err := s.hashPassword(req.TemporaryPassword)
	if err != nil {
		return AccountResponse{}, err
	}
	mustChangePassword := true
	if req.MustChangePassword != nil {
		mustChangePassword = *req.MustChangePassword
	}
	if actorID == "" {
		// Accounts created while provisioning a Person Actor always start with a
		// temporary password. The administrator-facing workflow must not be able
		// to bypass the first-login password change through a stale or malformed
		// client payload.
		mustChangePassword = true
	}
	now := s.clock().UTC()
	accountInput := Account{
		ID:                 ids.New(),
		ActorID:            actorID,
		Login:              login,
		PasswordHash:       passwordHash,
		Active:             true,
		MustChangePassword: mustChangePassword,
		CreatedAt:          now,
		UpdatedAt:          now,
	}

	var account AccountRecord
	if actorID == "" {
		account, err = s.repository.CreatePersonAccount(ctx, tenantID, accountInput)
		switch {
		case errors.Is(err, ErrPersonLoginNotFound):
			return AccountResponse{}, &ValidationError{Fields: map[string]string{
				"login": "No Person in the selected tenant has this login email",
			}}
		case errors.Is(err, ErrPersonActorInactive):
			return AccountResponse{}, &ValidationError{Fields: map[string]string{
				"actorId": "The Person's authorization actor is inactive; reactivate it before creating the account",
			}}
		case errors.Is(err, ErrTenantUnavailable):
			return AccountResponse{}, &ValidationError{Fields: map[string]string{
				"actorId": "The selected tenant is inactive or unavailable",
			}}
		case err != nil:
			return AccountResponse{}, err
		}
	} else {
		hasTenantAccess, accessErr := s.repository.ActorHasActiveTenantAccess(ctx, actorID)
		if accessErr != nil {
			return AccountResponse{}, accessErr
		}
		if !hasTenantAccess {
			return AccountResponse{}, &ValidationError{Fields: map[string]string{
				"actorId": "Authorization actor must be linked to an active Person-Tenant Membership before creating an account",
			}}
		}
		account, err = s.repository.CreateAccount(ctx, accountInput)
		if err != nil {
			return AccountResponse{}, err
		}
	}
	return accountResponse(account), nil
}

func (s *service) SetAccountActive(ctx context.Context, id string, active bool) (AccountResponse, error) {
	account, err := s.repository.SetAccountActive(ctx, strings.TrimSpace(id), active, s.clock().UTC())
	if err != nil {
		return AccountResponse{}, err
	}
	return accountResponse(account), nil
}

func (s *service) IssuePasswordResetToken(ctx context.Context, accountID string) (PasswordResetTokenResponse, error) {
	accountID = strings.TrimSpace(accountID)
	if accountID == "" {
		return PasswordResetTokenResponse{}, &ValidationError{Fields: map[string]string{"accountId": "Authentication account is required"}}
	}
	account, err := s.repository.FindAccountByID(ctx, accountID)
	if err != nil {
		return PasswordResetTokenResponse{}, err
	}
	if !account.Active {
		return PasswordResetTokenResponse{}, &ValidationError{Fields: map[string]string{
			"accountId": "Password reset tokens can only be issued for active authentication accounts",
		}}
	}
	rawToken, tokenHash, err := s.newToken("ers_pr_")
	if err != nil {
		return PasswordResetTokenResponse{}, err
	}
	now := s.clock().UTC()
	expiresAt := now.Add(s.passwordResetTTL)
	if err := s.repository.CreatePasswordResetToken(ctx, PasswordResetToken{
		ID:        ids.New(),
		AccountID: accountID,
		TokenHash: tokenHash,
		ExpiresAt: expiresAt,
		CreatedAt: now,
	}, now); err != nil {
		return PasswordResetTokenResponse{}, err
	}
	return PasswordResetTokenResponse{AccountID: account.ID, Login: normalizeLogin(account.Login), Token: rawToken, ExpiresAt: expiresAt}, nil
}

func (s *service) hashPassword(password string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), s.passwordHashCost)
	if err != nil {
		return "", fmt.Errorf("hash authentication password: %w", err)
	}
	return string(hash), nil
}

func (s *service) newToken(prefix string) (string, string, error) {
	buffer := make([]byte, 32)
	if _, err := io.ReadFull(s.randomReader, buffer); err != nil {
		return "", "", fmt.Errorf("generate authentication token: %w", err)
	}
	rawToken := prefix + base64.RawURLEncoding.EncodeToString(buffer)
	return rawToken, hashToken(rawToken), nil
}

func hashToken(rawToken string) string {
	sum := sha256.Sum256([]byte(rawToken))
	return base64.RawURLEncoding.EncodeToString(sum[:])
}

func normalizeLogin(login string) string {
	return strings.ToLower(strings.TrimSpace(login))
}

func validateLoginAndPassword(login string, password string) error {
	fields := map[string]string{}
	if login == "" {
		fields["login"] = "Login is required"
	}
	if strings.TrimSpace(password) == "" {
		fields["password"] = "Password is required"
	}
	if len(fields) > 0 {
		return &ValidationError{Fields: fields}
	}
	return nil
}

func validateNewPassword(password string) error {
	validationError := validatePasswordValue(password, "newPassword")
	if validationError != nil {
		return validationError
	}
	return nil
}

func validatePasswordValue(password string, field string) *ValidationError {
	length := utf8.RuneCountInString(password)
	if length < minimumPasswordLength {
		return &ValidationError{Fields: map[string]string{field: "Password must contain at least 12 characters"}}
	}
	if len([]byte(password)) > maximumBcryptPasswordLen {
		return &ValidationError{Fields: map[string]string{field: "Password must contain no more than 72 UTF-8 bytes"}}
	}
	return nil
}

func sessionResponse(account AccountRecord, expiresAt time.Time) SessionResponse {
	displayName := strings.TrimSpace(account.GlobalPersonName)
	if displayName == "" {
		displayName = strings.TrimSpace(account.DisplayName)
	}
	if displayName == "" {
		displayName = normalizeLogin(account.Login)
	}
	return SessionResponse{
		AccountID:          account.ID,
		DisplayName:        displayName,
		Login:              normalizeLogin(account.Login),
		MustChangePassword: account.MustChangePassword,
		ExpiresAt:          expiresAt,
		ActorID:            account.ActorID,
		ActorKey:           account.ActorKey,
		PersonID:           account.PersonID,
		CollaboratorID:     account.CollaboratorID,
	}
}

func accountResponse(account AccountRecord) AccountResponse {
	actors := make([]AccountActorResponse, 0, len(account.Actors))
	for _, actor := range account.Actors {
		actors = append(actors, AccountActorResponse{
			ActorID: actor.ActorID, ActorKey: actor.ActorKey, DisplayName: actor.DisplayName,
			Scope: actor.ScopeType, TenantID: actor.TenantID, TenantName: actor.TenantName, MembershipID: actor.MembershipID,
			PersonID: actor.PersonID, PersonName: actor.PersonName, PersonNickname: actor.PersonNickname, CollaboratorID: actor.CollaboratorID,
			Active: actor.Active, Primary: actor.Primary,
		})
	}
	return AccountResponse{
		ID:                 account.ID,
		ActorID:            account.ActorID,
		ActorKey:           account.ActorKey,
		DisplayName:        account.DisplayName,
		GlobalPersonID:     account.GlobalPersonID,
		GlobalPersonName:   account.GlobalPersonName,
		GlobalPersonEmail:  account.GlobalPersonEmail,
		Actors:             actors,
		Login:              account.Login,
		Active:             account.Active,
		ActorActive:        account.ActorActive,
		MustChangePassword: account.MustChangePassword,
		LastLoginAt:        account.LastLoginAt,
		PasswordChangedAt:  account.PasswordChangedAt,
		CreatedAt:          account.CreatedAt,
		UpdatedAt:          account.UpdatedAt,
	}
}
