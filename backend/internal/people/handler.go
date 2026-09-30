package people

import (
	"encoding/json"
	"errors"
	"strings"

	"github.com/gofiber/fiber/v3"

	"enterpriseremotesystems/backend/internal/authz"
	"enterpriseremotesystems/backend/internal/shared/httpx"
	"enterpriseremotesystems/backend/internal/tenants"
)

type Handler struct {
	service    Service
	actorStore authz.ActorStore
	auditStore authz.AuditLogStore
}

type HandlerOption func(*Handler)

func WithAuthorizationAudit(actorStore authz.ActorStore, auditStore authz.AuditLogStore) HandlerOption {
	return func(handler *Handler) {
		handler.actorStore = actorStore
		handler.auditStore = auditStore
	}
}

func NewHandler(service Service, options ...HandlerOption) *Handler {
	handler := &Handler{service: service}
	for _, option := range options {
		if option != nil {
			option(handler)
		}
	}
	return handler
}

func (h *Handler) List(c fiber.Ctx) error {
	var filter PersonListFilter
	if err := c.Bind().Query(&filter); err != nil {
		return httpx.WriteError(c, err)
	}

	items, total, err := h.service.List(c.Context(), requestTenantID(c), filter)
	if err != nil {
		return httpx.WriteError(c, err)
	}

	return c.JSON(httpx.APIResponse{
		Data: map[string]any{
			"items": items,
			"total": total,
		},
	})
}

// SearchGlobal returns global Person fields only and deliberately omits every
// Membership/Actor/Collaborator/financial relationship. Route authorization
// additionally requires a tenant Actor, preventing global administrators from
// using this endpoint as an implicit cross-tenant directory.
func (h *Handler) SearchGlobal(c fiber.Ctx) error {
	var filter GlobalPersonSearchFilter
	if err := c.Bind().Query(&filter); err != nil {
		return httpx.WriteError(c, err)
	}
	items, total, err := h.service.SearchGlobal(c.Context(), requestTenantID(c), filter)
	if err != nil {
		return httpx.WriteError(c, err)
	}
	return c.JSON(httpx.APIResponse{Data: map[string]any{"items": items, "total": total}})
}

func (h *Handler) Create(c fiber.Ctx) error {
	var req CreatePersonRequest
	if err := c.Bind().Body(&req); err != nil {
		return httpx.WriteError(c, err)
	}

	created, err := h.service.Create(c.Context(), requestTenantID(c), req, actorUserID(c))
	if err != nil {
		return httpx.WriteError(c, err)
	}
	h.recordAudit(c, authz.PermissionPeopleCreate, "people.global.create_with_membership", created.GlobalPersonID, `{"membershipId":"`+created.MembershipID+`"}`)

	return c.Status(fiber.StatusCreated).JSON(httpx.APIResponse{
		Data: created,
	})
}

func (h *Handler) CreateMembership(c fiber.Ctx) error {
	var req CreatePersonMembershipRequest
	if err := c.Bind().Body(&req); err != nil {
		return httpx.WriteError(c, err)
	}
	created, err := h.service.CreateMembership(c.Context(), requestTenantID(c), req, actorUserID(c))
	if err != nil {
		if errors.Is(err, ErrApplicationSecuritySuspended) {
			return c.Status(fiber.StatusConflict).JSON(httpx.APIResponse{Error: &httpx.APIError{
				Code:    "account_security_suspended",
				Message: "The Authentication Account is security-suspended and requires Application Administrator review",
			}})
		}
		return httpx.WriteError(c, err)
	}
	h.recordAuditTarget(c, authz.PermissionPeopleCreate, "people.memberships.create", "person_tenant_membership", created.MembershipID, membershipAuditMetadata(created.GlobalPersonID, "", created.StatusID))
	return c.Status(fiber.StatusCreated).JSON(httpx.APIResponse{Data: created})
}

func (h *Handler) Reactivate(c fiber.Ctx) error {
	id := c.Params("id")
	reactivated, err := h.service.Reactivate(c.Context(), requestTenantID(c), id, actorUserID(c))
	if err != nil {
		if errors.Is(err, ErrApplicationSecuritySuspended) {
			return c.Status(fiber.StatusConflict).JSON(httpx.APIResponse{Error: &httpx.APIError{
				Code:    "account_security_suspended",
				Message: "The Authentication Account is security-suspended and requires Application Administrator review",
			}})
		}
		return httpx.WriteError(c, err)
	}
	h.recordAudit(c, authz.PermissionPeopleUpdate, "people.operational_reactivate", reactivated.GlobalPersonID, `{"membershipId":"`+reactivated.MembershipID+`"}`)
	h.recordAuditTarget(c, authz.PermissionPeopleUpdate, "people.memberships.reactivate", "person_tenant_membership", reactivated.MembershipID, membershipAuditMetadata(reactivated.GlobalPersonID, "", reactivated.StatusID))
	return c.JSON(httpx.APIResponse{Data: reactivated})
}

func (h *Handler) GetByID(c fiber.Ctx) error {
	id := c.Params("id")

	item, err := h.service.GetByID(c.Context(), requestTenantID(c), id)
	if err != nil {
		return httpx.WriteError(c, err)
	}

	return c.JSON(httpx.APIResponse{
		Data: item,
	})
}

