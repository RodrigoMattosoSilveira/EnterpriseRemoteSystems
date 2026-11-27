package authentication

import (
	"context"
	"errors"
	"fmt"
	"net/mail"
	"strings"
	"time"

	"enterpriseremotesystems/backend/internal/authz"
	appdb "enterpriseremotesystems/backend/internal/db"
	"gorm.io/gorm"
)

// ChangeAccountLogin preserves the Account and all of its canonical identity
// bindings. Authentication Account login and Person contact email are separate;
// changing the contact email is explicitly opt-in and subject to an old-value
// precondition to avoid overwriting a newer edit made by another administrator.
func (s *service) ChangeAccountLogin(ctx context.Context, id string, req ChangeAccountLoginRequest, audit authz.AuthorizationAuditEntry) (AccountResponse, error) {
	id = strings.TrimSpace(id)
	req.ExpectedLogin = normalizeLogin(req.ExpectedLogin)
	req.NewLogin = normalizeLogin(req.NewLogin)
	req.Reason = strings.TrimSpace(req.Reason)
	fields := map[string]string{}
	if id == "" {
		fields["accountId"] = "Authentication Account is required"
	}
	if req.ExpectedLogin == "" {
		fields["expectedLogin"] = "Original login is required"
	}
	if !validAccountLoginEmail(req.NewLogin) {
		fields["newLogin"] = "Enter a valid email login of no more than 254 characters"
	} else if req.ExpectedLogin == req.NewLogin {
		fields["newLogin"] = "The new login must differ from the original"
	}
	if len(req.Reason) < 10 || len(req.Reason) > 500 {
		fields["reason"] = "Provide a reason between 10 and 500 characters"
	}
	if len(fields) > 0 {
		return AccountResponse{}, &ValidationError{Fields: fields}
	}
	account, err := s.repository.ChangeAccountLogin(ctx, id, req, audit, s.clock().UTC())
	if err != nil {
		return AccountResponse{}, err
	}
	return accountResponse(account), nil
}

func validAccountLoginEmail(login string) bool {
	if login == "" || len(login) > maximumLoginLength || strings.ContainsAny(login, " \t\r\n<>") || strings.Count(login, "@") != 1 {
		return false
	}
	address, err := mail.ParseAddress(login)
	if err != nil || address.Address != login {
		return false
	}
	parts := strings.SplitN(login, "@", 2)
	return parts[0] != "" && strings.Contains(parts[1], ".")
}

// ChangeAccountLogin is an all-or-nothing account security boundary. An audit
// failure must roll back the login, Person contact email, session revocation,
// and outstanding reset-token invalidation together.
func (r *GORMRepository) ChangeAccountLogin(ctx context.Context, accountID string, req ChangeAccountLoginRequest, audit authz.AuthorizationAuditEntry, now time.Time) (AccountRecord, error) {
	err := r.database.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var account Account
		if err := tx.First(&account, "id = ?", accountID).Error; err != nil {
			return err
		}
		if normalizeLogin(account.Login) != req.ExpectedLogin {
			return ErrLoginStale
		}

		var count int64
		if err := tx.Model(&Account{}).Where("login = ? COLLATE NOCASE AND id <> ?", req.NewLogin, accountID).Count(&count).Error; err != nil {
			return fmt.Errorf("check login uniqueness: %w", err)
		}
		if count != 0 {
			return ErrLoginAlreadyExists
		}

		type personIdentity struct {
			ID    string
			Email string
		}
		var person personIdentity
		found := tx.Table("auth_account_people ap").
			Select("gp.id, gp.email").
			Joins("JOIN global_people gp ON gp.id = ap.person_id").
			Where("ap.account_id = ?", accountID).Limit(1).Scan(&person)
		if found.Error != nil {
			return fmt.Errorf("find bound Person for login change: %w", found.Error)
		}
		if req.UpdatePersonEmail && (found.RowsAffected == 0 || !strings.EqualFold(strings.TrimSpace(person.Email), req.ExpectedLogin)) {
			return ErrLoginPersonEmailMismatch
		}
		// Do not claim any other Person's contact address as this Account's login.
		if err := tx.Model(&appdb.GlobalPerson{}).Where("email = ? COLLATE NOCASE AND id <> ?", req.NewLogin, person.ID).Count(&count).Error; err != nil {
			return fmt.Errorf("check Person email ownership: %w", err)
		}
		if count != 0 {
			return ErrLoginPersonEmailConflict
		}

		result := tx.Model(&Account{}).Where("id = ? AND login = ? COLLATE NOCASE", accountID, req.ExpectedLogin).
			Updates(map[string]any{"login": req.NewLogin, "updated_at": now})
		if result.Error != nil {
			if strings.Contains(strings.ToLower(result.Error.Error()), "auth_user_accounts.login") {
				return ErrLoginAlreadyExists
			}
			return fmt.Errorf("change Authentication Account login: %w", result.Error)
		}
		if result.RowsAffected != 1 {
			return ErrLoginStale
		}
		if req.UpdatePersonEmail {
			updated := tx.Model(&appdb.GlobalPerson{}).
				Where("id = ? AND email = ? COLLATE NOCASE", person.ID, req.ExpectedLogin).
				Updates(map[string]any{"email": req.NewLogin, "updated_at": now})
			if updated.Error != nil {
				return fmt.Errorf("change Person contact email: %w", updated.Error)
			}
			if updated.RowsAffected != 1 {
				return ErrLoginPersonEmailMismatch
			}
		}
		if err := revokeSessions(tx, accountID, now); err != nil {
			return err
		}
		if err := invalidatePasswordResetTokens(tx, accountID, now); err != nil {
			return err
		}
		if audit.Actor == nil || audit.Operation != "authentication.accounts.login.change" || audit.TargetID != accountID || audit.AccountID == "" {
			return errors.New("missing authenticated login-change audit attribution")
		}
		if err := authz.NewGORMStore(tx).RecordAuthorizationAudit(ctx, audit); err != nil {
			return fmt.Errorf("mandatory authentication login-change audit: %w", err)
		}
		return nil
	})
	if err != nil {
		return AccountRecord{}, err
	}
	return r.FindAccountByID(ctx, accountID)
}
