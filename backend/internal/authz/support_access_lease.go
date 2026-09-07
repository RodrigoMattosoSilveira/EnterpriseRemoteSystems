package authz

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"enterpriseremotesystems/backend/internal/shared/ids"
	"gorm.io/gorm"
)

const (
	SupportAccessLeaseStatusPending    = "PENDING"
	SupportAccessLeaseStatusApproved   = "APPROVED"
	SupportAccessLeaseStatusTerminated = "TERMINATED"
	SupportAccessLeaseStatusExpired    = "EXPIRED"

	SupportAccessLeaseEventRequested  = "REQUESTED"
	SupportAccessLeaseEventApproved   = "APPROVED"
	SupportAccessLeaseEventTerminated = "TERMINATED"
)

var (
	ErrSupportAccessLeaseConflict     = errors.New("support access lease conflicts with an existing open lease")
	ErrSupportAccessLeaseExpired      = errors.New("support access lease has expired")
	ErrSupportAccessLeaseInvalidState = errors.New("support access lease is not in the required lifecycle state")
)

type CreateSupportAccessLeaseRequest struct {
	TenantID    string   `json:"tenantId"`
	ExpiresAt   string   `json:"expiresAt"`
	Reason      string   `json:"reason"`
	Permissions []string `json:"permissions"`
}

type TerminateSupportAccessLeaseRequest struct {
	Reason string `json:"reason"`
}

type SupportAccessLeaseFilter struct {
	TenantID string `query:"tenantId"`
	Status   string `query:"status"`
}

type SupportAccessLeaseResponse struct {
	ID                  string   `json:"id"`
	TenantID            string   `json:"tenantId"`
	ApplicationActorID  string   `json:"applicationActorId"`
	RequestedByActorID  string   `json:"requestedByActorId"`
	RequestedAt         string   `json:"requestedAt"`
	ExpiresAt           string   `json:"expiresAt"`
	Reason              string   `json:"reason"`
	Status              string   `json:"status"`
	EffectiveStatus     string   `json:"effectiveStatus"`
	Permissions         []string `json:"permissions"`
	ApprovedAt          string   `json:"approvedAt,omitempty"`
	ApprovedByActorID   string   `json:"approvedByActorId,omitempty"`
	TerminatedAt        string   `json:"terminatedAt,omitempty"`
	TerminatedByActorID string   `json:"terminatedByActorId,omitempty"`
	TerminationReason   string   `json:"terminationReason,omitempty"`
}

type activeSupportAccessLease struct {
	ID          string
	TenantID    string
	ExpiresAt   time.Time
	Permissions map[Permission]struct{}
}

func supportAccessLeasePermissionAllowlist() []Permission {
	return []Permission{
		PermissionPeopleRead,
		PermissionPeopleCreate,
		PermissionPeopleUpdate,
		PermissionCollaboratorsRead,
		PermissionCollaboratorsCreate,
		PermissionCollaboratorsUpdate,
		PermissionCollaboratorsWorkAssignmentUpdate,
		PermissionPlanningRead,
		PermissionPlanningCreate,
		PermissionPlanningUpdate,
		PermissionEarningsRead,
		PermissionEarningsCreate,
		PermissionEarningsUpdate,
		PermissionPriceListsRead,
		PermissionPriceListsCreate,
		PermissionPriceListsUpdate,
		PermissionGoldPricesManage,
		PermissionGoldProductionManage,
		PermissionReferenceDataRead,
		PermissionReferenceDataManage,
		PermissionExpensesRead,
		PermissionExpensesCreate,
		PermissionExpensesUpdate,
		PermissionCurrentAccountsSummaryRead,
		PermissionCurrentAccountsLedgerRead,
		PermissionCurrentAccountsLedgerCreate,
		PermissionCurrentAccountsSettingsRead,
		PermissionCurrentAccountsSettingsUpdate,
		PermissionLedgerReceiptsRead,
		PermissionLedgerReceiptsCreate,
		PermissionLedgerReceiptsPrint,
		PermissionLedgerReceiptsReturn,
		PermissionLedgerReceiptsBackfill,
		PermissionLedgerReceiptsTenantAccept,
		PermissionLedgerCorrectionsCreate,
		PermissionJourneySettlementsPreview,
		PermissionJourneySettlementsZeroGold,
		PermissionJourneySettlementsPartialPayout,
		PermissionJourneySettlementsFinalTenantPayment,
		PermissionJourneySettlementsFinalCollaboratorPayment,
		PermissionJourneySettlementsClose,
	}
}

