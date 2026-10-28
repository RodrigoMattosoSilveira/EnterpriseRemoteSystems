package authentication

import (
	"context"
	"fmt"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"enterpriseremotesystems/backend/internal/authz"
	"enterpriseremotesystems/backend/internal/shared/ids"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// HumanAdministrator is a NEW human identity, not a bootstrap or a reconciliation request.
// No field in this structure may be written to logs as an object: Password is secret.
type HumanAdministrator struct {
	ActorKey    string `json:"actorKey"`
	DisplayName string `json:"displayName"`
	Login       string `json:"login"`
	Password    string `json:"password"`
}

type HumanAdministratorEnrollment struct {
	Administrators []HumanAdministrator `json:"administrators"`
}

type HumanAdministratorEnrollmentEvidence struct {
	ApprovalReference       string
	OperatorReference       string
	BackupEvidenceReference string
	PasswordHashCost        int
}

type HumanAdministratorEnrollmentResult struct {
	AccountID string `json:"accountId"`
	ActorID   string `json:"actorId"`
	ActorKey  string `json:"actorKey"`
	Login     string `json:"login"`
}

var humanAdminReference = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,119}$`)
var humanAdminActorKey = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:@-]{0,119}$`)

// EnrollTwoHumanApplicationAdministrators is create-only and all-or-nothing.
// The authorization catalog and migrations MUST already exist. No existing row
// is updated, including legacy automation administrators or their grants.
func EnrollTwoHumanApplicationAdministrators(ctx context.Context, database *gorm.DB, request HumanAdministratorEnrollment, evidence HumanAdministratorEnrollmentEvidence) ([]HumanAdministratorEnrollmentResult, error) {
	if database == nil {
		return nil, fmt.Errorf("human administrator enrollment: database is required")
	}
	if len(request.Administrators) != 2 {
		return nil, fmt.Errorf("human administrator enrollment requires exactly two human administrators")
	}
	if !humanAdminReference.MatchString(evidence.ApprovalReference) || !humanAdminReference.MatchString(evidence.OperatorReference) || !humanAdminReference.MatchString(evidence.BackupEvidenceReference) {
		return nil, fmt.Errorf("human administrator enrollment requires nonempty single-line approval, operator, and verified backup references")
	}
	if evidence.PasswordHashCost < bcrypt.MinCost || evidence.PasswordHashCost > bcrypt.MaxCost {
		return nil, fmt.Errorf("human administrator enrollment requires an explicit valid bcrypt cost")
	}
	for i := range request.Administrators {
		item := &request.Administrators[i]
		item.ActorKey = strings.TrimSpace(item.ActorKey)
		item.DisplayName = strings.TrimSpace(item.DisplayName)
		item.Login = normalizeLogin(item.Login)
		if !humanAdminActorKey.MatchString(item.ActorKey) || item.DisplayName == "" || utf8.RuneCountInString(item.DisplayName) > 120 || strings.ContainsAny(item.DisplayName, "\r\n\x00") || item.Login == "" || utf8.RuneCountInString(item.Login) > maximumLoginLength || strings.ContainsAny(item.Login, "\r\n\x00") {
			return nil, fmt.Errorf("human administrator %d: invalid actor key, display name, or login", i+1)
		}
		if err := validatePasswordValue(item.Password, "password"); err != nil {
			return nil, fmt.Errorf("human administrator %d: invalid initial password: %w", i+1, err)
		}
		if strings.ContainsAny(item.Password, "\r\n\x00") {
			return nil, fmt.Errorf("human administrator %d: initial password may not contain line breaks or NUL", i+1)
		}
	}
	a, b := request.Administrators[0], request.Administrators[1]
	if strings.EqualFold(a.ActorKey, b.ActorKey) || a.Login == b.Login || a.Password == b.Password {
		return nil, fmt.Errorf("human administrator enrollment requires distinct actor keys, logins, and initial passwords")
	}

	results := make([]HumanAdministratorEnrollmentResult, 0, 2)
	err := database.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Migration check is deliberately non-mutating. Production migrations
		// run through the independently accepted deployment/recovery gate.
		for _, table := range []string{"auth_user_accounts", "auth_account_actors", "authz_actors", "authz_roles", "authz_actor_role_grants", "authz_role_permissions", "authz_audit_logs"} {
			if !tx.Migrator().HasTable(table) {
				return fmt.Errorf("enrollment refused: required migrated table %s is missing", table)
			}
		}
		var immutableTriggers int64
		if err := tx.Raw("SELECT count(*) FROM sqlite_master WHERE type = 'trigger' AND name IN (?, ?)", "trg_authz_audit_logs_no_update", "trg_authz_audit_logs_no_delete").Scan(&immutableTriggers).Error; err != nil {
			return err
		}
		if immutableTriggers != 2 {
			return fmt.Errorf("enrollment refused: append-only authorization audit triggers are missing")
		}
		var role authz.AuthzRole
		found := tx.Where("code = ?", string(authz.RoleApplicationAdmin)).Limit(1).Find(&role)
		if found.Error != nil {
			return fmt.Errorf("find existing administrator authorization role: %w", found.Error)
		}
		if found.RowsAffected != 1 || !role.Active || role.ScopeType != string(authz.ActorScopeApplication) {
			return fmt.Errorf("enrollment refused: active GLOBAL APPLICATION_ADMIN role is missing")
		}
		var permissionCount int64
		if err := tx.Model(&authz.AuthzRolePermission{}).Where("role_id = ? AND permission_code = ?", role.ID, string(authz.PermissionAuthzManage)).Count(&permissionCount).Error; err != nil {
			return err
		}
		if permissionCount != 1 {
			return fmt.Errorf("enrollment refused: APPLICATION_ADMIN authorization catalog is incomplete")
		}
		for _, item := range request.Administrators {
			var duplicate int64
			if err := tx.Model(&Account{}).Where("login = ? COLLATE NOCASE", item.Login).Count(&duplicate).Error; err != nil {
				return err
			}
			if duplicate != 0 {
				return fmt.Errorf("enrollment refused: authentication login already exists")
			}
			if err := tx.Model(&authz.AuthzActor{}).Where("actor_key = ? COLLATE NOCASE", item.ActorKey).Count(&duplicate).Error; err != nil {
				return err
			}
			if duplicate != 0 {
				return fmt.Errorf("enrollment refused: authorization actor key already exists")
			}
		}
		now := time.Now().UTC()
		for _, item := range request.Administrators {
			hash, err := bcrypt.GenerateFromPassword([]byte(item.Password), evidence.PasswordHashCost)
			if err != nil {
				return fmt.Errorf("hash human administrator initial password: %w", err)
			}
			actor := authz.AuthzActor{ID: ids.New(), ActorKey: item.ActorKey, DisplayName: item.DisplayName, Active: true, CreatedAt: now, UpdatedAt: now}
			if err := tx.Create(&actor).Error; err != nil {
				return fmt.Errorf("create human administrator actor: %w", err)
			}
			account := Account{ID: ids.New(), Login: item.Login, PasswordHash: string(hash), Active: true, MustChangePassword: true, CreatedAt: now, UpdatedAt: now}
			if err := tx.Create(&account).Error; err != nil {
				return fmt.Errorf("create human administrator account: %w", err)
			}
			binding := AccountActor{AccountID: account.ID, ActorID: actor.ID, ScopeType: AccountActorScopeGlobal, CreatedAt: now, UpdatedAt: now}
			if err := tx.Create(&binding).Error; err != nil {
				return fmt.Errorf("create human administrator canonical global binding: %w", err)
			}
			grant := authz.AuthzActorRoleGrant{ID: ids.New(), ActorID: actor.ID, RoleID: role.ID, TenantID: authz.GlobalTenantScope, Active: true, CreatedAt: now, UpdatedAt: now}
			if err := tx.Create(&grant).Error; err != nil {
				return fmt.Errorf("create human administrator global role grant: %w", err)
			}
			// Offline enrollment cannot claim an authenticated request actor.
			// Attribution is explicitly to an operator reference/approval, with
			// target Account and Actor IDs and no credential material.
			audit := authz.AuthzAuditLog{
				ID: ids.New(), OccurredAt: now, ActorID: "offline-enrollment", ActorScope: string(authz.ActorScopeApplication),
				TenantID: authz.GlobalTenantScope, CorrelationID: evidence.ApprovalReference,
				AuthorizationSource: string(authz.AuthorizationSourceNone),
				Operation:           "authentication.human_admins.offline_enroll", TargetType: "auth_user_account", TargetID: account.ID,
				Decision:  authz.AuditDecisionAuthorized,
				Reason:    "operator=" + evidence.OperatorReference + "; approval=" + evidence.ApprovalReference + "; backup=" + evidence.BackupEvidenceReference + "; actor=" + actor.ID,
				CreatedAt: now,
			}
			if err := tx.Create(&audit).Error; err != nil {
				return fmt.Errorf("write mandatory human administrator enrollment audit: %w", err)
			}
			results = append(results, HumanAdministratorEnrollmentResult{AccountID: account.ID, ActorID: actor.ID, ActorKey: actor.ActorKey, Login: account.Login})
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	return results, nil
}