func (h *Handler) Update(c fiber.Ctx) error {
	id := c.Params("id")
	tenantID := requestTenantID(c)

	var req UpdatePersonRequest
	if err := c.Bind().Body(&req); err != nil {
		return httpx.WriteError(c, err)
	}

	previousStatusID := ""
	if previous, getErr := h.service.GetByID(c.Context(), tenantID, id); getErr == nil && previous != nil {
		previousStatusID = strings.TrimSpace(previous.StatusID)
	}

	updated, err := h.service.Update(c.Context(), tenantID, id, req, actorUserID(c))
	if err != nil {
		if errors.Is(err, ErrTenantReactivationRequired) {
			return c.Status(fiber.StatusConflict).JSON(httpx.APIResponse{Error: &httpx.APIError{
				Code:    "tenant_reactivation_required",
				Message: "Use the Tenant reactivation action to return an operationally inactive Person to ACTIVE",
			}})
		}
		return httpx.WriteError(c, err)
	}
	// Updating through a tenant changes the shared global Person fields while
	// status/notes remain tenant-membership data. The audit row captures the
	// originating Tenant and complete effective identity chain.
	h.recordAudit(c, authz.PermissionPeopleUpdate, "people.global.update_from_tenant", updated.GlobalPersonID, `{"membershipId":"`+updated.MembershipID+`"}`)
	if previousStatusID != "" && previousStatusID != strings.TrimSpace(updated.StatusID) {
		h.recordAuditTarget(c, authz.PermissionPeopleUpdate, "people.memberships.status_change", "person_tenant_membership", updated.MembershipID, membershipAuditMetadata(updated.GlobalPersonID, previousStatusID, updated.StatusID))
	}

	return c.JSON(httpx.APIResponse{
		Data: updated,
	})
}

func (h *Handler) GetPhoto(c fiber.Ctx) error {
	photo, err := h.service.GetPhoto(c.Context(), requestTenantID(c), c.Params("id"))
	if err != nil {
		return httpx.WriteError(c, err)
	}
	c.Set("Content-Type", photo.ContentType)
	c.Set("Cache-Control", "private, max-age=300")
	c.Set("X-Content-Type-Options", "nosniff")
	return c.Send(photo.Data)
}

func (h *Handler) SetPhoto(c fiber.Ctx) error {
	contentType := strings.TrimSpace(strings.Split(c.Get("Content-Type"), ";")[0])
	photo, err := h.service.SetPhoto(c.Context(), requestTenantID(c), c.Params("id"), contentType, c.Body(), actorUserID(c))
	if err != nil {
		return httpx.WriteError(c, err)
	}
	h.recordAudit(c, authz.PermissionPeopleUpdate, "people.photo.replace", c.Params("id"), `{"contentType":"`+photo.ContentType+`"}`)
	return c.JSON(httpx.APIResponse{Data: photo})
}

func (h *Handler) DeletePhoto(c fiber.Ctx) error {
	if err := h.service.DeletePhoto(c.Context(), requestTenantID(c), c.Params("id")); err != nil {
		return httpx.WriteError(c, err)
	}
	h.recordAudit(c, authz.PermissionPeopleUpdate, "people.photo.remove", c.Params("id"), "")
	return c.SendStatus(fiber.StatusNoContent)
}

func (h *Handler) recordAudit(c fiber.Ctx, permission authz.Permission, operation, targetID, metadataJSON string) {
	h.recordAuditTarget(c, permission, operation, "global_person", targetID, metadataJSON)
}

func (h *Handler) recordAuditTarget(c fiber.Ctx, permission authz.Permission, operation, targetType, targetID, metadataJSON string) {
	if h.auditStore == nil {
		return
	}
	actor, err := authz.ResolveRequestActor(c, h.actorStore)
	if err != nil && !errors.Is(err, authz.ErrMissingActor) {
		return
	}
	_ = h.auditStore.RecordAuthorizationAudit(c.Context(), authz.AuthorizationAuditEntry{
		Actor:           actor,
		FallbackActorID: strings.TrimSpace(c.Get(authz.HeaderActorID)),
		TenantID:        requestTenantID(c),
		Permission:      permission,
		Operation:       operation,
		TargetType:      strings.TrimSpace(targetType),
		TargetID:        strings.TrimSpace(targetID),
		Decision:        authz.AuditDecisionAuthorized,
		MetadataJSON:    metadataJSON,
		CorrelationID:   authz.RequestCorrelationID(c),
		RequestMethod:   c.Method(),
		RequestPath:     c.Path(),
	})
}

func membershipAuditMetadata(globalPersonID, previousStatusID, statusID string) string {
	payload := map[string]string{"globalPersonId": strings.TrimSpace(globalPersonID)}
	if strings.TrimSpace(previousStatusID) != "" {
		payload["previousStatusId"] = strings.TrimSpace(previousStatusID)
	}
	if strings.TrimSpace(statusID) != "" {
		payload["statusId"] = strings.TrimSpace(statusID)
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		return ""
	}
	return string(encoded)
}

func requestTenantID(c fiber.Ctx) string {
	if actor, err := authz.RequestActorFromContext(c); err == nil && actor != nil {
		tenantID := strings.TrimSpace(actor.TenantID)
		if tenantID != "" && tenantID != authz.GlobalTenantScope {
			return tenantID
		}
	}

	// Route-disabled handler tests do not install an authoritative actor. Honor
	// their explicit tenant header while retaining the historic default fallback.
	if tenantID := strings.TrimSpace(c.Get(authz.HeaderTenantID)); tenantID != "" {
		return tenantID
	}
	return tenants.DefaultTenantID
}

func actorUserID(c fiber.Ctx) string {
	value := c.Locals("userID")
	if userID, ok := value.(string); ok {
		return userID
	}
	return "system"
}
