package authz

import (
	"context"
	"fmt"
	"sort"
	"strings"
	"time"

	"enterpriseremotesystems/backend/internal/shared/ids"
)

type ActorAdminStore interface {
	ListRoles(ctx context.Context) ([]RoleResponse, error)
	ListPermissions(ctx context.Context) ([]PermissionResponse, error)
	ListActors(ctx context.Context) ([]ActorResponse, error)
	CreateActor(ctx context.Context, req CreateActorRequest) (ActorResponse, error)
	SetActorActive(ctx context.Context, actorID string, active bool) (ActorResponse, error)
	GrantActorRole(ctx context.Context, actorID string, req GrantActorRoleRequest) (ActorGrantResponse, error)
	RevokeActorRoleGrant(ctx context.Context, actorID string, grantID string) (ActorGrantResponse, error)
	ListAuthorizationAuditLogs(ctx context.Context, filter AuditLogFilter) ([]AuditLogResponse, error)
	RecordAuthorizationAudit(ctx context.Context, entry AuthorizationAuditEntry) error
}

type RoleResponse struct {
	ID          string               `json:"id"`
	Code        string               `json:"code"`
	Label       string               `json:"label"`
	Description string               `json:"description"`
	ScopeType   string               `json:"scopeType"`
	Active      bool                 `json:"active"`
	Permissions []PermissionResponse `json:"permissions,omitempty"`
}

type PermissionResponse struct {
	Code        string `json:"code"`
	Label       string `json:"label"`
	Description string `json:"description"`
}

type ActorResponse struct {
	ID             string               `json:"id"`
	ActorKey       string               `json:"actorKey"`
	DisplayName    string               `json:"displayName"`
	PersonID       string               `json:"personId,omitempty"`
	CollaboratorID string               `json:"collaboratorId,omitempty"`
	Active         bool                 `json:"active"`
	RoleGrants     []ActorGrantResponse `json:"roleGrants,omitempty"`
}

type CurrentActorResponse struct {
	ActorKey       string   `json:"actorKey"`
	ActorRecordID  string   `json:"actorRecordId"`
	TenantID       string   `json:"tenantId"`
	Scope          string   `json:"scope"`
	PersonID       string   `json:"personId,omitempty"`
	CollaboratorID string   `json:"collaboratorId,omitempty"`
	RoleCodes      []string `json:"roleCodes"`
	Permissions    []string `json:"permissions"`
}

type ActorGrantResponse struct {
	ID        string `json:"id"`
	ActorID   string `json:"actorId"`
	RoleID    string `json:"roleId"`
	RoleCode  string `json:"roleCode"`
	TenantID  string `json:"tenantId"`
	ScopeType string `json:"scopeType"`
	Active    bool   `json:"active"`
}

type CreateActorRequest struct {
	ActorKey       string  `json:"actorKey"`
	DisplayName    string  `json:"displayName"`
	PersonID       *string `json:"personId"`
	CollaboratorID *string `json:"collaboratorId"`
	Active         *bool   `json:"active"`
}

type SetActorActiveRequest struct {
	Active *bool `json:"active"`
}

type GrantActorRoleRequest struct {
	RoleCode string `json:"roleCode"`
	TenantID string `json:"tenantId"`
}

type AuditLogFilter struct {
	ActorID    string `query:"actorId"`
	TenantID   string `query:"tenantId"`
	Operation  string `query:"operation"`
	TargetType string `query:"targetType"`
	TargetID   string `query:"targetId"`
	Decision   string `query:"decision"`
	Limit      int    `query:"limit"`
}

type AuditLogResponse struct {
	ID             string `json:"id"`
	OccurredAt     string `json:"occurredAt"`
	ActorID        string `json:"actorId,omitempty"`
	ActorRecordID  string `json:"actorRecordId,omitempty"`
	TenantID       string `json:"tenantId,omitempty"`
	PermissionCode string `json:"permissionCode,omitempty"`
	Operation      string `json:"operation"`
	TargetType     string `json:"targetType,omitempty"`
	TargetID       string `json:"targetId,omitempty"`
	Decision       string `json:"decision"`
	Reason         string `json:"reason,omitempty"`
	MetadataJSON   string `json:"metadataJson,omitempty"`
	RequestMethod  string `json:"requestMethod,omitempty"`
	RequestPath    string `json:"requestPath,omitempty"`
}

type ValidationError struct {
	fields map[string]string
}

func (e ValidationError) Error() string { return "validation failed" }
func (e ValidationError) ValidationFields() map[string]string {
	return e.fields
}

