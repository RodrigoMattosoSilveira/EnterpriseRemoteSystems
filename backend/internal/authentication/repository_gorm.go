package authentication

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"enterpriseremotesystems/backend/internal/authz"
	appdb "enterpriseremotesystems/backend/internal/db"
	"enterpriseremotesystems/backend/internal/shared/ids"
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
		record, err := r.hydrateAccountActors(ctx, mapAccountProjection(row))
		if err != nil {
			return nil, err
		}
		result = append(result, record)
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
	return r.hydrateAccountActors(ctx, mapAccountProjection(row))
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
	return r.hydrateAccountActors(ctx, mapAccountProjection(row))
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

func (r *GORMRepository) EnsureActorPersonSelfAccess(ctx context.Context, actorID string, now time.Time) error {
	return r.database.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var actor authz.AuthzActor
		result := tx.Where("id = ?", strings.TrimSpace(actorID)).Limit(1).Find(&actor)
		if result.Error != nil {
			return fmt.Errorf("find authentication authorization actor: %w", result.Error)
		}
		if result.RowsAffected == 0 {
			return gorm.ErrRecordNotFound
		}
		return ensureAuthenticatedActorPersonSelfAccess(tx, &actor, now)
	})
}

func (r *GORMRepository) CreateAccount(ctx context.Context, account Account) (AccountRecord, error) {
	accountID := account.ID
	err := r.database.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Bite 30B deliberately kept legacy People writers alive during the
		// staged cutover. Repair those projections before using Person identity
		// to enforce the one-human/one-Account invariant.
		if tx.Migrator().HasTable(&appdb.PersonTenantMembership{}) {
			if err := appdb.EnsureGlobalPersonMembershipFoundation(tx); err != nil {
				return err
			}
		}

		var actor authz.AuthzActor
		result := tx.Where("id = ?", account.ActorID).Limit(1).Find(&actor)
		if result.Error != nil {
			return fmt.Errorf("verify authorization actor: %w", result.Error)
		}
		if result.RowsAffected == 0 {
			return gorm.ErrRecordNotFound
		}

		if err := ensureAuthenticatedActorPersonSelfAccess(tx, &actor, account.CreatedAt); err != nil {
			return err
		}

		// Once the 30C ownership tables exist, selecting a second tenant Actor
		// for a Person who already has an Authentication Account extends that
		// Account instead of creating a second login identity.
		if tx.Migrator().HasTable(&AccountActor{}) && tx.Migrator().HasTable(&AccountPerson{}) {
			applicationAdmin, err := actorHasApplicationAdminGrant(tx, actor.ID)
			if err != nil {
				return err
			}
			if !applicationAdmin {
				personID, membership, err := resolveLegacyActorGlobalPerson(tx, actor)
				if err != nil {
					return err
				}
				if personID != "" {
					var existingPersonBinding AccountPerson
					existingResult := tx.Where("person_id = ?", personID).Limit(1).Find(&existingPersonBinding)
					if existingResult.Error != nil {
						return fmt.Errorf("find existing Authentication Account for Actor Person: %w", existingResult.Error)
					}
					if existingResult.RowsAffected > 0 {
						if membership == nil {
							return fmt.Errorf("authorization actor %s has a global Person but no Person-Tenant Membership", actor.ID)
						}
						binding := AccountActor{
							AccountID: existingPersonBinding.AccountID,
							ActorID:   actor.ID,
							ScopeType: AccountActorScopeTenant,
							Primary:   false,
							CreatedAt: account.CreatedAt,
							UpdatedAt: account.UpdatedAt,
						}
						tenantID := membership.TenantID
						membershipID := membership.ID
						binding.TenantID = &tenantID
						binding.MembershipID = &membershipID
						if err := ensureAccountActorBinding(tx, binding); err != nil {
							return err
						}
						accountID = existingPersonBinding.AccountID
						return nil
					}
				}
			}
		}

		if err := createAuthenticationAccount(tx, account); err != nil {
			return err
		}
		if err := ensureAccountActorFoundation(tx, account); err != nil {
			return err
		}
		accountID = account.ID
		return nil
	})
	if err != nil {
		return AccountRecord{}, err
	}
	return r.FindAccountByID(ctx, accountID)
}

