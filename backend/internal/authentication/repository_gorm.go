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
	Login              string
	PasswordHash       string
	Active             bool
	SecuritySuspended  bool
	MustChangePassword bool
	LastLoginAt        *time.Time
	PasswordChangedAt  *time.Time
	CreatedAt          time.Time
	UpdatedAt          time.Time
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

func (r *GORMRepository) FindSelfServiceHome(ctx context.Context, accountID string) (SelfServiceHomeRecord, error) {
	accountID = strings.TrimSpace(accountID)
	if accountID == "" {
		return SelfServiceHomeRecord{}, gorm.ErrRecordNotFound
	}

	var person SelfServicePersonRecord
	personResult := r.database.WithContext(ctx).
		Table("auth_account_people ap").
		Select(`gp.id,
			gp.first_name,
			gp.last_name,
			gp.nickname,
			gp.cpf,
			gp.rg,
			gp.cellular,
			gp.email,
			COALESCE(gp.street1, '') AS street1,
			COALESCE(gp.street2, '') AS street2,
			COALESCE(gp.state, '') AS state,
			COALESCE(gp.city, '') AS city,
			COALESCE(gp.cep, '') AS cep,
			gp.country,
			COALESCE(gp.bank_name, '') AS bank_name,
			COALESCE(gp.bank_number, '') AS bank_number,
			COALESCE(gp.checking_account, '') AS checking_account,
			COALESCE(gp.pix_key, '') AS pix_key,
			COALESCE(gp.emergency_name, '') AS emergency_name,
			COALESCE(gp.emergency_cellular, '') AS emergency_cellular,
			COALESCE(gp.emergency_email, '') AS emergency_email,
			gp.profile_completion_status,
			gp.can_create_collaborator`).
		Joins("JOIN global_people gp ON gp.id = ap.person_id").
		Where("ap.account_id = ?", accountID).
		Limit(1).
		Scan(&person)
	if personResult.Error != nil {
		return SelfServiceHomeRecord{}, fmt.Errorf("find self-service Person: %w", personResult.Error)
	}
	if personResult.RowsAffected == 0 {
		return SelfServiceHomeRecord{}, gorm.ErrRecordNotFound
	}

	// Bite 30G financial ownership is Account -> global Person -> ledger Person +
	// Tenant. Own-resource visibility therefore no longer depends on a current or
	// historical Collaborator Journey, an ACTIVE Membership, or an ACTIVE Tenant
	// Actor. Journey references remain on individual entries only as provenance.
	var balances []SelfServiceBalanceRecord
	if err := r.database.WithContext(ctx).
		Table("auth_account_people ap").
		Select(`le.tenant_id,
			t.name AS tenant_name,
			le.value_unit_id,
			vu.code AS value_unit_code,
			vu.label AS value_unit_label,
			SUM(CASE WHEN le.direction = 'CREDIT' THEN le.amount ELSE -le.amount END) AS balance`).
		Joins("JOIN ledger_entries le ON le.person_id = ap.person_id AND le.active = ?", true).
		Joins("JOIN tenants t ON t.id = le.tenant_id").
		Joins("JOIN reference_data vu ON vu.id = le.value_unit_id AND vu.tenant_id = le.tenant_id").
		Where("ap.account_id = ?", accountID).
		Group("le.tenant_id, t.name, le.value_unit_id, vu.code, vu.label, vu.sort_order").
		Having("ABS(SUM(CASE WHEN le.direction = 'CREDIT' THEN le.amount ELSE -le.amount END)) > 0.00000001").
		Order("t.name ASC, vu.sort_order ASC, vu.label ASC").
		Scan(&balances).Error; err != nil {
		return SelfServiceHomeRecord{}, fmt.Errorf("list self-service Current Account balances: %w", err)
	}

	var entries []SelfServiceLedgerEntryRecord
	if err := r.database.WithContext(ctx).
		Table("auth_account_people ap").
		Select(`le.id,
			le.tenant_id,
			le.person_id,
			t.name AS tenant_name,
			le.collaborator_id,
			le.value_unit_id,
			vu.code AS value_unit_code,
			vu.label AS value_unit_label,
			le.entry_type,
			le.direction,
			le.amount,
			le.effective_date,
			le.source_type,
			le.source_id,
			COALESCE(le.description, '') AS description`).
		Joins("JOIN ledger_entries le ON le.person_id = ap.person_id AND le.active = ?", true).
		Joins("JOIN tenants t ON t.id = le.tenant_id").
		Joins("JOIN reference_data vu ON vu.id = le.value_unit_id AND vu.tenant_id = le.tenant_id").
		Where("ap.account_id = ?", accountID).
		Order("le.effective_date DESC, le.created_at DESC, le.id DESC").
		Scan(&entries).Error; err != nil {
		return SelfServiceHomeRecord{}, fmt.Errorf("list self-service Current Account entries: %w", err)
	}

	return SelfServiceHomeRecord{
		Person:   person,
		Balances: balances,
		Entries:  entries,
	}, nil
}

