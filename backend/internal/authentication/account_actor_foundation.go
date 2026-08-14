package authentication

import (
	"fmt"
	"sort"
	"strings"
	"time"

	"enterpriseremotesystems/backend/internal/authz"
	appdb "enterpriseremotesystems/backend/internal/db"
	"enterpriseremotesystems/backend/internal/shared/ids"
	"gorm.io/gorm"
)

// EnsureAccountActorFoundation repairs the additive Bite 30C Account/Actor
// ownership structures for databases that contain Bite 28-era one-Actor
// accounts. It is deliberately idempotent so startup can safely protect the
// cutover while older writers and administrative tooling are retired in later
// Bite 30 work.
func EnsureAccountActorFoundation(database *gorm.DB) error {
	if database == nil {
		return nil
	}
	return database.Transaction(func(tx *gorm.DB) error {
		if !tx.Migrator().HasTable(&AccountActor{}) || !tx.Migrator().HasTable(&AccountPerson{}) {
			return nil
		}

		var accounts []Account
		if err := tx.Order("created_at ASC, id ASC").Find(&accounts).Error; err != nil {
			return fmt.Errorf("list authentication accounts for actor foundation: %w", err)
		}
		for _, account := range accounts {
			if err := ensureAccountActorFoundation(tx, account); err != nil {
				return err
			}
		}
		return nil
	})
}

func ensureAccountActorFoundation(tx *gorm.DB, account Account) error {
	if tx == nil || !tx.Migrator().HasTable(&AccountActor{}) || !tx.Migrator().HasTable(&AccountPerson{}) {
		return nil
	}

	var legacyActor authz.AuthzActor
	if err := tx.First(&legacyActor, "id = ?", strings.TrimSpace(account.ActorID)).Error; err != nil {
		return fmt.Errorf("find legacy authentication actor for account %s: %w", account.ID, err)
	}

	applicationAdmin, err := actorHasApplicationAdminGrant(tx, legacyActor.ID)
	if err != nil {
		return err
	}
	if applicationAdmin {
		if legacyActor.PersonID != nil || legacyActor.CollaboratorID != nil {
			if err := tx.Model(&authz.AuthzActor{}).Where("id = ?", legacyActor.ID).Updates(map[string]any{
				"person_id": nil, "collaborator_id": nil, "updated_at": time.Now().UTC(),
			}).Error; err != nil {
				return fmt.Errorf("clear tenant identity from global Application Administrator actor: %w", err)
			}
		}
		var personCount int64
		if err := tx.Model(&AccountPerson{}).Where("account_id = ?", account.ID).Count(&personCount).Error; err != nil {
			return fmt.Errorf("check global account person binding: %w", err)
		}
		if personCount > 0 {
			return fmt.Errorf("application administrator account %s is linked to a Person", account.ID)
		}
		return ensureAccountActorBinding(tx, AccountActor{
			AccountID: account.ID,
			ActorID:   legacyActor.ID,
			ScopeType: AccountActorScopeGlobal,
			Primary:   true,
			CreatedAt: account.CreatedAt,
			UpdatedAt: time.Now().UTC(),
		})
	}

	personID, primaryMembership, err := resolveLegacyActorGlobalPerson(tx, legacyActor)
	if err != nil {
		return err
	}
	if personID != "" {
		if err := ensureAccountPersonBinding(tx, account.ID, personID, account.CreatedAt); err != nil {
			return err
		}
	}

	tenantIDs, err := actorTenantIDs(tx, legacyActor.ID)
	if err != nil {
		return err
	}
	if primaryMembership != nil {
		tenantIDs = appendUnique(tenantIDs, primaryMembership.TenantID)
	}
	sort.Strings(tenantIDs)
	if len(tenantIDs) == 0 {
		// Legacy accounts without any grant/member scope remain untouched. New
		// account creation rejects this state; retaining it here avoids turning
		// an additive startup repair into destructive authorization cleanup.
		return nil
	}

	primaryTenantID := ""
	if primaryMembership != nil {
		primaryTenantID = primaryMembership.TenantID
	}
	if primaryTenantID == "" {
		primaryTenantID = tenantIDs[0]
	}

	for _, tenantID := range tenantIDs {
		membership, err := membershipForPersonTenant(tx, personID, tenantID)
		if err != nil {
			return err
		}
		if personID != "" && membership == nil {
			return fmt.Errorf("authentication account %s Person has authorization in tenant %s but no Person-Tenant Membership", account.ID, tenantID)
		}

		actor := legacyActor
		primary := tenantID == primaryTenantID
		if !primary {
			actor, err = ensureTenantActorClone(tx, legacyActor, membership, tenantID)
			if err != nil {
				return err
			}
			if err := copyTenantGrants(tx, legacyActor.ID, actor.ID, tenantID); err != nil {
				return err
			}
		} else if membership != nil {
			if err := alignLegacyActorIdentity(tx, &actor, membership); err != nil {
				return err
			}
		}

		binding := AccountActor{
			AccountID: account.ID,
			ActorID:   actor.ID,
			ScopeType: AccountActorScopeTenant,
			Primary:   primary,
			CreatedAt: account.CreatedAt,
			UpdatedAt: time.Now().UTC(),
		}
		value := tenantID
		binding.TenantID = &value
		if membership != nil {
			value := membership.ID
			binding.MembershipID = &value
		}
		if err := ensureAccountActorBinding(tx, binding); err != nil {
			return err
		}
	}
	return nil
}