func ensureAuthenticatedActorPersonSelfAccess(tx *gorm.DB, actor *authz.AuthzActor, now time.Time) error {
	if actor == nil {
		return nil
	}
	if now.IsZero() {
		now = time.Now().UTC()
	}

	personID := ""
	if actor.PersonID != nil {
		personID = strings.TrimSpace(*actor.PersonID)
	}
	if personID == "" && actor.CollaboratorID != nil && strings.TrimSpace(*actor.CollaboratorID) != "" {
		var collaborator appdb.CollaboratorJourney
		result := tx.Where("id = ?", strings.TrimSpace(*actor.CollaboratorID)).Limit(1).Find(&collaborator)
		if result.Error != nil {
			return fmt.Errorf("find authentication actor collaborator: %w", result.Error)
		}
		if result.RowsAffected > 0 {
			personID = strings.TrimSpace(collaborator.PersonID)
			if personID != "" {
				if err := tx.Model(&authz.AuthzActor{}).Where("id = ?", actor.ID).Updates(map[string]any{
					"person_id":  personID,
					"updated_at": now,
				}).Error; err != nil {
					return fmt.Errorf("link authentication actor to person: %w", err)
				}
				actor.PersonID = &personID
			}
		}
	}
	if personID == "" {
		return nil
	}

	var person appdb.Person
	result := tx.Where("id = ?", personID).Limit(1).Find(&person)
	if result.Error != nil {
		return fmt.Errorf("find authentication actor person: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return nil
	}

	var personRole authz.AuthzRole
	if err := tx.Where("code = ? AND active = ?", string(authz.RolePerson), true).First(&personRole).Error; err != nil {
		return fmt.Errorf("find Person authorization role: %w", err)
	}

	var grant authz.AuthzActorRoleGrant
	grantResult := tx.
		Where("actor_id = ? AND role_id = ? AND tenant_id = ?", actor.ID, personRole.ID, person.TenantID).
		Limit(1).
		Find(&grant)
	if grantResult.Error != nil {
		return fmt.Errorf("find Person authorization grant: %w", grantResult.Error)
	}
	if grantResult.RowsAffected == 0 {
		grant = authz.AuthzActorRoleGrant{
			ID:        ids.New(),
			ActorID:   actor.ID,
			RoleID:    personRole.ID,
			TenantID:  person.TenantID,
			Active:    true,
			CreatedAt: now,
			UpdatedAt: now,
		}
		if err := tx.Create(&grant).Error; err != nil {
			return fmt.Errorf("create Person authorization grant: %w", err)
		}
	} else if !grant.Active {
		if err := tx.Model(&authz.AuthzActorRoleGrant{}).Where("id = ?", grant.ID).Updates(map[string]any{
			"active":     true,
			"updated_at": now,
		}).Error; err != nil {
			return fmt.Errorf("reactivate Person authorization grant: %w", err)
		}
	}

	return nil
}

func (r *GORMRepository) CreatePersonAccount(ctx context.Context, tenantID string, account Account) (AccountRecord, error) {
	tenantID = strings.TrimSpace(tenantID)
	accountID := account.ID
	err := r.database.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var tenant appdb.Tenant
		result := tx.Where("id = ? AND active = ?", tenantID, true).Limit(1).Find(&tenant)
		if result.Error != nil {
			return fmt.Errorf("find authentication tenant: %w", result.Error)
		}
		if result.RowsAffected == 0 {
			return ErrTenantUnavailable
		}

		// 30B deliberately allowed legacy Person writers during the staged
		// cutover. Repair their global Person/Membership projection before 30C
		// binds authentication identity to that global Person.
		if err := appdb.EnsureGlobalPersonMembershipFoundation(tx); err != nil {
			return err
		}

		var person appdb.Person
		result = tx.
			Where("tenant_id = ? AND email = ? COLLATE NOCASE", tenantID, account.Login).
			Limit(1).
			Find(&person)
		if result.Error != nil {
			return fmt.Errorf("find authentication person: %w", result.Error)
		}
		if result.RowsAffected == 0 {
			return ErrPersonLoginNotFound
		}

		var membership appdb.PersonTenantMembership
		membershipResult := tx.Where("legacy_person_id = ? AND tenant_id = ?", person.ID, tenantID).Limit(1).Find(&membership)
		if membershipResult.Error != nil {
			return fmt.Errorf("find authentication Person-Tenant Membership: %w", membershipResult.Error)
		}
		if membershipResult.RowsAffected == 0 {
			return fmt.Errorf("authentication Person %s has no Person-Tenant Membership for tenant %s", person.ID, tenantID)
		}

		// One human has one Account. If the global Person already owns an
		// Account, adding access in another Tenant creates/links only that
		// Tenant's Actor and leaves the existing password/session identity intact.
		var accountPerson AccountPerson
		accountPersonResult := tx.Where("person_id = ?", membership.PersonID).Limit(1).Find(&accountPerson)
		if accountPersonResult.Error != nil {
			return fmt.Errorf("find Authentication Account for global Person: %w", accountPersonResult.Error)
		}
		if accountPersonResult.RowsAffected > 0 {
			var existing Account
			if err := tx.First(&existing, "id = ?", accountPerson.AccountID).Error; err != nil {
				return fmt.Errorf("find existing Authentication Account for global Person: %w", err)
			}
			if _, err := ensurePersonTenantActor(tx, existing.ID, membership, person, existing.CreatedAt, false); err != nil {
				return err
			}
			accountID = existing.ID
			return nil
		}

		actor, err := ensurePersonTenantActor(tx, account.ID, membership, person, account.CreatedAt, true)
		if err != nil {
			return err
		}
		account.ActorID = actor.ID
		if err := createAuthenticationAccount(tx, account); err != nil {
			return err
		}
		if err := ensureAccountPersonBinding(tx, account.ID, membership.PersonID, account.CreatedAt); err != nil {
			return err
		}
		binding := AccountActor{
			AccountID: account.ID,
			ActorID:   actor.ID,
			ScopeType: AccountActorScopeTenant,
			Primary:   true,
			CreatedAt: account.CreatedAt,
			UpdatedAt: account.UpdatedAt,
		}
		bindingTenant := tenantID
		bindingMembership := membership.ID
		binding.TenantID = &bindingTenant
		binding.MembershipID = &bindingMembership
		if err := ensureAccountActorBinding(tx, binding); err != nil {
			return err
		}
		accountID = account.ID
		return nil
	})
	if err != nil {
		return AccountRecord{}, err
	}
	return r.FindAccountByID(ctx, accountID)
}