func supportAccessLeasePermissionSet() map[Permission]struct{} {
	allowed := make(map[Permission]struct{}, len(supportAccessLeasePermissionAllowlist()))
	for _, permission := range supportAccessLeasePermissionAllowlist() {
		allowed[permission] = struct{}{}
	}
	return allowed
}

func (s *GORMStore) CreateSupportAccessLease(ctx context.Context, actor *Actor, req CreateSupportAccessLeaseRequest) (SupportAccessLeaseResponse, error) {
	if s == nil || s.database == nil {
		return SupportAccessLeaseResponse{}, ErrMissingActor
	}
	if actor == nil || actor.RecordID == "" || actor.Scope != ActorScopeApplication || actor.TenantID != GlobalTenantScope || actor.SupportLeaseID != "" || !containsRoleCode(actor.RoleCodes, RoleApplicationAdmin) {
		return SupportAccessLeaseResponse{}, ErrForbidden
	}

	tenantID := strings.TrimSpace(req.TenantID)
	reason := strings.TrimSpace(req.Reason)
	fields := map[string]string{}
	if tenantID == "" || tenantID == GlobalTenantScope {
		fields["tenantId"] = "A specific Tenant is required"
	}
	if reason == "" {
		fields["reason"] = "Support reason is required"
	}
	expiresAt, err := time.Parse(time.RFC3339, strings.TrimSpace(req.ExpiresAt))
	if err != nil {
		fields["expiresAt"] = "Expiration must be an RFC3339 timestamp"
	} else if !expiresAt.After(time.Now().UTC()) {
		fields["expiresAt"] = "Expiration must be in the future"
	}
	permissions, permissionFields := normalizeSupportAccessLeasePermissions(req.Permissions)
	for key, value := range permissionFields {
		fields[key] = value
	}
	if err := NewValidationError(fields); err != nil {
		return SupportAccessLeaseResponse{}, err
	}

	now := time.Now().UTC()
	leaseID := ids.New()
	var response SupportAccessLeaseResponse
	err = s.database.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var tenantCount int64
		if err := tx.Table("tenants").Where("id = ? AND active = ?", tenantID, true).Count(&tenantCount).Error; err != nil {
			return fmt.Errorf("validate support lease Tenant: %w", err)
		}
		if tenantCount != 1 {
			return NewValidationError(map[string]string{"tenantId": "Tenant must exist and be active"})
		}

		var openCount int64
		if err := tx.Model(&TenantSupportAccessLease{}).
			Where("application_actor_id = ? AND tenant_id = ? AND ((status = ? OR status = ?) AND expires_at > ?)", actor.RecordID, tenantID, SupportAccessLeaseStatusPending, SupportAccessLeaseStatusApproved, now).
			Count(&openCount).Error; err != nil {
			return fmt.Errorf("check existing support access lease: %w", err)
		}
		if openCount > 0 {
			return ErrSupportAccessLeaseConflict
		}

		lease := TenantSupportAccessLease{
			ID:                 leaseID,
			TenantID:           tenantID,
			ApplicationActorID: actor.RecordID,
			RequestedByActorID: actor.RecordID,
			RequestedAt:        now,
			ExpiresAt:          expiresAt.UTC(),
			Reason:             reason,
			Status:             SupportAccessLeaseStatusPending,
			CreatedAt:          now,
			UpdatedAt:          now,
		}
		if err := tx.Create(&lease).Error; err != nil {
			return fmt.Errorf("create support access lease: %w", err)
		}
		for _, permission := range permissions {
			row := TenantSupportAccessLeasePermission{LeaseID: leaseID, PermissionCode: string(permission), CreatedAt: now}
			if err := tx.Create(&row).Error; err != nil {
				return fmt.Errorf("create support access lease permission: %w", err)
			}
		}
		metadata, _ := json.Marshal(map[string]any{"permissions": PermissionNames(permissionSliceToSet(permissions)), "expiresAt": expiresAt.UTC().Format(time.RFC3339)})
		if err := tx.Create(&TenantSupportAccessLeaseEvent{
			ID:           ids.New(),
			LeaseID:      leaseID,
			EventType:    SupportAccessLeaseEventRequested,
			ActorID:      actor.RecordID,
			OccurredAt:   now,
			MetadataJSON: string(metadata),
			CreatedAt:    now,
		}).Error; err != nil {
			return fmt.Errorf("record support access lease request event: %w", err)
		}
		loaded, err := loadSupportAccessLeaseResponse(ctx, tx, leaseID, now)
		if err != nil {
			return err
		}
		response = loaded
		return nil
	})
	return response, err
}

