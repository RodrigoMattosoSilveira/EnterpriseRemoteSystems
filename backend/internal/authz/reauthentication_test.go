package authz

import (
	"errors"
	"testing"
	"time"
)

func TestRequireRecentReauthenticationAcceptsFreshTimestamp(t *testing.T) {
	now := time.Date(2026, 6, 17, 23, 30, 0, 0, time.UTC)
	reauth, err := RequireRecentReauthentication(headerGetter(map[string]string{
		HeaderReauthenticatedAt:      now.Add(-5 * time.Minute).Format(time.RFC3339),
		HeaderReauthenticationMethod: "password",
	}), now)
	if err != nil {
		t.Fatalf("expected fresh reauthentication to pass, got %v", err)
	}
	if reauth.Method != "password" || !reauth.AuthenticatedAt.Equal(now.Add(-5*time.Minute)) {
		t.Fatalf("unexpected reauthentication metadata: %+v", reauth)
	}
}

func TestRequireRecentReauthenticationRejectsMissingTimestamp(t *testing.T) {
	_, err := RequireRecentReauthentication(headerGetter(map[string]string{}), time.Now().UTC())
	if !errors.Is(err, ErrRecentReauthenticationRequired) {
		t.Fatalf("expected ErrRecentReauthenticationRequired, got %v", err)
	}
}

func TestRequireRecentReauthenticationRejectsStaleTimestamp(t *testing.T) {
	now := time.Date(2026, 6, 17, 23, 30, 0, 0, time.UTC)
	_, err := RequireRecentReauthentication(headerGetter(map[string]string{
		HeaderReauthenticatedAt: now.Add(-RecentReauthenticationWindow - time.Second).Format(time.RFC3339),
	}), now)
	if !errors.Is(err, ErrRecentReauthenticationStale) {
		t.Fatalf("expected ErrRecentReauthenticationStale, got %v", err)
	}
}

func TestRequireRecentReauthenticationRejectsInvalidTimestamp(t *testing.T) {
	_, err := RequireRecentReauthentication(headerGetter(map[string]string{HeaderReauthenticatedAt: "not-a-time"}), time.Now().UTC())
	if !errors.Is(err, ErrRecentReauthenticationInvalid) {
		t.Fatalf("expected ErrRecentReauthenticationInvalid, got %v", err)
	}
}