func NewValidationError(fields map[string]string) error {
	cleaned := map[string]string{}
	for field, message := range fields {
		if strings.TrimSpace(message) != "" {
			cleaned[field] = message
		}
	}
	if len(cleaned) == 0 {
		return nil
	}
	return ValidationError{fields: cleaned}
}

func (s *GORMStore) ListAuthorizationAuditLogs(ctx context.Context, filter AuditLogFilter) ([]AuditLogResponse, error) {
	if s == nil || s.database == nil {
		return nil, ErrMissingActor
	}
	limit := filter.Limit
	if limit <= 0 {
		limit = 100
	}
	if limit > 500 {
		limit = 500
	}
	query := s.database.WithContext(ctx).Model(&AuthzAuditLog{})
	if strings.TrimSpace(filter.ActorID) != "" {
		query = query.Where("actor_id = ?", strings.TrimSpace(filter.ActorID))
	}
	if strings.TrimSpace(filter.TenantID) != "" {
		query = query.Where("tenant_id = ?", strings.TrimSpace(filter.TenantID))
	}
	if strings.TrimSpace(filter.Operation) != "" {
		query = query.Where("operation = ?", strings.TrimSpace(filter.Operation))
	}
	if strings.TrimSpace(filter.TargetType) != "" {
		query = query.Where("target_type = ?", strings.TrimSpace(filter.TargetType))
	}
	if strings.TrimSpace(filter.TargetID) != "" {
		query = query.Where("target_id = ?", strings.TrimSpace(filter.TargetID))
	}
	if strings.TrimSpace(filter.Decision) != "" {
		query = query.Where("decision = ?", strings.ToUpper(strings.TrimSpace(filter.Decision)))
	}
	var rows []AuthzAuditLog
	if err := query.Order("occurred_at DESC").Limit(limit).Find(&rows).Error; err != nil {
		return nil, fmt.Errorf("list authorization audit logs: %w", err)
	}
	responses := make([]AuditLogResponse, 0, len(rows))
	for _, row := range rows {
		responses = append(responses, AuditLogResponse{
			ID:             row.ID,
			OccurredAt:     row.OccurredAt.Format(time.RFC3339),
			ActorID:        row.ActorID,
			ActorRecordID:  row.ActorRecordID,
			TenantID:       row.TenantID,
			PermissionCode: row.PermissionCode,
			Operation:      row.Operation,
			TargetType:     row.TargetType,
			TargetID:       row.TargetID,
			Decision:       row.Decision,
			Reason:         row.Reason,
			MetadataJSON:   row.MetadataJSON,
			RequestMethod:  row.RequestMethod,
			RequestPath:    row.RequestPath,
		})
	}
	return responses, nil
}

func (s *GORMStore) ListRoles(ctx context.Context) ([]RoleResponse, error) {
	if s == nil || s.database == nil {
		return nil, ErrMissingActor
	}

	var roles []AuthzRole
	if err := s.database.WithContext(ctx).Order("code ASC").Find(&roles).Error; err != nil {
		return nil, fmt.Errorf("list authorization roles: %w", err)
	}

	responses := make([]RoleResponse, 0, len(roles))
	for _, role := range roles {
		permissions, err := s.permissionsForRole(ctx, role.ID)
		if err != nil {
			return nil, err
		}
		responses = append(responses, roleResponse(role, permissions))
	}
	return responses, nil
}

func (s *GORMStore) ListPermissions(ctx context.Context) ([]PermissionResponse, error) {
	if s == nil || s.database == nil {
		return nil, ErrMissingActor
	}

	var rows []AuthzPermission
	if err := s.database.WithContext(ctx).Order("code ASC").Find(&rows).Error; err != nil {
		return nil, fmt.Errorf("list authorization permissions: %w", err)
	}

	responses := make([]PermissionResponse, 0, len(rows))
	for _, row := range rows {
		responses = append(responses, permissionResponse(row))
	}
	return responses, nil
}

func (s *GORMStore) ListActors(ctx context.Context) ([]ActorResponse, error) {
	if s == nil || s.database == nil {
		return nil, ErrMissingActor
	}

	var actors []AuthzActor
	if err := s.database.WithContext(ctx).Order("actor_key ASC").Find(&actors).Error; err != nil {
		return nil, fmt.Errorf("list authorization actors: %w", err)
	}

	responses := make([]ActorResponse, 0, len(actors))
	for _, actor := range actors {
		grants, err := s.grantsForActor(ctx, actor.ID)
		if err != nil {
			return nil, err
		}
		responses = append(responses, actorResponse(actor, grants))
	}
	return responses, nil
}

