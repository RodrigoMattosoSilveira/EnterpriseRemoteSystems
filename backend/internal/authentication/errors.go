package authentication

import "errors"

var (
	ErrInvalidCredentials     = errors.New("invalid login or password")
	ErrAuthenticationRequired = errors.New("authenticated session is required")
	ErrSessionExpired         = errors.New("authenticated session has expired")
	ErrAccountInactive        = errors.New("authentication account is inactive")
	ErrActorInactive          = errors.New("authorization actor is inactive")
	ErrLoginAlreadyExists     = errors.New("authentication login already exists")
	ErrActorAlreadyLinked     = errors.New("authorization actor already has an authentication account")
	ErrPersonLoginNotFound    = errors.New("no person in the selected tenant has the authentication login")
	ErrPersonActorInactive    = errors.New("person authorization actor is inactive")
	ErrTenantUnavailable      = errors.New("selected tenant is unavailable")
	ErrResetTokenInvalid      = errors.New("password reset token is invalid")
	ErrResetTokenExpired      = errors.New("password reset token has expired")
)

type ValidationError struct {
	Fields map[string]string
}

func (e *ValidationError) Error() string                       { return "authentication validation failed" }
func (e *ValidationError) ValidationFields() map[string]string { return e.Fields }