func ensurePersonTenantActor(tx *gorm.DB, accountID string, membership appdb.PersonTenantMembership, person appdb.Person, createdAt time.Time, accountIsNew bool) (authz.AuthzActor, error) {
	// Reuse an Actor already bound to this Account/Membership.
	type bindingProjection struct{ ActorID string }
	var bound bindingProjection
	result := tx.Table("auth_account_actors").Select("actor_id").
		Where("account_id = ? AND scope_type = ? AND tenant_id = ?", accountID, AccountActorScopeTenant, membership.TenantID).
		Limit(1).Scan(&bound)
	if result.Error != nil {
		return authz.AuthzActor{}, fmt.Errorf("find Authentication Account tenant Actor: %w", result.Error)
	}
	if result.RowsAffected > 0 {
		var actor authz.AuthzActor
		if err := tx.First(&actor, "id = ?", bound.ActorID).Error; err != nil {
			return authz.AuthzActor{}, fmt.Errorf("find bound tenant Actor: %w", err)
		}
		if !actor.Active {
			return authz.AuthzActor{}, ErrPersonActorInactive
		}
		return actor, nil
	}

	var collaborator appdb.CollaboratorJourney
	collaboratorResult := tx.
		Where("tenant_id = ? AND person_id = ? AND closed_at IS NULL", membership.TenantID, person.ID).
		Order("journey_start_date DESC, created_at DESC").
		Limit(1).
		Find(&collaborator)
	if collaboratorResult.Error != nil {
		return authz.AuthzActor{}, fmt.Errorf("find current collaborator for authentication person: %w", collaboratorResult.Error)
	}

	// During the additive cutover, prefer an unbound Bite 28 Actor for this
	// tenant before creating the canonical per-Membership Actor.
	var actor authz.AuthzActor
	actorQuery := tx.Table("authz_actors a").
		Where("NOT EXISTS (SELECT 1 FROM auth_account_actors aa WHERE aa.actor_id = a.id)")
	if collaboratorResult.RowsAffected > 0 {
		actorQuery = actorQuery.Where("a.person_id = ? OR a.collaborator_id = ?", person.ID, collaborator.ID)
	} else {
		actorQuery = actorQuery.Where("a.person_id = ?", person.ID)
	}
	actorResult := actorQuery.Order("a.active DESC, a.created_at ASC").Limit(1).Scan(&actor)
	if actorResult.Error != nil {
		return authz.AuthzActor{}, fmt.Errorf("find unbound Person authorization actor: %w", actorResult.Error)
	}

	now := time.Now().UTC()
	if actorResult.RowsAffected == 0 || strings.TrimSpace(actor.ID) == "" {
		personID := person.ID
		actor = authz.AuthzActor{
			ID:          ids.New(),
			ActorKey:    tenantActorKey("person:"+membership.PersonID, membership.TenantID),
			DisplayName: authenticationPersonDisplayName(person),
			PersonID:    &personID,
			Active:      true,
			CreatedAt:   now,
			UpdatedAt:   now,
		}
		if collaboratorResult.RowsAffected > 0 {
			collaboratorID := collaborator.ID
			actor.CollaboratorID = &collaboratorID
		}
		if err := tx.Create(&actor).Error; err != nil {
			return authz.AuthzActor{}, fmt.Errorf("create Person tenant authorization actor: %w", err)
		}
	} else if !actor.Active {
		return authz.AuthzActor{}, ErrPersonActorInactive
	}

	if err := ensureAuthenticatedActorPersonSelfAccess(tx, &actor, now); err != nil {
		return authz.AuthzActor{}, err
	}

	// Existing Accounts need only the new Actor binding. New Accounts are
	// bound after the auth_user_accounts row is inserted so foreign keys remain
	// valid in migration-enabled databases.
	if !accountIsNew {
		binding := AccountActor{
			AccountID: accountID,
			ActorID:   actor.ID,
			ScopeType: AccountActorScopeTenant,
			Primary:   false,
			CreatedAt: createdAt,
			UpdatedAt: now,
		}
		tenantID := membership.TenantID
		membershipID := membership.ID
		binding.TenantID = &tenantID
		binding.MembershipID = &membershipID
		if err := ensureAccountActorBinding(tx, binding); err != nil {
			return authz.AuthzActor{}, err
		}
	}
	return actor, nil
}