func (s *GORMStore) CreateActor(ctx context.Context, req CreateActorRequest) (ActorResponse, error) {
	if s == nil || s.database == nil {
		return ActorResponse{}, ErrMissingActor
	}
	fields := map[string]string{}
	actorKey := strings.TrimSpace(req.ActorKey)
	if actorKey == "" {
		fields["actorKey"] = "Actor key is required"
	}
	if err := NewValidationError(fields); err != nil {
		return ActorResponse{}, err
	}

	active := true
	if req.Active != nil {
		active = *req.Active
	}

	now := time.Now().UTC()
	actor := AuthzActor{
		ID:             ids.New(),
		ActorKey:       actorKey,
		DisplayName:    strings.TrimSpace(req.DisplayName),
		PersonID:       normalizedStringPtr(req.PersonID),
		CollaboratorID: normalizedStringPtr(req.CollaboratorID),
		Active:         active,
		CreatedAt:      now,
		UpdatedAt:      now,
	}
	if actor.DisplayName == "" {
		actor.DisplayName = actor.ActorKey
	}

	if err := s.database.WithContext(ctx).Create(&actor).Error; err != nil {
		return ActorResponse{}, fmt.Errorf("create authorization actor: %w", err)
	}
	return actorResponse(actor, nil), nil
}

func (s *GORMStore) SetActorActive(ctx context.Context, actorID string, active bool) (ActorResponse, error) {
	if s == nil || s.database == nil {
		return ActorResponse{}, ErrMissingActor
	}
	actorID = strings.TrimSpace(actorID)
	if err := NewValidationError(map[string]string{"actorId": requiredMessage(actorID, "Actor ID is required")}); err != nil {
		return ActorResponse{}, err
	}

	var actor AuthzActor
	if err := s.database.WithContext(ctx).Where("id = ?", actorID).First(&actor).Error; err != nil {
		return ActorResponse{}, err
	}
	if actor.Active == active {
		grants, err := s.grantsForActor(ctx, actor.ID)
		if err != nil {
			return ActorResponse{}, err
		}
		return actorResponse(actor, grants), nil
	}
	if !active {
		if err := s.ensureActorDeactivationAllowed(ctx, actor.ID, "active"); err != nil {
			return ActorResponse{}, err
		}
	}

	actor.Active = active
	actor.UpdatedAt = time.Now().UTC()
	if err := s.database.WithContext(ctx).Save(&actor).Error; err != nil {
		return ActorResponse{}, fmt.Errorf("set authorization actor active state: %w", err)
	}
	grants, err := s.grantsForActor(ctx, actor.ID)
	if err != nil {
		return ActorResponse{}, err
	}
	return actorResponse(actor, grants), nil
}

func (s *GORMStore) GrantActorRole(ctx context.Context, actorID string, req GrantActorRoleRequest) (ActorGrantResponse, error) {
	if s == nil || s.database == nil {
		return ActorGrantResponse{}, ErrMissingActor
	}
	actorID = strings.TrimSpace(actorID)
	roleCode := strings.TrimSpace(req.RoleCode)
	tenantID := strings.TrimSpace(req.TenantID)
	fields := map[string]string{}
	if actorID == "" {
		fields["actorId"] = "Actor ID is required"
	}
	if roleCode == "" {
		fields["roleCode"] = "Role code is required"
	}
	if err := NewValidationError(fields); err != nil {
		return ActorGrantResponse{}, err
	}
	if tenantID == "" {
		tenantID = GlobalTenantScope
	}

	var actor AuthzActor
	if err := s.database.WithContext(ctx).Where("id = ?", actorID).First(&actor).Error; err != nil {
		return ActorGrantResponse{}, err
	}

	var role AuthzRole
	if err := s.database.WithContext(ctx).Where("code = ? AND active = ?", roleCode, true).First(&role).Error; err != nil {
		return ActorGrantResponse{}, err
	}
	if role.ScopeType == string(ActorScopeApplication) && tenantID != GlobalTenantScope {
		return ActorGrantResponse{}, NewValidationError(map[string]string{"tenantId": "Application-scoped roles must use the global tenant scope (*)"})
	}
	if role.ScopeType != string(ActorScopeApplication) && tenantID == GlobalTenantScope {
		return ActorGrantResponse{}, NewValidationError(map[string]string{"tenantId": "Tenant and self-scoped roles require a tenant ID"})
	}

	now := time.Now().UTC()
	var grant AuthzActorRoleGrant
	grantResult := s.database.WithContext(ctx).
		Where("actor_id = ? AND role_id = ? AND tenant_id = ?", actorID, role.ID, tenantID).
		Find(&grant)
	if grantResult.Error != nil {
		return ActorGrantResponse{}, fmt.Errorf("find authorization role grant: %w", grantResult.Error)
	}
	if grantResult.RowsAffected == 0 {
		grant = AuthzActorRoleGrant{ID: ids.New(), ActorID: actorID, RoleID: role.ID, TenantID: tenantID, Active: true, CreatedAt: now, UpdatedAt: now}
		if err := s.database.WithContext(ctx).Create(&grant).Error; err != nil {
			return ActorGrantResponse{}, fmt.Errorf("grant authorization role: %w", err)
		}
	} else if !grant.Active {
		grant.Active = true
		grant.UpdatedAt = now
		if err := s.database.WithContext(ctx).Save(&grant).Error; err != nil {
			return ActorGrantResponse{}, fmt.Errorf("reactivate authorization role grant: %w", err)
		}
	}

	return grantResponse(grant, role), nil
}