func actorHasApplicationAdminGrant(tx *gorm.DB, actorID string) (bool, error) {
	var count int64
	err := tx.Table("authz_actor_role_grants g").
		Joins("JOIN authz_roles r ON r.id = g.role_id").
		Where("g.actor_id = ? AND g.tenant_id = ? AND r.code = ?", actorID, authz.GlobalTenantScope, string(authz.RoleApplicationAdmin)).
		Count(&count).Error
	if err != nil {
		return false, fmt.Errorf("check application administrator actor: %w", err)
	}
	return count > 0, nil
}

func resolveLegacyActorGlobalPerson(tx *gorm.DB, actor authz.AuthzActor) (string, *appdb.PersonTenantMembership, error) {
	legacyPersonID := ""
	if actor.PersonID != nil {
		legacyPersonID = strings.TrimSpace(*actor.PersonID)
	}
	if legacyPersonID == "" && actor.CollaboratorID != nil && strings.TrimSpace(*actor.CollaboratorID) != "" {
		var collaborator appdb.CollaboratorJourney
		result := tx.Where("id = ?", strings.TrimSpace(*actor.CollaboratorID)).Limit(1).Find(&collaborator)
		if result.Error != nil {
			return "", nil, fmt.Errorf("find actor collaborator for Account/Actor foundation: %w", result.Error)
		}
		if result.RowsAffected > 0 {
			legacyPersonID = collaborator.PersonID
		}
	}
	if legacyPersonID == "" {
		return "", nil, nil
	}

	var membership appdb.PersonTenantMembership
	result := tx.Where("legacy_person_id = ?", legacyPersonID).Limit(1).Find(&membership)
	if result.Error != nil {
		return "", nil, fmt.Errorf("find actor Person-Tenant Membership: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return "", nil, nil
	}
	return membership.PersonID, &membership, nil
}

func actorTenantIDs(tx *gorm.DB, actorID string) ([]string, error) {
	var tenantIDs []string
	if err := tx.Model(&authz.AuthzActorRoleGrant{}).
		Where("actor_id = ? AND tenant_id <> ?", actorID, authz.GlobalTenantScope).
		Distinct("tenant_id").
		Pluck("tenant_id", &tenantIDs).Error; err != nil {
		return nil, fmt.Errorf("list actor tenant scopes: %w", err)
	}
	result := make([]string, 0, len(tenantIDs))
	for _, tenantID := range tenantIDs {
		if value := strings.TrimSpace(tenantID); value != "" {
			result = appendUnique(result, value)
		}
	}
	return result, nil
}

func membershipForPersonTenant(tx *gorm.DB, personID string, tenantID string) (*appdb.PersonTenantMembership, error) {
	personID = strings.TrimSpace(personID)
	if personID == "" {
		return nil, nil
	}
	var membership appdb.PersonTenantMembership
	result := tx.Where("person_id = ? AND tenant_id = ?", personID, tenantID).Limit(1).Find(&membership)
	if result.Error != nil {
		return nil, fmt.Errorf("find Person-Tenant Membership for actor scope: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return nil, nil
	}
	return &membership, nil
}

func ensureAccountPersonBinding(tx *gorm.DB, accountID string, personID string, createdAt time.Time) error {
	var existing AccountPerson
	result := tx.Where("account_id = ?", accountID).Limit(1).Find(&existing)
	if result.Error != nil {
		return fmt.Errorf("find Authentication Account Person binding: %w", result.Error)
	}
	if result.RowsAffected > 0 {
		if existing.PersonID != personID {
			return fmt.Errorf("authentication account %s is linked to a different global Person", accountID)
		}
		return nil
	}
	binding := AccountPerson{AccountID: accountID, PersonID: personID, CreatedAt: createdAt, UpdatedAt: time.Now().UTC()}
	if binding.CreatedAt.IsZero() {
		binding.CreatedAt = binding.UpdatedAt
	}
	if err := tx.Create(&binding).Error; err != nil {
		return fmt.Errorf("create Authentication Account Person binding: %w", err)
	}
	return nil
}

func ensureAccountActorBinding(tx *gorm.DB, binding AccountActor) error {
	if err := validateAccountActorBinding(tx, binding); err != nil {
		return err
	}

	var existing AccountActor
	result := tx.Where("actor_id = ?", binding.ActorID).Limit(1).Find(&existing)
	if result.Error != nil {
		return fmt.Errorf("find Authentication Account Actor binding: %w", result.Error)
	}
	if result.RowsAffected > 0 {
		if existing.AccountID != binding.AccountID ||
			existing.ScopeType != binding.ScopeType ||
			stringValue(existing.TenantID) != stringValue(binding.TenantID) ||
			stringValue(existing.MembershipID) != stringValue(binding.MembershipID) {
			return fmt.Errorf("authorization actor %s is already bound to another Authentication Account or scope", binding.ActorID)
		}
		return nil
	}
	if binding.CreatedAt.IsZero() {
		binding.CreatedAt = time.Now().UTC()
	}
	if binding.UpdatedAt.IsZero() {
		binding.UpdatedAt = binding.CreatedAt
	}
	if err := tx.Create(&binding).Error; err != nil {
		return fmt.Errorf("create Authentication Account Actor binding: %w", err)
	}
	return nil
}

func validateAccountActorBinding(tx *gorm.DB, binding AccountActor) error {
	accountID := strings.TrimSpace(binding.AccountID)
	actorID := strings.TrimSpace(binding.ActorID)
	if accountID == "" || actorID == "" {
		return fmt.Errorf("authentication Account and Actor are required")
	}

	switch binding.ScopeType {
	case AccountActorScopeGlobal:
		if binding.TenantID != nil || binding.MembershipID != nil {
			return fmt.Errorf("global authorization actor %s cannot have tenant identity", actorID)
		}
		var personCount int64
		if err := tx.Model(&AccountPerson{}).Where("account_id = ?", accountID).Count(&personCount).Error; err != nil {
			return fmt.Errorf("check global Account Person binding: %w", err)
		}
		if personCount > 0 {
			return fmt.Errorf("global authentication account %s cannot have a Person", accountID)
		}
		var tenantActorCount int64
		if err := tx.Model(&AccountActor{}).Where("account_id = ? AND scope_type = ?", accountID, AccountActorScopeTenant).Count(&tenantActorCount).Error; err != nil {
			return fmt.Errorf("check global Account tenant Actors: %w", err)
		}
		if tenantActorCount > 0 {
			return fmt.Errorf("global authentication account %s cannot own tenant Actors", accountID)
		}
	case AccountActorScopeTenant:
		tenantID := strings.TrimSpace(stringValue(binding.TenantID))
		if tenantID == "" {
			return fmt.Errorf("tenant authorization actor %s requires a Tenant", actorID)
		}
		var globalActorCount int64
		if err := tx.Model(&AccountActor{}).Where("account_id = ? AND scope_type = ?", accountID, AccountActorScopeGlobal).Count(&globalActorCount).Error; err != nil {
			return fmt.Errorf("check tenant Account global Actor: %w", err)
		}
		if globalActorCount > 0 {
			return fmt.Errorf("global authentication account %s cannot own tenant Actors", accountID)
		}
		var sameTenant AccountActor
		result := tx.Where("account_id = ? AND scope_type = ? AND tenant_id = ?", accountID, AccountActorScopeTenant, tenantID).Limit(1).Find(&sameTenant)
		if result.Error != nil {
			return fmt.Errorf("check Account tenant Actor uniqueness: %w", result.Error)
		}
		if result.RowsAffected > 0 && sameTenant.ActorID != actorID {
			return fmt.Errorf("authentication account %s already owns another Actor for tenant %s", accountID, tenantID)
		}

		membershipID := strings.TrimSpace(stringValue(binding.MembershipID))
		if membershipID != "" {
			var accountPerson AccountPerson
			personResult := tx.Where("account_id = ?", accountID).Limit(1).Find(&accountPerson)
			if personResult.Error != nil {
				return fmt.Errorf("find tenant Account Person binding: %w", personResult.Error)
			}
			if personResult.RowsAffected == 0 {
				return fmt.Errorf("tenant authorization actor %s Membership requires an Account Person binding", actorID)
			}
			var membership appdb.PersonTenantMembership
			membershipResult := tx.Where("id = ?", membershipID).Limit(1).Find(&membership)
			if membershipResult.Error != nil {
				return fmt.Errorf("find tenant Actor Membership: %w", membershipResult.Error)
			}
			if membershipResult.RowsAffected == 0 || membership.PersonID != accountPerson.PersonID || membership.TenantID != tenantID {
				return fmt.Errorf("tenant authorization actor %s Membership does not match the Account Person and Tenant", actorID)
			}
		}
	default:
		return fmt.Errorf("unsupported authentication Actor scope %q", binding.ScopeType)
	}
	return nil
}

func ensureTenantActorClone(tx *gorm.DB, source authz.AuthzActor, membership *appdb.PersonTenantMembership, tenantID string) (authz.AuthzActor, error) {
	actorKey := tenantActorKey(source.ActorKey, tenantID)
	var existing authz.AuthzActor
	result := tx.Where("actor_key = ?", actorKey).Limit(1).Find(&existing)
	if result.Error != nil {
		return authz.AuthzActor{}, fmt.Errorf("find tenant Actor clone: %w", result.Error)
	}
	if result.RowsAffected > 0 {
		return existing, nil
	}

	now := time.Now().UTC()
	clone := authz.AuthzActor{
		ID:          ids.New(),
		ActorKey:    actorKey,
		DisplayName: source.DisplayName,
		Active:      source.Active,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if membership != nil && membership.LegacyPersonID != nil {
		value := strings.TrimSpace(*membership.LegacyPersonID)
		if value != "" {
			clone.PersonID = &value
			var collaborator appdb.CollaboratorJourney
			result := tx.Where("tenant_id = ? AND person_id = ? AND closed_at IS NULL", tenantID, value).
				Order("journey_start_date DESC, created_at DESC").Limit(1).Find(&collaborator)
			if result.Error != nil {
				return authz.AuthzActor{}, fmt.Errorf("find tenant Actor collaborator: %w", result.Error)
			}
			if result.RowsAffected > 0 {
				collaboratorID := collaborator.ID
				clone.CollaboratorID = &collaboratorID
			}
		}
	}
	if err := tx.Create(&clone).Error; err != nil {
		return authz.AuthzActor{}, fmt.Errorf("create tenant Actor clone: %w", err)
	}
	return clone, nil
}

func alignLegacyActorIdentity(tx *gorm.DB, actor *authz.AuthzActor, membership *appdb.PersonTenantMembership) error {
	if actor == nil || membership == nil || membership.LegacyPersonID == nil {
		return nil
	}
	legacyPersonID := strings.TrimSpace(*membership.LegacyPersonID)
	if legacyPersonID == "" || (actor.PersonID != nil && strings.TrimSpace(*actor.PersonID) == legacyPersonID) {
		return nil
	}
	if err := tx.Model(&authz.AuthzActor{}).Where("id = ?", actor.ID).Updates(map[string]any{
		"person_id":  legacyPersonID,
		"updated_at": time.Now().UTC(),
	}).Error; err != nil {
		return fmt.Errorf("align tenant Actor Person identity: %w", err)
	}
	actor.PersonID = &legacyPersonID
	return nil
}

func copyTenantGrants(tx *gorm.DB, sourceActorID string, targetActorID string, tenantID string) error {
	if sourceActorID == targetActorID {
		return nil
	}
	var grants []authz.AuthzActorRoleGrant
	if err := tx.Where("actor_id = ? AND tenant_id = ?", sourceActorID, tenantID).Find(&grants).Error; err != nil {
		return fmt.Errorf("list tenant role grants for tenant Actor clone: %w", err)
	}
	for _, grant := range grants {
		var existing authz.AuthzActorRoleGrant
		result := tx.Where("actor_id = ? AND role_id = ? AND tenant_id = ?", targetActorID, grant.RoleID, tenantID).Limit(1).Find(&existing)
		if result.Error != nil {
			return fmt.Errorf("find cloned tenant role grant: %w", result.Error)
		}
		if result.RowsAffected > 0 {
			continue
		}
		clone := grant
		clone.ID = ids.New()
		clone.ActorID = targetActorID
		if err := tx.Create(&clone).Error; err != nil {
			return fmt.Errorf("copy tenant role grant to tenant Actor: %w", err)
		}
	}
	return nil
}

func tenantActorKey(base string, tenantID string) string {
	base = strings.TrimSpace(base)
	if base == "" {
		base = "actor"
	}
	return base + "::tenant::" + strings.TrimSpace(tenantID)
}

func appendUnique(values []string, value string) []string {
	for _, existing := range values {
		if existing == value {
			return values
		}
	}
	return append(values, value)
}