func authenticationPersonDisplayName(person appdb.Person) string {
	name := strings.TrimSpace(strings.TrimSpace(person.FirstName) + " " + strings.TrimSpace(person.LastName))
	nickname := strings.TrimSpace(person.Nickname)
	switch {
	case name != "" && nickname != "":
		return name + " (" + nickname + ")"
	case nickname != "":
		return nickname
	case name != "":
		return name
	default:
		return strings.TrimSpace(person.Email)
	}
}

func createAuthenticationAccount(tx *gorm.DB, account Account) error {
	var loginCount int64
	if err := tx.Model(&Account{}).Where("login = ? COLLATE NOCASE", account.Login).Count(&loginCount).Error; err != nil {
		return fmt.Errorf("check authentication login: %w", err)
	}
	if loginCount > 0 {
		return ErrLoginAlreadyExists
	}

	var actorAccountCount int64
	if err := tx.Model(&Account{}).Where("actor_id = ?", account.ActorID).Count(&actorAccountCount).Error; err != nil {
		return fmt.Errorf("check legacy authorization actor account: %w", err)
	}
	if actorAccountCount == 0 && tx.Migrator().HasTable(&AccountActor{}) {
		if err := tx.Model(&AccountActor{}).Where("actor_id = ?", account.ActorID).Count(&actorAccountCount).Error; err != nil {
			return fmt.Errorf("check authorization actor ownership: %w", err)
		}
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

func (r *GORMRepository) hydrateAccountActors(ctx context.Context, record AccountRecord) (AccountRecord, error) {
	if !r.database.Migrator().HasTable(&AccountActor{}) {
		record.AnyActorActive = record.ActorActive
		return record, nil
	}

	type actorBindingProjection struct {
		ActorID         string
		ActorKey        string
		DisplayName     string
		PersonID        *string
		PersonFirstName *string
		PersonLastName  *string
		PersonNickname  *string
		CollaboratorID  *string
		Active          bool
		ScopeType       string
		TenantID        *string
		TenantName      *string
		MembershipID    *string
		IsPrimary       bool
	}
	var rows []actorBindingProjection
	if err := r.database.WithContext(ctx).
		Table("auth_account_actors aa").
		Select(`aa.actor_id AS actor_id,
			a.actor_key AS actor_key,
			a.display_name AS display_name,
			a.person_id AS person_id,
			gp.first_name AS person_first_name,
			gp.last_name AS person_last_name,
			gp.nickname AS person_nickname,
			a.collaborator_id AS collaborator_id,
			a.active AS active,
			aa.scope_type AS scope_type,
			aa.tenant_id AS tenant_id,
			t.name AS tenant_name,
			aa.membership_id AS membership_id,
			aa.is_primary AS is_primary`).
		Joins("JOIN authz_actors a ON a.id = aa.actor_id").
		Joins("LEFT JOIN auth_account_people aap ON aap.account_id = aa.account_id").
		Joins("LEFT JOIN global_people gp ON gp.id = aap.person_id").
		Joins("LEFT JOIN tenants t ON t.id = aa.tenant_id").
		Where("aa.account_id = ?", record.ID).
		Order("aa.is_primary DESC, aa.scope_type ASC, aa.tenant_id ASC, a.actor_key ASC").
		Scan(&rows).Error; err != nil {
		return AccountRecord{}, fmt.Errorf("hydrate Authentication Account Actors: %w", err)
	}
	if len(rows) == 0 {
		record.AnyActorActive = record.ActorActive
		return record, nil
	}

	record.Actors = make([]AccountActorRecord, 0, len(rows))
	record.AnyActorActive = false
	for _, row := range rows {
		actor := AccountActorRecord{
			ActorID:        row.ActorID,
			ActorKey:       row.ActorKey,
			DisplayName:    row.DisplayName,
			PersonID:       stringValue(row.PersonID),
			PersonName:     personDisplayName(stringValue(row.PersonFirstName), stringValue(row.PersonLastName)),
			PersonNickname: stringValue(row.PersonNickname),
			CollaboratorID: stringValue(row.CollaboratorID),
			ScopeType:      row.ScopeType,
			TenantID:       stringValue(row.TenantID),
			TenantName:     stringValue(row.TenantName),
			MembershipID:   stringValue(row.MembershipID),
			Active:         row.Active,
			Primary:        row.IsPrimary,
		}
		record.Actors = append(record.Actors, actor)
		if actor.Active {
			record.AnyActorActive = true
		}
		if actor.Primary {
			record.ActorID = actor.ActorID
			record.ActorKey = actor.ActorKey
			record.DisplayName = actor.DisplayName
			record.PersonID = actor.PersonID
			record.CollaboratorID = actor.CollaboratorID
			record.ActorActive = actor.Active
		}
	}

	type accountPersonProjection struct {
		PersonID  string
		FirstName string
		LastName  string
		Email     string
	}
	var accountPerson accountPersonProjection
	result := r.database.WithContext(ctx).
		Table("auth_account_people aap").
		Select("aap.person_id AS person_id, gp.first_name AS first_name, gp.last_name AS last_name, gp.email AS email").
		Joins("JOIN global_people gp ON gp.id = aap.person_id").
		Where("aap.account_id = ?", record.ID).
		Limit(1).
		Scan(&accountPerson)
	if result.Error != nil {
		return AccountRecord{}, fmt.Errorf("hydrate Authentication Account Person: %w", result.Error)
	}
	if result.RowsAffected > 0 {
		record.GlobalPersonID = accountPerson.PersonID
		record.GlobalPersonName = personDisplayName(accountPerson.FirstName, accountPerson.LastName)
		record.GlobalPersonEmail = accountPerson.Email
	}
	return record, nil
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

func personDisplayName(firstName string, lastName string) string {
	return strings.TrimSpace(strings.TrimSpace(firstName) + " " + strings.TrimSpace(lastName))
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