func (s *GORMStore) ListSupportAccessLeases(ctx context.Context, actor *Actor, filter SupportAccessLeaseFilter) ([]SupportAccessLeaseResponse, error) {
	if s == nil || s.database == nil || actor == nil {
		return nil, ErrMissingActor
	}

	query := s.database.WithContext(ctx).Model(&TenantSupportAccessLease{})
	requestedTenant := strings.TrimSpace(filter.TenantID)
	switch actor.Scope {
	case ActorScopeApplication:
		if actor.TenantID != GlobalTenantScope || actor.SupportLeaseID != "" || !actor.HasPermission(PermissionSupportAccessLeasesRead) {
			return nil, ErrForbidden
		}
		if requestedTenant != "" {
			query = query.Where("tenant_id = ?", requestedTenant)
		}
	case ActorScopeTenant:
		if actor.TenantID == "" || actor.TenantID == GlobalTenantScope || !containsRoleCode(actor.RoleCodes, RoleTenantAdmin) || !actor.HasPermission(PermissionSupportAccessLeasesRead) {
			return nil, ErrForbidden
		}
		if requestedTenant != "" && requestedTenant != actor.TenantID {
			return nil, ErrForbidden
		}
		query = query.Where("tenant_id = ?", actor.TenantID)
	default:
		return nil, ErrForbidden
	}

	status := strings.ToUpper(strings.TrimSpace(filter.Status))
	if status != "" && status != SupportAccessLeaseStatusExpired {
		switch status {
		case SupportAccessLeaseStatusPending, SupportAccessLeaseStatusApproved, SupportAccessLeaseStatusTerminated:
			query = query.Where("status = ?", status)
		default:
			return nil, NewValidationError(map[string]string{"status": "Status must be PENDING, APPROVED, TERMINATED, or EXPIRED"})
		}
	}

	var rows []TenantSupportAccessLease
	if err := query.Order("requested_at DESC, id DESC").Find(&rows).Error; err != nil {
		return nil, fmt.Errorf("list support access leases: %w", err)
	}
	now := time.Now().UTC()
	responses := make([]SupportAccessLeaseResponse, 0, len(rows))
	for _, row := range rows {
		response, err := loadSupportAccessLeaseResponse(ctx, s.database, row.ID, now)
		if err != nil {
			return nil, err
		}
		if status == SupportAccessLeaseStatusExpired && response.EffectiveStatus != SupportAccessLeaseStatusExpired {
			continue
		}
		responses = append(responses, response)
	}
	return responses, nil
}

func (s *GORMStore) ApproveSupportAccessLease(ctx context.Context, actor *Actor, leaseID string) (SupportAccessLeaseResponse, error) {
	return s.transitionSupportAccessLease(ctx, actor, strings.TrimSpace(leaseID), true, "")
}

func (s *GORMStore) TerminateSupportAccessLease(ctx context.Context, actor *Actor, leaseID string, reason string) (SupportAccessLeaseResponse, error) {
	return s.transitionSupportAccessLease(ctx, actor, strings.TrimSpace(leaseID), false, strings.TrimSpace(reason))
}

