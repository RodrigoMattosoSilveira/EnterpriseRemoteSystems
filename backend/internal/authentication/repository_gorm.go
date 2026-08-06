package authentication

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"enterpriseremotesystems/backend/internal/authz"
	"gorm.io/gorm"
)

type GORMRepository struct {
	database *gorm.DB
}

func NewRepository(database *gorm.DB) *GORMRepository {
	return &GORMRepository{database: database}
}

type accountProjection struct {
	ID                 string
	ActorID            string
	Login              string
	PasswordHash       string
	Active             bool
	MustChangePassword bool
	LastLoginAt        *time.Time
	PasswordChangedAt  *time.Time
	CreatedAt          time.Time
	UpdatedAt          time.Time
	ActorKey           string
	DisplayName        string
	PersonID           *string
	CollaboratorID     *string
	ActorActive        bool
}

func (r *GORMRepository) ListAccounts(ctx context.Context) ([]AccountRecord, error) {
	var rows []accountProjection
	if err := r.accountQuery(ctx).
		Order("auth_user_accounts.login ASC").
		Scan(&rows).Error; err != nil {
		return nil, fmt.Errorf("list authentication accounts: %w", err)
	}
	result := make([]AccountRecord, 0, len(rows))
	for _, row := range rows {
		result = append(result, mapAccountProjection(row))
	}
	return result, nil
}

func (r *GORMRepository) FindAccountByID(ctx context.Context, id string) (AccountRecord, error) {
	var row accountProjection
	result := r.accountQuery(ctx).
		Where("auth_user_accounts.id = ?", strings.TrimSpace(id)).
		Limit(1).
		Scan(&row)
	if result.Error != nil {
		return AccountRecord{}, fmt.Errorf("find authentication account by id: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return AccountRecord{}, gorm.ErrRecordNotFound
	}
	return mapAccountProjection(row), nil
}

func (r *GORMRepository) FindAccountByLogin(ctx context.Context, login string) (AccountRecord, error) {
	var row accountProjection
	result := r.accountQuery(ctx).
		Where("auth_user_accounts.login = ? COLLATE NOCASE", strings.TrimSpace(login)).
		Limit(1).
		Scan(&row)
	if result.Error != nil {
		return AccountRecord{}, fmt.Errorf("find authentication account by login: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return AccountRecord{}, gorm.ErrRecordNotFound
	}
	return mapAccountProjection(row), nil
}

func (r *GORMRepository) ActorHasActiveTenantAccess(ctx context.Context, actorID string) (bool, error) {
	options, err := authz.NewGORMStore(r.database).ListActorTenantOptions(ctx, strings.TrimSpace(actorID))
	if err != nil {
		if errors.Is(err, authz.ErrAuthenticationRequired) {
			return false, nil
		}
		return false, fmt.Errorf("verify authorization actor tenant access: %w", err)
	}
	return len(options) > 0, nil
}

func (r *GORMRepository) CreateAccount(ctx context.Context, account Account) (AccountRecord, error) {
	err := r.database.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var actorCount int64
		if err := tx.Model(&authz.AuthzActor{}).Where("id = ?", account.ActorID).Count(&actorCount).Error; err != nil {
			return fmt.Errorf("verify authorization actor: %w", err)
		}
		if actorCount == 0 {
			return gorm.ErrRecordNotFound
		}

		var loginCount int64
		if err := tx.Model(&Account{}).Where("login = ? COLLATE NOCASE", account.Login).Count(&loginCount).Error; err != nil {
			return fmt.Errorf("check authentication login: %w", err)
		}
		if loginCount > 0 {
			return ErrLoginAlreadyExists
		}

		var actorAccountCount int64
		if err := tx.Model(&Account{}).Where("actor_id = ?", account.ActorID).Count(&actorAccountCount).Error; err != nil {
			return fmt.Errorf("check authorization actor account: %w", err)
		}
		if actorAccountCount > 0 {
			return ErrActorAlreadyLinked
		}

		if err := tx.Create(&account).Error; err != nil {
			errorText := strings.ToLower(err.Error())
			switch {
			case strings.Contains(errorText, "auth_user_accounts.login"):
				return ErrLoginAlreadyExists
			case strings.Contains(errorText, "auth_user_accounts.actor_id"):
				return ErrActorAlreadyLinked
			default:
				return fmt.Errorf("create authentication account: %w", err)
			}
		}
		return nil
	})
	if err != nil {
		return AccountRecord{}, err
	}
	return r.FindAccountByID(ctx, account.ID)
}