func (s *GORMStore) RevokeActorRoleGrant(ctx context.Context, actorID string, grantID string) (ActorGrantResponse, error) {
	if s == nil || s.database == nil {
		return ActorGrantResponse{}, ErrMissingActor
	}
	actorID = strings.TrimSpace(actorID)
	grantID = strings.TrimSpace(grantID)
	if err := NewValidationError(map[string]string{
		"actorId": requiredMessage(actorID, "Actor ID is required"),
		"grantId": requiredMessage(grantID, "Grant ID is required"),
	}); err != nil {
		return ActorGrantResponse{}, err
	}

	var grant AuthzActorRoleGrant
	if err := s.database.WithContext(ctx).Where("id = ? AND actor_id = ?", grantID, actorID).First(&grant).Error; err != nil {
		return ActorGrantResponse{}, err
	}

	if grant.Active {
		if err := s.ensureApplicationAdminGrantRemains(ctx, grant, "grantId"); err != nil {
			return ActorGrantResponse{}, err
		}
		grant.Active = false
		grant.UpdatedAt = time.Now().UTC()
		if err := s.database.WithContext(ctx).Save(&grant).Error; err != nil {
			return ActorGrantResponse{}, fmt.Errorf("revoke authorization role grant: %w", err)
		}
	}

	var role AuthzRole
	if err := s.database.WithContext(ctx).Where("id = ?", grant.RoleID).First(&role).Error; err != nil {
		return ActorGrantResponse{}, err
	}
	return grantResponse(grant, role), nil
}

func (s *GORMStore) ensureActorDeactivationAllowed(ctx context.Context, actorID string, field string) error {
	var count int64
	if err := s.database.WithContext(ctx).
		Model(&AuthzActorRoleGrant{}).
		Joins("JOIN authz_roles ON authz_roles.id = authz_actor_role_grants.role_id AND authz_roles.active = ?", true).
		Where("authz_actor_role_grants.actor_id = ? AND authz_actor_role_grants.active = ? AND authz_actor_role_grants.tenant_id = ? AND authz_roles.code = ?", actorID, true, GlobalTenantScope, string(RoleApplicationAdmin)).
		Count(&count).Error; err != nil {
		return fmt.Errorf("check application administrator grant: %w", err)
	}
	if count == 0 {
		return nil
	}
	return s.ensureApplicationAdminRemains(ctx, actorID, field)
}

func (s *GORMStore) ensureApplicationAdminRemains(ctx context.Context, actorID string, field string) error {
	var count int64
	if err := s.database.WithContext(ctx).
		Model(&AuthzActorRoleGrant{}).
		Joins("JOIN authz_actors ON authz_actors.id = authz_actor_role_grants.actor_id AND authz_actors.active = ?", true).
		Joins("JOIN authz_roles ON authz_roles.id = authz_actor_role_grants.role_id AND authz_roles.active = ?", true).
		Where("authz_actor_role_grants.active = ? AND authz_actor_role_grants.tenant_id = ? AND authz_roles.code = ? AND authz_actor_role_grants.actor_id <> ?", true, GlobalTenantScope, string(RoleApplicationAdmin), actorID).
		Distinct("authz_actor_role_grants.actor_id").
		Count(&count).Error; err != nil {
		return fmt.Errorf("count remaining application administrators: %w", err)
	}
	if count == 0 {
		return NewValidationError(map[string]string{field: "At least one active application administrator must remain"})
	}
	return nil
}

