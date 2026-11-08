package authentication

import (
	"errors"

	"enterpriseremotesystems/backend/internal/shared/fielderrors"
)

var (
	ErrInvalidCredentials           = errors.New("invalid login or password")
	ErrAuthenticationRequired       = errors.New("authenticated session is required")
	ErrSessionExpired               = errors.New("authenticated session has expired")
	ErrAccountInactive              = errors.New("authentication account is inactive")
	ErrAccountSecuritySuspended     = errors.New("authentication account is security-suspended")
	ErrAccountOperationallyInactive = errors.New("authentication account is operationally inactive")
	ErrTenantReactivationRequired   = errors.New("tenant administrator reactivation is required")
	ErrActorInactive                = errors.New("authorization actor is inactive")
	ErrLoginAlreadyExists           = errors.New("authentication login already exists")
	ErrActorAlreadyLinked           = errors.New("authorization actor already has an authentication account")
	ErrPersonLoginNotFound          = errors.New("no person in the selected tenant has the authentication login")
	ErrPersonActorInactive          = errors.New("person authorization actor is inactive")
	ErrTenantUnavailable            = errors.New("selected tenant is unavailable")
	ErrResetTokenInvalid            = errors.New("password reset token is invalid")
	ErrResetTokenExpired            = errors.New("password reset token has expired")
	ErrPersonMembershipRequired     = errors.New("an active Person-Tenant Membership is required")
	ErrAuthenticationNotEnabled     = errors.New("authentication is not enabled for this tenant")
	ErrAccountAlreadyActive         = errors.New("authentication account is already active")
	ErrReactivationNotPending       = errors.New("account reactivation request is not pending")
)

// ValidationError carries English field messages plus a stable rule code per
// field (Codes), which clients translate. See internal/shared/fielderrors.
type ValidationError struct {
	Fields map[string]string
	Codes  map[string]string
}

func (e *ValidationError) Error() string                           { return "authentication validation failed" }
func (e *ValidationError) ValidationFields() map[string]string     { return e.Fields }
func (e *ValidationError) ValidationFieldCodes() map[string]string { return e.Codes }

// Stable Authentication rule codes returned as `fieldCodes` (shared ones live
// in fielderrors). Renaming one is an API change.
const (
	RuleTooLong                 = "too_long"
	RulePasswordTooShort        = "password_too_short"
	RulePasswordTooLong         = "password_too_long"
	RulePasswordUnchanged       = "password_unchanged"
	RuleTenantSelectionRequired = "tenant_selection_required"
	RulePersonLoginNotFound     = "person_login_not_found"
	RuleMembershipNotActive     = "membership_not_active"
	RulePersonActorInactive     = "person_actor_inactive"
	RuleTenantUnavailable       = "tenant_unavailable"
	RuleAccountNotActive        = "account_not_active"
)

func fieldError(field string, rule string, message string) *ValidationError {
	fields, codes := fielderrors.Single(field, rule, message)
	return &ValidationError{Fields: fields, Codes: codes}
}

func validationError(errs *fielderrors.Collector) error {
	if errs.Empty() {
		return nil
	}
	return &ValidationError{Fields: errs.Fields, Codes: errs.Codes}
}
