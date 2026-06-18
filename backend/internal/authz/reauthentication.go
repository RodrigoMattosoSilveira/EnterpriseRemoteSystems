package authz

import (
	"errors"
	"strings"
	"time"
)

const (
	// HeaderReauthenticatedAt carries the instant when the actor most recently
	// completed a fresh authentication challenge. It is transitional request
	// metadata until ERS has first-class authenticated sessions.
	HeaderReauthenticatedAt = "X-Reauthenticated-At"

	// HeaderReauthenticationMethod optionally identifies the mechanism used for
	// the fresh authentication challenge, such as password, passkey, or otp.
	HeaderReauthenticationMethod = "X-Reauthentication-Method"

	// RecentReauthenticationWindow is the maximum age accepted for sensitive
	// financial correction and settlement operations.
	RecentReauthenticationWindow = 15 * time.Minute

	// RecentReauthenticationFutureSkew permits small clock skew between clients
	// and the API server while still rejecting clearly invalid future values.
	RecentReauthenticationFutureSkew = 1 * time.Minute
)

var (
	ErrRecentReauthenticationRequired = errors.New("recent reauthentication is required")
	ErrRecentReauthenticationInvalid  = errors.New("recent reauthentication timestamp is invalid")
	ErrRecentReauthenticationStale    = errors.New("recent reauthentication is too old")
)

type RecentReauthentication struct {
	AuthenticatedAt time.Time
	Method          string
}

func RequireRecentReauthentication(get HeaderGetter, now time.Time) (*RecentReauthentication, error) {
	if get == nil {
		return nil, ErrRecentReauthenticationRequired
	}
	raw := strings.TrimSpace(get(HeaderReauthenticatedAt))
	if raw == "" {
		return nil, ErrRecentReauthenticationRequired
	}
	authenticatedAt, err := time.Parse(time.RFC3339, raw)
	if err != nil {
		return nil, ErrRecentReauthenticationInvalid
	}
	if now.IsZero() {
		now = time.Now().UTC()
	}
	authenticatedAt = authenticatedAt.UTC()
	now = now.UTC()
	if authenticatedAt.After(now.Add(RecentReauthenticationFutureSkew)) {
		return nil, ErrRecentReauthenticationInvalid
	}
	if now.Sub(authenticatedAt) > RecentReauthenticationWindow {
		return nil, ErrRecentReauthenticationStale
	}
	return &RecentReauthentication{AuthenticatedAt: authenticatedAt, Method: strings.TrimSpace(get(HeaderReauthenticationMethod))}, nil
}