func (s *GORMStore) ensureApplicationAdminGrantRemains(ctx context.Context, grant AuthzActorRoleGrant, field string) error {
	if grant.TenantID != GlobalTenantScope {
		return nil
	}
	var role AuthzRole
	if err := s.database.WithContext(ctx).Where("id = ?", grant.RoleID).First(&role).Error; err != nil {
		return err
	}
	if role.Code != string(RoleApplicationAdmin) {
		return nil
	}
	return s.ensureApplicationAdminRemains(ctx, grant.ActorID, field)
}

func (s *GORMStore) permissionsForRole(ctx context.Context, roleID string) ([]PermissionResponse, error) {
	var rows []AuthzPermission
	if err := s.database.WithContext(ctx).
		Joins("JOIN authz_role_permissions ON authz_role_permissions.permission_code = authz_permissions.code").
		Where("authz_role_permissions.role_id = ?", roleID).
		Order("authz_permissions.code ASC").
		Find(&rows).Error; err != nil {
		return nil, fmt.Errorf("list role permissions: %w", err)
	}
	responses := make([]PermissionResponse, 0, len(rows))
	for _, row := range rows {
		responses = append(responses, permissionResponse(row))
	}
	return responses, nil
}

func (s *GORMStore) grantsForActor(ctx context.Context, actorID string) ([]ActorGrantResponse, error) {
	type grantProjection struct {
		ID        string
		ActorID   string
		RoleID    string
		RoleCode  string
		TenantID  string
		ScopeType string
		Active    bool
	}
	var rows []grantProjection
	if err := s.database.WithContext(ctx).
		Model(&AuthzActorRoleGrant{}).
		Joins("JOIN authz_roles ON authz_roles.id = authz_actor_role_grants.role_id").
		Where("authz_actor_role_grants.actor_id = ? AND authz_actor_role_grants.active = ?", actorID, true).
		Order("authz_roles.code ASC, authz_actor_role_grants.tenant_id ASC").
		Select("authz_actor_role_grants.id AS id, authz_actor_role_grants.actor_id AS actor_id, authz_actor_role_grants.role_id AS role_id, authz_roles.code AS role_code, authz_actor_role_grants.tenant_id AS tenant_id, authz_roles.scope_type AS scope_type, authz_actor_role_grants.active AS active").
		Scan(&rows).Error; err != nil {
		return nil, fmt.Errorf("list actor role grants: %w", err)
	}
	responses := make([]ActorGrantResponse, 0, len(rows))
	for _, row := range rows {
		responses = append(responses, ActorGrantResponse{ID: row.ID, ActorID: row.ActorID, RoleID: row.RoleID, RoleCode: row.RoleCode, TenantID: row.TenantID, ScopeType: row.ScopeType, Active: row.Active})
	}
	sort.Slice(responses, func(i, j int) bool {
		if responses[i].RoleCode == responses[j].RoleCode {
			return responses[i].TenantID < responses[j].TenantID
		}
		return responses[i].RoleCode < responses[j].RoleCode
	})
	return responses, nil
}

func roleResponse(role AuthzRole, permissions []PermissionResponse) RoleResponse {
	return RoleResponse{ID: role.ID, Code: role.Code, Label: role.Label, Description: role.Description, ScopeType: role.ScopeType, Active: role.Active, Permissions: permissions}
}

func permissionResponse(permission AuthzPermission) PermissionResponse {
	return PermissionResponse{Code: permission.Code, Label: permission.Label, Description: permission.Description}
}

func actorResponse(actor AuthzActor, grants []ActorGrantResponse) ActorResponse {
	return ActorResponse{ID: actor.ID, ActorKey: actor.ActorKey, DisplayName: actor.DisplayName, PersonID: stringValue(actor.PersonID), CollaboratorID: stringValue(actor.CollaboratorID), Active: actor.Active, RoleGrants: grants}
}

func grantResponse(grant AuthzActorRoleGrant, role AuthzRole) ActorGrantResponse {
	return ActorGrantResponse{ID: grant.ID, ActorID: grant.ActorID, RoleID: grant.RoleID, RoleCode: role.Code, TenantID: grant.TenantID, ScopeType: role.ScopeType, Active: grant.Active}
}

func normalizedStringPtr(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func requiredMessage(value string, message string) string {
	if strings.TrimSpace(value) == "" {
		return message
	}
	return ""
}