func (r *GORMRepository) CreatePersonAccount(ctx context.Context, tenantID string, personID string, account Account) (AccountRecord, error) {
	tenantID = strings.TrimSpace(tenantID)
	personID = strings.TrimSpace(personID)
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

		var membership appdb.PersonTenantMembership
		membershipQuery := tx.Model(&appdb.PersonTenantMembership{}).
			Joins("JOIN global_people gp ON gp.id = person_tenant_memberships.person_id").
			Where("person_tenant_memberships.tenant_id = ?", tenantID)
		if personID != "" {
			// Tenant-driven provisioning receives the canonical People API identity.
			membershipQuery = membershipQuery.Where("person_tenant_memberships.person_id = ?", personID)
		} else {
			// Global Authentication Administration starts from Tenant + canonical
			// Person login email; it no longer identifies a pre-existing Actor.
			membershipQuery = membershipQuery.Where("gp.email = ? COLLATE NOCASE", account.Login)
		}
		result = membershipQuery.Limit(1).Find(&membership)
		if result.Error != nil {
			return fmt.Errorf("find canonical authentication Membership: %w", result.Error)
		}
		if result.RowsAffected == 0 {
			return ErrPersonLoginNotFound
		}

		var membershipStatus appdb.ReferenceData
		if err := tx.Where("id = ? AND tenant_id = ? AND type = ?", membership.StatusID, tenantID, "person_status").First(&membershipStatus).Error; err != nil {
			return fmt.Errorf("find canonical authentication Membership status: %w", err)
		}
		if !membershipStatus.Active || !strings.EqualFold(strings.TrimSpace(membershipStatus.Code), "ACTIVE") {
			return ErrPersonMembershipRequired
		}

		var person appdb.GlobalPerson
		if err := tx.First(&person, "id = ?", membership.PersonID).Error; err != nil {
			return fmt.Errorf("find canonical authentication Person: %w", err)
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

func ensurePersonTenantActor(tx *gorm.DB, accountID string, membership appdb.PersonTenantMembership, person appdb.GlobalPerson, createdAt time.Time, accountIsNew bool) (authz.AuthzActor, error) {
	// Reuse an Actor already bound to this Account/Membership.
	type bindingProjection struct {
		ActorID      string
		MembershipID *string
	}
	var bound bindingProjection
	result := tx.Table("auth_account_actors").Select("actor_id, membership_id").
		Where("account_id = ? AND scope_type = ? AND tenant_id = ?", accountID, AccountActorScopeTenant, membership.TenantID).
		Limit(1).Scan(&bound)
	if result.Error != nil {
		return authz.AuthzActor{}, fmt.Errorf("find Authentication Account tenant Actor: %w", result.Error)
	}
	if result.RowsAffected > 0 {
		if strings.TrimSpace(stringValue(bound.MembershipID)) != strings.TrimSpace(membership.ID) {
			return authz.AuthzActor{}, fmt.Errorf(
				"Authentication Account %s tenant %s Actor binding does not match canonical Membership %s",
				accountID, membership.TenantID, membership.ID,
			)
		}
		var actor authz.AuthzActor
		if err := tx.First(&actor, "id = ?", bound.ActorID).Error; err != nil {
			return authz.AuthzActor{}, fmt.Errorf("find bound tenant Actor: %w", err)
		}
		if !actor.Active {
			return authz.AuthzActor{}, ErrPersonActorInactive
		}
		return actor, nil
	}

	now := time.Now().UTC()
	actor := authz.AuthzActor{
		ID:          ids.New(),
		ActorKey:    tenantActorKey("person:"+membership.PersonID, membership.TenantID),
		DisplayName: authenticationPersonDisplayName(person),
		Active:      true,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if err := tx.Create(&actor).Error; err != nil {
		return authz.AuthzActor{}, fmt.Errorf("create canonical Person tenant authorization actor: %w", err)
	}

	// Existing Accounts need only the new Actor binding. New Accounts are
	// bound after the auth_user_accounts row is inserted so foreign keys remain
	// valid in migration-enabled databases.
	if !accountIsNew {
		binding := AccountActor{
			AccountID: accountID,
			ActorID:   actor.ID,
			ScopeType: AccountActorScopeTenant,
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

func authenticationPersonDisplayName(person appdb.GlobalPerson) string {
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

	if err := tx.Create(&account).Error; err != nil {
		errorText := strings.ToLower(err.Error())
		if strings.Contains(errorText, "auth_user_accounts.login") {
			return ErrLoginAlreadyExists
		}
		return fmt.Errorf("create authentication account: %w", err)
	}
	return nil
}

func (r *GORMRepository) SetAccountActive(ctx context.Context, id string, active bool, now time.Time) (AccountRecord, error) {
	id = strings.TrimSpace(id)
	err := r.database.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var account Account
		if err := tx.First(&account, "id = ?", id).Error; err != nil {
			return err
		}
		effectiveActive := active
		updates := map[string]any{"updated_at": now}
		if active {
			// Application Administrator activation clears only the global security
			// suspension. An operationally inactive Person still requires a Tenant
			// Administrator to reactivate one specific Membership.
			updates["security_suspended"] = false
			type personState struct{ OperationalActive bool }
			var state personState
			result := tx.Table("auth_account_people ap").
				Select("gp.operational_active").
				Joins("JOIN global_people gp ON gp.id = ap.person_id").
				Where("ap.account_id = ?", id).Limit(1).Scan(&state)
			if result.Error != nil {
				return fmt.Errorf("resolve Authentication Account Person lifecycle: %w", result.Error)
			}
			if result.RowsAffected > 0 && !state.OperationalActive {
				effectiveActive = false
			}
		} else {
			updates["security_suspended"] = true
		}
		updates["active"] = effectiveActive
		if err := tx.Model(&Account{}).Where("id = ?", id).Updates(updates).Error; err != nil {
			return fmt.Errorf("update authentication account state: %w", err)
		}
		if !effectiveActive {
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
	// Authentication Administration hydrates identity only through
	// auth_account_people + auth_account_actors. The 30K.3A bridge retains the
	// physical auth_user_accounts.actor_id column as read-only historical data;
	// current runtime identity never reads or writes it.
	return r.database.WithContext(ctx).
		Table("auth_user_accounts").
		Select(`
			auth_user_accounts.id,
			auth_user_accounts.login,
			auth_user_accounts.password_hash,
			auth_user_accounts.active,
			auth_user_accounts.security_suspended,
			auth_user_accounts.must_change_password,
			auth_user_accounts.last_login_at,
			auth_user_accounts.password_changed_at,
			auth_user_accounts.created_at,
			auth_user_accounts.updated_at`)
}

func mapAccountProjection(row accountProjection) AccountRecord {
	return AccountRecord{
		Account: Account{
			ID:                 row.ID,
			Login:              row.Login,
			PasswordHash:       row.PasswordHash,
			Active:             row.Active,
			SecuritySuspended:  row.SecuritySuspended,
			MustChangePassword: row.MustChangePassword,
			LastLoginAt:        row.LastLoginAt,
			PasswordChangedAt:  row.PasswordChangedAt,
			CreatedAt:          row.CreatedAt,
			UpdatedAt:          row.UpdatedAt,
		},
	}
}

func (r *GORMRepository) hydrateAccountActors(ctx context.Context, record AccountRecord) (AccountRecord, error) {
	if !r.database.Migrator().HasTable(&AccountActor{}) {
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
	}
	var rows []actorBindingProjection
	if err := r.database.WithContext(ctx).
		Table("auth_account_actors aa").
		Select(`aa.actor_id AS actor_id,
			a.actor_key AS actor_key,
			a.display_name AS display_name,
			gp.id AS person_id,
			gp.first_name AS person_first_name,
			gp.last_name AS person_last_name,
			gp.nickname AS person_nickname,
			cj.id AS collaborator_id,
			a.active AS active,
			aa.scope_type AS scope_type,
			aa.tenant_id AS tenant_id,
			t.name AS tenant_name,
			aa.membership_id AS membership_id`).
		Joins("JOIN authz_actors a ON a.id = aa.actor_id").
		Joins("LEFT JOIN person_tenant_memberships m ON m.id = aa.membership_id AND m.tenant_id = aa.tenant_id").
		Joins("LEFT JOIN global_people gp ON gp.id = m.person_id").
		Joins("LEFT JOIN collaborator_journeys cj ON cj.membership_id = aa.membership_id AND cj.tenant_id = aa.tenant_id AND cj.closed_at IS NULL").
		Joins("LEFT JOIN tenants t ON t.id = aa.tenant_id").
		Where("aa.account_id = ?", record.ID).
		Order("CASE WHEN aa.scope_type = 'GLOBAL' THEN 0 ELSE 1 END, aa.tenant_id ASC, a.actor_key ASC").
		Scan(&rows).Error; err != nil {
		return AccountRecord{}, fmt.Errorf("hydrate Authentication Account Actors: %w", err)
	}

	record.Actors = make([]AccountActorRecord, 0, len(rows))
	record.AnyActorActive = false
	for index, row := range rows {
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
			// is_primary is intentionally ignored by 30K.2B1. Keep the response
			// field false until 30K.3B removes the compatibility column/DTO field.
			Primary: false,
		}
		record.Actors = append(record.Actors, actor)
		if actor.Active {
			record.AnyActorActive = true
		}

		// Preserve the pre-30K response envelope for callers that still render the
		// top-level Actor fields, but derive that projection deterministically from
		// the canonical AccountActor binding list rather than actor_id/is_primary.
		if index == 0 {
			record.ActorID = actor.ActorID
			record.ActorKey = actor.ActorKey
			record.DisplayName = actor.DisplayName
			record.PersonID = actor.PersonID
			record.CollaboratorID = actor.CollaboratorID
			record.ActorActive = actor.Active
		}
	}

	type accountPersonProjection struct {
		PersonID          string
		FirstName         string
		LastName          string
		Email             string
		OperationalActive bool
	}
	var accountPerson accountPersonProjection
	result := r.database.WithContext(ctx).
		Table("auth_account_people aap").
		Select("aap.person_id AS person_id, gp.first_name AS first_name, gp.last_name AS last_name, gp.email AS email, gp.operational_active AS operational_active").
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
		record.OperationalActive = accountPerson.OperationalActive
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
