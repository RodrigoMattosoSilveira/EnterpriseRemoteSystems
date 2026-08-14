package authentication

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"enterpriseremotesystems/backend/internal/authz"
	appdb "enterpriseremotesystems/backend/internal/db"
)

func TestAuthenticationMigrationProtectsNormalizedLoginAndActorLink(t *testing.T) {
	database, err := appdb.Open(filepath.Join(t.TempDir(), "app.db"))
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	if err := appdb.AutoMigrate(database); err != nil {
		t.Fatalf("migrate core database: %v", err)
	}
	if err := authz.AutoMigrate(database); err != nil {
		t.Fatalf("migrate authorization database: %v", err)
	}
	contents, err := os.ReadFile(filepath.Join("..", "..", "migrations", "000042_user_authentication_foundation.up.sql"))
	if err != nil {
		t.Fatalf("read authentication migration: %v", err)
	}
	if err := database.Exec(string(contents)).Error; err != nil {
		t.Fatalf("apply authentication migration: %v", err)
	}

	now := time.Now().UTC()
	firstActor := authz.AuthzActor{ID: "actor-one", ActorKey: "actor-one", Active: true, CreatedAt: now, UpdatedAt: now}
	secondActor := authz.AuthzActor{ID: "actor-two", ActorKey: "actor-two", Active: true, CreatedAt: now, UpdatedAt: now}
	if err := database.Create(&firstActor).Error; err != nil {
		t.Fatalf("create first actor: %v", err)
	}
	if err := database.Create(&secondActor).Error; err != nil {
		t.Fatalf("create second actor: %v", err)
	}

	invalid := Account{
		ID: "invalid-account", ActorID: firstActor.ID, Login: "Upper@Example.COM", PasswordHash: "hash",
		Active: true, MustChangePassword: true, CreatedAt: now, UpdatedAt: now,
	}
	if err := database.Create(&invalid).Error; err == nil || !strings.Contains(err.Error(), "authentication_login_must_be_normalized") {
		t.Fatalf("expected non-normalized login rejection, got %v", err)
	}

	valid := Account{
		ID: "valid-account", ActorID: firstActor.ID, Login: "valid@example.com", PasswordHash: "hash",
		Active: true, MustChangePassword: true, CreatedAt: now, UpdatedAt: now,
	}
	if err := database.Create(&valid).Error; err != nil {
		t.Fatalf("create valid account: %v", err)
	}
	if err := database.Model(&Account{}).Where("id = ?", valid.ID).Update("actor_id", secondActor.ID).Error; err == nil || !strings.Contains(err.Error(), "authentication_actor_id_immutable") {
		t.Fatalf("expected actor link immutability rejection, got %v", err)
	}
	if err := database.Model(&Account{}).Where("id = ?", valid.ID).Update("password_hash", "").Error; err == nil || !strings.Contains(err.Error(), "authentication_password_hash_required") {
		t.Fatalf("expected blank password-hash rejection, got %v", err)
	}
	if err := database.Delete(&Account{}, "id = ?", valid.ID).Error; err == nil || !strings.Contains(err.Error(), "authentication_account_deletion_not_allowed") {
		t.Fatalf("expected authentication account deletion rejection, got %v", err)
	}

	secondAccount := Account{
		ID: "second-account", ActorID: secondActor.ID, Login: "second@example.com", PasswordHash: "hash",
		Active: true, MustChangePassword: true, CreatedAt: now, UpdatedAt: now,
	}
	if err := database.Create(&secondAccount).Error; err != nil {
		t.Fatalf("create second account: %v", err)
	}
	session := Session{
		ID: "session-one", AccountID: valid.ID, TokenHash: "session-token-hash", ExpiresAt: now.Add(time.Hour),
		LastSeenAt: now, CreatedAt: now, UpdatedAt: now,
	}
	if err := database.Create(&session).Error; err != nil {
		t.Fatalf("create session: %v", err)
	}
	if err := database.Model(&Session{}).Where("id = ?", session.ID).Update("account_id", secondAccount.ID).Error; err == nil || !strings.Contains(err.Error(), "authentication_session_account_id_immutable") {
		t.Fatalf("expected session account immutability rejection, got %v", err)
	}

	resetToken := PasswordResetToken{
		ID: "reset-one", AccountID: valid.ID, TokenHash: "reset-token-hash", ExpiresAt: now.Add(time.Hour), CreatedAt: now,
	}
	if err := database.Create(&resetToken).Error; err != nil {
		t.Fatalf("create reset token: %v", err)
	}
	if err := database.Model(&PasswordResetToken{}).Where("id = ?", resetToken.ID).Update("account_id", secondAccount.ID).Error; err == nil || !strings.Contains(err.Error(), "authentication_reset_account_id_immutable") {
		t.Fatalf("expected reset account immutability rejection, got %v", err)
	}
}