func (r *GORMRepository) SetAccountActive(ctx context.Context, id string, active bool, now time.Time) (AccountRecord, error) {
	err := r.database.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		result := tx.Model(&Account{}).
			Where("id = ?", strings.TrimSpace(id)).
			Updates(map[string]any{"active": active, "updated_at": now})
		if result.Error != nil {
			return fmt.Errorf("update authentication account state: %w", result.Error)
		}
		if result.RowsAffected == 0 {
			return gorm.ErrRecordNotFound
		}
		if !active {
			if err := revokeSessions(tx, id, now); err != nil {
				return err
			}
			if err := invalidatePasswordResetTokens(tx, id, now); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return AccountRecord{}, err
	}
	return r.FindAccountByID(ctx, id)
}

func (r *GORMRepository) UpdateLastLogin(ctx context.Context, id string, now time.Time) error {
	return r.database.WithContext(ctx).Model(&Account{}).
		Where("id = ?", id).
		Updates(map[string]any{"last_login_at": now, "updated_at": now}).Error
}

func (r *GORMRepository) UpdatePasswordAndRevokeSessions(ctx context.Context, id string, passwordHash string, mustChangePassword bool, now time.Time) error {
	return r.database.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		result := tx.Model(&Account{}).
			Where("id = ?", id).
			Updates(map[string]any{
				"password_hash":        passwordHash,
				"must_change_password": mustChangePassword,
				"password_changed_at":  now,
				"updated_at":           now,
			})
		if result.Error != nil {
			return fmt.Errorf("update authentication password: %w", result.Error)
		}
		if result.RowsAffected == 0 {
			return gorm.ErrRecordNotFound
		}
		if err := revokeSessions(tx, id, now); err != nil {
			return err
		}
		return invalidatePasswordResetTokens(tx, id, now)
	})
}

func (r *GORMRepository) CreateSession(ctx context.Context, session Session) error {
	if err := r.database.WithContext(ctx).Create(&session).Error; err != nil {
		return fmt.Errorf("create authentication session: %w", err)
	}
	return nil
}

func (r *GORMRepository) FindSessionByTokenHash(ctx context.Context, tokenHash string) (SessionRecord, error) {
	var session Session
	if err := r.database.WithContext(ctx).
		Where("token_hash = ?", tokenHash).
		First(&session).Error; err != nil {
		return SessionRecord{}, err
	}
	account, err := r.FindAccountByID(ctx, session.AccountID)
	if err != nil {
		return SessionRecord{}, err
	}
	return SessionRecord{Session: session, AccountRecord: account}, nil
}

func (r *GORMRepository) RevokeSession(ctx context.Context, id string, now time.Time) error {
	return r.database.WithContext(ctx).Model(&Session{}).
		Where("id = ? AND revoked_at IS NULL", id).
		Updates(map[string]any{"revoked_at": now, "updated_at": now}).Error
}

func (r *GORMRepository) RevokeSessionsForAccount(ctx context.Context, accountID string, now time.Time) error {
	return revokeSessions(r.database.WithContext(ctx), accountID, now)
}

func (r *GORMRepository) TouchSession(ctx context.Context, id string, now time.Time) error {
	return r.database.WithContext(ctx).Model(&Session{}).
		Where("id = ? AND revoked_at IS NULL", id).
		Updates(map[string]any{"last_seen_at": now, "updated_at": now}).Error
}

func (r *GORMRepository) CreatePasswordResetToken(ctx context.Context, token PasswordResetToken, now time.Time) error {
	return r.database.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := invalidatePasswordResetTokens(tx, token.AccountID, now); err != nil {
			return err
		}
		if err := tx.Create(&token).Error; err != nil {
			return fmt.Errorf("create password reset token: %w", err)
		}
		return nil
	})
}

