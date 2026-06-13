package authz

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"enterpriseremotesystems/backend/internal/shared/ids"
	"gorm.io/gorm"
)

type ActorAdminStore interface {
	ListRoles(ctx context.Context) ([]RoleResponse, error)
	ListPermissions(ctx context.Context) ([]PermissionResponse, error)
	ListActors(ctx context.Context) ([]ActorResponse, error)
	CreateActor(ctx context.Context, req CreateActorRequest) (ActorResponse, error)
	GrantActorRole(ctx context.Context, actorID string, req GrantActorRoleRequest) (ActorGrantResponse, error)
	RevokeActorRoleGrant(ctx context.Context, actorID string, grantID string) (ActorGrantResponse, error)
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

type GrantActorRoleRequest struct {
	RoleCode string `json:"roleCode"`
	TenantID string `json:"tenantId"`
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

	now := time.Now().UTC()
	var grant AuthzActorRoleGrant
	err := s.database.WithContext(ctx).
		Where("actor_id = ? AND role_id = ? AND tenant_id = ?", actorID, role.ID, tenantID).
		First(&grant).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		grant = AuthzActorRoleGrant{ID: ids.New(), ActorID: actorID, RoleID: role.ID, TenantID: tenantID, Active: true, CreatedAt: now, UpdatedAt: now}
		if err := s.database.WithContext(ctx).Create(&grant).Error; err != nil {
			return ActorGrantResponse{}, fmt.Errorf("grant authorization role: %w", err)
		}
	} else if err != nil {
		return ActorGrantResponse{}, fmt.Errorf("find authorization role grant: %w", err)
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
		Where("authz_actor_role_grants.actor_id = ?", actorID).
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
