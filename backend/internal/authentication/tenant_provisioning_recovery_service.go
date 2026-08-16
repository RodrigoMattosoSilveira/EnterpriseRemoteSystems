package authentication

import (
	"context"
	"errors"
	"strings"

	"enterpriseremotesystems/backend/internal/shared/ids"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

func (s *service) GetPersonAuthenticationStatus(ctx context.Context, tenantID string, personID string) (PersonAuthenticationStatusResponse, error) {
	record, err := s.repository.FindPersonAuthentication(ctx, strings.TrimSpace(tenantID), strings.TrimSpace(personID))
	if err != nil {
		return PersonAuthenticationStatusResponse{}, err
	}
	return personAuthenticationStatusResponse(record), nil
}

func (s *service) EnablePersonAuthentication(ctx context.Context, tenantID string, personID string, req EnablePersonAuthenticationRequest) (PersonAuthenticationStatusResponse, error) {
	tenantID = strings.TrimSpace(tenantID)
	personID = strings.TrimSpace(personID)
	target, err := s.repository.FindPersonAuthentication(ctx, tenantID, personID)
	if err != nil {
		return PersonAuthenticationStatusResponse{}, err
	}
	if target.Enabled {
		return personAuthenticationStatusResponse(target), nil
	}
	if err := validatePasswordValue(req.TemporaryPassword, "temporaryPassword"); err != nil {
		return PersonAuthenticationStatusResponse{}, err
	}

	passwordHash, err := s.hashPassword(req.TemporaryPassword)
	if err != nil {
		return PersonAuthenticationStatusResponse{}, err
	}
	now := s.clock().UTC()
	// CreatePersonAccount is intentionally authoritative about create-vs-reuse.
	// The temporary password is used only if no global Account exists; when an
	// Account already exists, its login/password/session identity is preserved
	// and only this tenant's Actor binding is added.
	_, err = s.repository.CreatePersonAccount(ctx, tenantID, Account{
		ID:                 ids.New(),
		Login:              target.Login,
		PasswordHash:       passwordHash,
		Active:             true,
		MustChangePassword: true,
		CreatedAt:          now,
		UpdatedAt:          now,
	})
	if err != nil {
		return PersonAuthenticationStatusResponse{}, err
	}
	refreshed, err := s.repository.FindPersonAuthentication(ctx, tenantID, personID)
	if err != nil {
		return PersonAuthenticationStatusResponse{}, err
	}
	return personAuthenticationStatusResponse(refreshed), nil
}

func (s *service) RequestSelfReactivation(ctx context.Context, req RequestAccountReactivationRequest, userAgent string, ipAddress string) (ReactivationRequestAcknowledgement, error) {
	login := normalizeLogin(req.Login)
	if err := validateLoginAndPassword(login, req.Password); err != nil {
		return ReactivationRequestAcknowledgement{}, err
	}
	account, err := s.repository.FindAccountByLogin(ctx, login)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			_ = bcrypt.CompareHashAndPassword(s.dummyPasswordHash, []byte(req.Password))
			return ReactivationRequestAcknowledgement{}, ErrInvalidCredentials
		}
		return ReactivationRequestAcknowledgement{}, err
	}
	if bcrypt.CompareHashAndPassword([]byte(account.PasswordHash), []byte(req.Password)) != nil {
		return ReactivationRequestAcknowledgement{}, ErrInvalidCredentials
	}
	if account.Active {
		return ReactivationRequestAcknowledgement{}, ErrAccountAlreadyActive
	}
	if _, err := s.repository.CreateOrRefreshReactivationRequest(ctx, account.ID, ReactivationRequestSourceSelf, "", "", userAgent, ipAddress, s.clock().UTC()); err != nil {
		return ReactivationRequestAcknowledgement{}, err
	}
	return ReactivationRequestAcknowledgement{Status: ReactivationRequestStatusPending}, nil
}