func (s *GORMStore) transitionSupportAccessLease(ctx context.Context, actor *Actor, leaseID string, approve bool, terminationReason string) (SupportAccessLeaseResponse, error) {
	if s == nil || s.database == nil || actor == nil {
		return SupportAccessLeaseResponse{}, ErrMissingActor
	}
	if actor.Scope != ActorScopeTenant || actor.TenantID == "" || actor.TenantID == GlobalTenantScope || !containsRoleCode(actor.RoleCodes, RoleTenantAdmin) {
		return SupportAccessLeaseResponse{}, ErrForbidden
	}
	permission := PermissionSupportAccessLeasesTerminate
	if approve {
		permission = PermissionSupportAccessLeasesApprove
	}
	if !actor.HasPermission(permission) {
		return SupportAccessLeaseResponse{}, ErrForbidden
	}
	if leaseID == "" {
		return SupportAccessLeaseResponse{}, NewValidationError(map[string]string{"leaseId": "Lease ID is required"})
	}

	now := time.Now().UTC()
	var response SupportAccessLeaseResponse
	err := s.database.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var lease TenantSupportAccessLease
		if err := tx.Where("id = ?", leaseID).First(&lease).Error; err != nil {
			return err
		}
		if lease.TenantID != actor.TenantID {
			return ErrForbidden
		}
		canonical, err := isCanonicalTenantAdministrator(ctx, tx, actor.RecordID, actor.TenantID)
		if err != nil {
			return err
		}
		if !canonical {
			return ErrForbidden
		}

		if approve {
			var tenantCount int64
			if err := tx.Table("tenants").Where("id = ? AND active = ?", lease.TenantID, true).Count(&tenantCount).Error; err != nil {
				return fmt.Errorf("validate support lease Tenant for approval: %w", err)
			}
			if tenantCount != 1 {
				return NewValidationError(map[string]string{"tenantId": "Tenant must be active before support access can be approved"})
			}
			if lease.Status != SupportAccessLeaseStatusPending {
				return ErrSupportAccessLeaseInvalidState
			}
			if !lease.ExpiresAt.After(now) {
				return ErrSupportAccessLeaseExpired
			}
			var activeCount int64
			if err := tx.Model(&TenantSupportAccessLease{}).
				Where("id <> ? AND application_actor_id = ? AND tenant_id = ? AND status = ? AND expires_at > ?", lease.ID, lease.ApplicationActorID, lease.TenantID, SupportAccessLeaseStatusApproved, now).
				Count(&activeCount).Error; err != nil {
				return fmt.Errorf("check active support access lease: %w", err)
			}
			if activeCount > 0 {
				return ErrSupportAccessLeaseConflict
			}
			if err := tx.Model(&TenantSupportAccessLease{}).Where("id = ?", lease.ID).Updates(map[string]any{
				"status":               SupportAccessLeaseStatusApproved,
				"approved_at":          now,
				"approved_by_actor_id": actor.RecordID,
				"updated_at":           now,
			}).Error; err != nil {
				return fmt.Errorf("approve support access lease: %w", err)
			}
			if err := createSupportAccessLeaseEvent(tx, lease.ID, SupportAccessLeaseEventApproved, actor.RecordID, now, ""); err != nil {
				return err
			}
		} else {
			if lease.Status != SupportAccessLeaseStatusApproved {
				return ErrSupportAccessLeaseInvalidState
			}
			if !lease.ExpiresAt.After(now) {
				return ErrSupportAccessLeaseExpired
			}
			if err := tx.Model(&TenantSupportAccessLease{}).Where("id = ?", lease.ID).Updates(map[string]any{
				"status":                 SupportAccessLeaseStatusTerminated,
				"terminated_at":          now,
				"terminated_by_actor_id": actor.RecordID,
				"termination_reason":     terminationReason,
				"updated_at":             now,
			}).Error; err != nil {
				return fmt.Errorf("terminate support access lease: %w", err)
			}
			if err := createSupportAccessLeaseEvent(tx, lease.ID, SupportAccessLeaseEventTerminated, actor.RecordID, now, terminationReason); err != nil {
				return err
			}
		}
		loaded, err := loadSupportAccessLeaseResponse(ctx, tx, lease.ID, now)
		if err != nil {
			return err
		}
		response = loaded
		return nil
	})
	return response, err
}

