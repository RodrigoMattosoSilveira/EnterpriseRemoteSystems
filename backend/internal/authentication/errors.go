package authentication

import "errors"

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

type ValidationError struct {
	Fields map[string]string
}

func (e *ValidationError) Error() string                       { return "authentication validation failed" }
func (e *ValidationError) ValidationFields() map[string]string { return e.Fields }