func (s *service) RequestTenantPersonReactivation(ctx context.Context, tenantID string, personID string, requesterActorID string, userAgent string, ipAddress string) (ReactivationRequestAcknowledgement, error) {
	record, err := s.repository.FindPersonAuthentication(ctx, strings.TrimSpace(tenantID), strings.TrimSpace(personID))
	if err != nil {
		return ReactivationRequestAcknowledgement{}, err
	}
	if !record.Enabled || strings.TrimSpace(record.AccountID) == "" {
		return ReactivationRequestAcknowledgement{}, ErrAuthenticationNotEnabled
	}
	if record.AccountActive {
		return ReactivationRequestAcknowledgement{}, ErrAccountAlreadyActive
	}
	if _, err := s.repository.CreateOrRefreshReactivationRequest(ctx, record.AccountID, ReactivationRequestSourceTenantAdmin, requesterActorID, record.TenantID, userAgent, ipAddress, s.clock().UTC()); err != nil {
		return ReactivationRequestAcknowledgement{}, err
	}
	return ReactivationRequestAcknowledgement{Status: ReactivationRequestStatusPending}, nil
}

func (s *service) ListReactivationRequests(ctx context.Context) ([]AccountReactivationRequestResponse, error) {
	records, err := s.repository.ListReactivationRequests(ctx)
	if err != nil {
		return nil, err
	}
	result := make([]AccountReactivationRequestResponse, 0, len(records))
	for _, record := range records {
		result = append(result, reactivationRequestResponse(record))
	}
	return result, nil
}

func (s *service) ReviewReactivationRequest(ctx context.Context, requestID string, reviewerActorID string, req ReviewAccountReactivationRequest) (AccountReactivationRequestResponse, error) {
	requestID = strings.TrimSpace(requestID)
	reviewerActorID = strings.TrimSpace(reviewerActorID)
	reason := strings.TrimSpace(req.Reason)
	fields := map[string]string{}
	if requestID == "" {
		fields["requestId"] = "Account reactivation request is required"
	}
	if reviewerActorID == "" {
		fields["reviewerActorId"] = "Application Administrator identity is required"
	}
	if reason == "" {
		fields["reason"] = "Review reason is required"
	}
	if len(fields) > 0 {
		return AccountReactivationRequestResponse{}, &ValidationError{Fields: fields}
	}
	record, err := s.repository.ReviewReactivationRequest(ctx, requestID, reviewerActorID, req.Approve, reason, s.clock().UTC())
	if err != nil {
		return AccountReactivationRequestResponse{}, err
	}
	return reactivationRequestResponse(record), nil
}

func personAuthenticationStatusResponse(record PersonAuthenticationRecord) PersonAuthenticationStatusResponse {
	status := "NOT_ENABLED"
	if record.Enabled && record.AccountActive {
		status = "ENABLED"
	} else if record.Enabled {
		status = "ACCOUNT_INACTIVE"
	}
	return PersonAuthenticationStatusResponse{
		Login:                  normalizeLogin(record.Login),
		Enabled:                record.Enabled,
		AccountActive:          record.Enabled && record.AccountActive,
		CanRequestReactivation: record.Enabled && !record.AccountActive,
		Status:                 status,
	}
}

func reactivationRequestResponse(record ReactivationRequestRecord) AccountReactivationRequestResponse {
	response := AccountReactivationRequestResponse{
		ID:               record.ID,
		AccountID:        record.AccountID,
		Login:            normalizeLogin(record.Login),
		GlobalPersonName: strings.TrimSpace(record.GlobalPersonName),
		Status:           record.Status,
		RequestedByType:  record.RequestedByType,
		FirstRequestedAt: record.FirstRequestedAt,
		LastRequestedAt:  record.LastRequestedAt,
		RequestCount:     record.RequestCount,
		ReviewedAt:       record.ReviewedAt,
		ReviewReason:     record.ReviewReason,
	}
	if record.RequestedTenantID != nil {
		response.RequestedTenantID = strings.TrimSpace(*record.RequestedTenantID)
	}
	if record.ReviewedByActorID != nil {
		response.ReviewedByActorID = strings.TrimSpace(*record.ReviewedByActorID)
	}
	return response
}
