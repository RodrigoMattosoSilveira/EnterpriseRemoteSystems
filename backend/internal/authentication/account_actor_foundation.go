package authentication

import (
	"fmt"
	"strings"
	"time"

	appdb "enterpriseremotesystems/backend/internal/db"
	"gorm.io/gorm"
)

// EnsureAccountActorFoundation is the canonical startup integrity boundary.
// 30K.3B physically removes the former identity reconstruction columns, so
// current databases must already contain the complete Account -> AccountActor ->
// Membership/Person graph.
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
			return fmt.Errorf("list authentication accounts for canonical actor foundation: %w", err)
		}
		for _, account := range accounts {
			if err := validateAccountFoundation(tx, account.ID); err != nil {
				return err
			}
		}
		return nil
	})
}

func validateAccountFoundation(tx *gorm.DB, accountID string) error {
	accountID = strings.TrimSpace(accountID)
	if accountID == "" {
		return fmt.Errorf("authentication Account ID is required")
	}

	var bindings []AccountActor
	if err := tx.Where("account_id = ?", accountID).Order("scope_type ASC, tenant_id ASC, actor_id ASC").Find(&bindings).Error; err != nil {
		return fmt.Errorf("list canonical Authentication Account Actor bindings: %w", err)
	}
	if len(bindings) == 0 {
		return fmt.Errorf("authentication account %s has no canonical AccountActor binding", accountID)
	}

	globalCount := 0
	tenantCount := 0
	for _, binding := range bindings {
		if err := validateAccountActorBinding(tx, binding); err != nil {
			return fmt.Errorf("validate authentication account %s Actor %s: %w", accountID, binding.ActorID, err)
		}
		switch binding.ScopeType {
		case AccountActorScopeGlobal:
			globalCount++
		case AccountActorScopeTenant:
			tenantCount++
		}
	}
	if globalCount > 0 && tenantCount > 0 {
		return fmt.Errorf("authentication account %s mixes GLOBAL and TENANT AccountActor bindings", accountID)
	}
	if globalCount > 1 {
		return fmt.Errorf("authentication account %s has more than one GLOBAL AccountActor binding", accountID)
	}

	var personCount int64
	if err := tx.Model(&AccountPerson{}).Where("account_id = ?", accountID).Count(&personCount).Error; err != nil {
		return fmt.Errorf("count Authentication Account Person bindings: %w", err)
	}
	if globalCount == 1 && personCount != 0 {
		return fmt.Errorf("global authentication account %s cannot have a Person binding", accountID)
	}
	if tenantCount > 0 && personCount != 1 {
		return fmt.Errorf("tenant authentication account %s requires exactly one canonical Person binding", accountID)
	}
	return nil
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

	var actorCount int64
	if err := tx.Table("authz_actors").Where("id = ?", actorID).Count(&actorCount).Error; err != nil {
		return fmt.Errorf("find authorization Actor for AccountActor binding: %w", err)
	}
	if actorCount != 1 {
		return fmt.Errorf("authorization actor %s does not exist", actorID)
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
		membershipID := strings.TrimSpace(stringValue(binding.MembershipID))
		if tenantID == "" {
			return fmt.Errorf("tenant authorization actor %s requires a Tenant", actorID)
		}
		if membershipID == "" {
			return fmt.Errorf("tenant authorization actor %s requires a canonical Person-Tenant Membership", actorID)
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

		var accountPerson AccountPerson
		personResult := tx.Where("account_id = ?", accountID).Limit(1).Find(&accountPerson)
		if personResult.Error != nil {
			return fmt.Errorf("find tenant Account Person binding: %w", personResult.Error)
		}
		if personResult.RowsAffected == 0 {
			return fmt.Errorf("tenant authorization actor %s requires an Account Person binding", actorID)
		}
		var membership appdb.PersonTenantMembership
		membershipResult := tx.Where("id = ?", membershipID).Limit(1).Find(&membership)
		if membershipResult.Error != nil {
			return fmt.Errorf("find tenant Actor Membership: %w", membershipResult.Error)
		}
		if membershipResult.RowsAffected == 0 || membership.PersonID != accountPerson.PersonID || membership.TenantID != tenantID {
			return fmt.Errorf("tenant authorization actor %s Membership does not match the Account Person and Tenant", actorID)
		}
	default:
		return fmt.Errorf("unsupported authentication Actor scope %q", binding.ScopeType)
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