func (r *GORMRepository) FindPasswordResetToken(ctx context.Context, tokenHash string) (PasswordResetToken, error) {
	var token PasswordResetToken
	if err := r.database.WithContext(ctx).
		Where("token_hash = ? AND used_at IS NULL", tokenHash).
		First(&token).Error; err != nil {
		return PasswordResetToken{}, err
	}
	return token, nil
}

func (r *GORMRepository) ConsumePasswordResetToken(ctx context.Context, tokenID string, passwordHash string, now time.Time) error {
	return r.database.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var token PasswordResetToken
		if err := tx.Where("id = ? AND used_at IS NULL", tokenID).First(&token).Error; err != nil {
			return err
		}
		if token.ExpiresAt.Before(now) || token.ExpiresAt.Equal(now) {
			return ErrResetTokenExpired
		}
		consumeResult := tx.Model(&PasswordResetToken{}).
			Where("id = ? AND used_at IS NULL", token.ID).
			Update("used_at", now)
		if consumeResult.Error != nil {
			return fmt.Errorf("consume password reset token: %w", consumeResult.Error)
		}
		if consumeResult.RowsAffected != 1 {
			return gorm.ErrRecordNotFound
		}
		result := tx.Model(&Account{}).
			Where("id = ?", token.AccountID).
			Updates(map[string]any{
				"password_hash":        passwordHash,
				"must_change_password": false,
				"password_changed_at":  now,
				"updated_at":           now,
			})
		if result.Error != nil {
			return fmt.Errorf("reset authentication password: %w", result.Error)
		}
		if result.RowsAffected == 0 {
			return gorm.ErrRecordNotFound
		}
		if err := invalidatePasswordResetTokens(tx, token.AccountID, now); err != nil {
			return err
		}
		return revokeSessions(tx, token.AccountID, now)
	})
}

func (r *GORMRepository) accountQuery(ctx context.Context) *gorm.DB {
	return r.database.WithContext(ctx).
		Table("auth_user_accounts").
		Select(`
			auth_user_accounts.id,
			auth_user_accounts.actor_id,
			auth_user_accounts.login,
			auth_user_accounts.password_hash,
			auth_user_accounts.active,
			auth_user_accounts.must_change_password,
			auth_user_accounts.last_login_at,
			auth_user_accounts.password_changed_at,
			auth_user_accounts.created_at,
			auth_user_accounts.updated_at,
			authz_actors.actor_key,
			authz_actors.display_name,
			authz_actors.person_id,
			authz_actors.collaborator_id,
			authz_actors.active AS actor_active`).
		Joins("JOIN authz_actors ON authz_actors.id = auth_user_accounts.actor_id")
}

func mapAccountProjection(row accountProjection) AccountRecord {
	return AccountRecord{
		Account: Account{
			ID:                 row.ID,
			ActorID:            row.ActorID,
			Login:              row.Login,
			PasswordHash:       row.PasswordHash,
			Active:             row.Active,
			MustChangePassword: row.MustChangePassword,
			LastLoginAt:        row.LastLoginAt,
			PasswordChangedAt:  row.PasswordChangedAt,
			CreatedAt:          row.CreatedAt,
			UpdatedAt:          row.UpdatedAt,
		},
		ActorKey:       row.ActorKey,
		DisplayName:    row.DisplayName,
		PersonID:       stringValue(row.PersonID),
		CollaboratorID: stringValue(row.CollaboratorID),
		ActorActive:    row.ActorActive,
	}
}

func revokeSessions(tx *gorm.DB, accountID string, now time.Time) error {
	if err := tx.Model(&Session{}).
		Where("account_id = ? AND revoked_at IS NULL", accountID).
		Updates(map[string]any{"revoked_at": now, "updated_at": now}).Error; err != nil {
		return fmt.Errorf("revoke authentication sessions: %w", err)
	}
	return nil
}

func invalidatePasswordResetTokens(tx *gorm.DB, accountID string, now time.Time) error {
	if err := tx.Model(&PasswordResetToken{}).
		Where("account_id = ? AND used_at IS NULL", accountID).
		Update("used_at", now).Error; err != nil {
		return fmt.Errorf("invalidate authentication password reset tokens: %w", err)
	}
	return nil
}

func stringValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func isNotFound(err error) bool {
	return errors.Is(err, gorm.ErrRecordNotFound)
}