func (s *GORMStore) findActiveSupportAccessLease(ctx context.Context, applicationActorID string, tenantID string, now time.Time) (*activeSupportAccessLease, error) {
	if s == nil || s.database == nil || strings.TrimSpace(applicationActorID) == "" || strings.TrimSpace(tenantID) == "" || tenantID == GlobalTenantScope {
		return nil, gorm.ErrRecordNotFound
	}
	if !s.database.Migrator().HasTable(&TenantSupportAccessLease{}) {
		return nil, gorm.ErrRecordNotFound
	}
	var lease TenantSupportAccessLease
	result := s.database.WithContext(ctx).
		Where("application_actor_id = ? AND tenant_id = ? AND status = ? AND expires_at > ?", strings.TrimSpace(applicationActorID), strings.TrimSpace(tenantID), SupportAccessLeaseStatusApproved, now.UTC()).
		Order("approved_at DESC, id DESC").
		Limit(1).
		Find(&lease)
	if result.Error != nil {
		return nil, fmt.Errorf("find active support access lease: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return nil, gorm.ErrRecordNotFound
	}
	permissions, err := loadSupportAccessLeasePermissionSet(ctx, s.database, lease.ID)
	if err != nil {
		return nil, err
	}
	return &activeSupportAccessLease{ID: lease.ID, TenantID: lease.TenantID, ExpiresAt: lease.ExpiresAt, Permissions: permissions}, nil
}

func normalizeSupportAccessLeasePermissions(raw []string) ([]Permission, map[string]string) {
	allowed := supportAccessLeasePermissionSet()
	seen := map[Permission]struct{}{}
	permissions := make([]Permission, 0, len(raw))
	fields := map[string]string{}
	for _, value := range raw {
		permission := Permission(strings.TrimSpace(value))
		if permission == "" {
			continue
		}
		if _, ok := allowed[permission]; !ok {
			fields["permissions"] = fmt.Sprintf("Permission %q is not eligible for Tenant Support Access", permission)
			continue
		}
		if _, duplicate := seen[permission]; duplicate {
			continue
		}
		seen[permission] = struct{}{}
		permissions = append(permissions, permission)
	}
	if len(permissions) == 0 && fields["permissions"] == "" {
		fields["permissions"] = "At least one Tenant support permission is required"
	}
	sort.Slice(permissions, func(i, j int) bool { return permissions[i] < permissions[j] })
	return permissions, fields
}

func permissionSliceToSet(permissions []Permission) map[Permission]struct{} {
	result := make(map[Permission]struct{}, len(permissions))
	for _, permission := range permissions {
		result[permission] = struct{}{}
	}
	return result
}

func containsRoleCode(roleCodes []string, role RoleCode) bool {
	for _, roleCode := range roleCodes {
		if roleCode == string(role) {
			return true
		}
	}
	return false
}

func effectiveSupportAccessLeaseStatus(lease TenantSupportAccessLease, now time.Time) string {
	if lease.Status == SupportAccessLeaseStatusApproved && !lease.ExpiresAt.After(now) {
		return SupportAccessLeaseStatusExpired
	}
	return lease.Status
}

func loadSupportAccessLeaseResponse(ctx context.Context, database *gorm.DB, leaseID string, now time.Time) (SupportAccessLeaseResponse, error) {
	var lease TenantSupportAccessLease
	if err := database.WithContext(ctx).Where("id = ?", leaseID).First(&lease).Error; err != nil {
		return SupportAccessLeaseResponse{}, err
	}
	var permissionRows []TenantSupportAccessLeasePermission
	if err := database.WithContext(ctx).Where("lease_id = ?", leaseID).Order("permission_code").Find(&permissionRows).Error; err != nil {
		return SupportAccessLeaseResponse{}, fmt.Errorf("load support access lease permissions: %w", err)
	}
	permissions := make([]string, 0, len(permissionRows))
	for _, row := range permissionRows {
		permissions = append(permissions, row.PermissionCode)
	}
	response := SupportAccessLeaseResponse{
		ID:                 lease.ID,
		TenantID:           lease.TenantID,
		ApplicationActorID: lease.ApplicationActorID,
		RequestedByActorID: lease.RequestedByActorID,
		RequestedAt:        lease.RequestedAt.UTC().Format(time.RFC3339),
		ExpiresAt:          lease.ExpiresAt.UTC().Format(time.RFC3339),
		Reason:             lease.Reason,
		Status:             lease.Status,
		EffectiveStatus:    effectiveSupportAccessLeaseStatus(lease, now),
		Permissions:        permissions,
		TerminationReason:  lease.TerminationReason,
	}
	if lease.ApprovedAt != nil {
		response.ApprovedAt = lease.ApprovedAt.UTC().Format(time.RFC3339)
	}
	if lease.ApprovedByActorID != nil {
		response.ApprovedByActorID = *lease.ApprovedByActorID
	}
	if lease.TerminatedAt != nil {
		response.TerminatedAt = lease.TerminatedAt.UTC().Format(time.RFC3339)
	}
	if lease.TerminatedByActorID != nil {
		response.TerminatedByActorID = *lease.TerminatedByActorID
	}
	return response, nil
}

func loadSupportAccessLeasePermissionSet(ctx context.Context, database *gorm.DB, leaseID string) (map[Permission]struct{}, error) {
	var rows []TenantSupportAccessLeasePermission
	if err := database.WithContext(ctx).Where("lease_id = ?", leaseID).Find(&rows).Error; err != nil {
		return nil, fmt.Errorf("load support access lease permissions: %w", err)
	}
	allowed := supportAccessLeasePermissionSet()
	permissions := map[Permission]struct{}{}
	for _, row := range rows {
		permission := Permission(row.PermissionCode)
		if _, ok := allowed[permission]; !ok {
			return nil, fmt.Errorf("support access lease %s contains ineligible permission %s", leaseID, row.PermissionCode)
		}
		permissions[permission] = struct{}{}
	}
	return permissions, nil
}

func createSupportAccessLeaseEvent(database *gorm.DB, leaseID string, eventType string, actorID string, now time.Time, reason string) error {
	metadata := ""
	if strings.TrimSpace(reason) != "" {
		encoded, _ := json.Marshal(map[string]string{"reason": strings.TrimSpace(reason)})
		metadata = string(encoded)
	}
	if err := database.Create(&TenantSupportAccessLeaseEvent{
		ID:           ids.New(),
		LeaseID:      leaseID,
		EventType:    eventType,
		ActorID:      actorID,
		OccurredAt:   now,
		MetadataJSON: metadata,
		CreatedAt:    now,
	}).Error; err != nil {
		return fmt.Errorf("record support access lease event: %w", err)
	}
	return nil
}

func isCanonicalTenantAdministrator(ctx context.Context, database *gorm.DB, actorID string, tenantID string) (bool, error) {
	var count int64
	err := database.WithContext(ctx).
		Table("authz_actor_role_grants g").
		Joins("JOIN authz_roles r ON r.id = g.role_id AND r.code = ? AND r.scope_type = ? AND r.active = ?", string(RoleTenantAdmin), string(ActorScopeTenant), true).
		Joins("JOIN auth_account_actors aa ON aa.actor_id = g.actor_id AND aa.scope_type = ? AND aa.tenant_id = g.tenant_id", "TENANT").
		Joins("JOIN person_tenant_memberships m ON m.id = aa.membership_id AND m.tenant_id = aa.tenant_id").
		Joins("JOIN reference_data status ON status.id = m.status_id AND status.tenant_id = m.tenant_id AND status.type = ? AND status.code = ? AND status.active = ?", "person_status", "ACTIVE", true).
		Where("g.actor_id = ? AND g.tenant_id = ? AND g.active = ? AND g.lifecycle_suspended = ? AND m.person_id IS NOT NULL AND TRIM(m.person_id) <> ''", actorID, tenantID, true, false).
		Count(&count).Error
	if err != nil {
		return false, fmt.Errorf("validate canonical Tenant Administrator: %w", err)
	}
	return count == 1, nil
}
