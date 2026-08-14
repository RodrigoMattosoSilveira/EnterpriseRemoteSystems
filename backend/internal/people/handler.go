package people

import (
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
		return httpx.WriteError(c, err)
	}
	h.recordAudit(c, authz.PermissionPeopleCreate, "people.memberships.create", created.GlobalPersonID, `{"membershipId":"`+created.MembershipID+`"}`)
	return c.Status(fiber.StatusCreated).JSON(httpx.APIResponse{Data: created})
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

	var req UpdatePersonRequest
	if err := c.Bind().Body(&req); err != nil {
		return httpx.WriteError(c, err)
	}

	updated, err := h.service.Update(c.Context(), requestTenantID(c), id, req, actorUserID(c))
	if err != nil {
		return httpx.WriteError(c, err)
	}
	// Updating through a tenant changes the shared global Person fields while
	// status/notes remain tenant-membership data. Record the originating tenant
	// and actor now; Bite 30I will enrich the audit identity chain further.
	h.recordAudit(c, authz.PermissionPeopleUpdate, "people.global.update_from_tenant", updated.GlobalPersonID, `{"membershipId":"`+updated.MembershipID+`"}`)

	return c.JSON(httpx.APIResponse{
		Data: updated,
	})
}

func (h *Handler) recordAudit(c fiber.Ctx, permission authz.Permission, operation, targetID, metadataJSON string) {
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
		TargetType:      "global_person",
		TargetID:        strings.TrimSpace(targetID),
		Decision:        authz.AuditDecisionAuthorized,
		MetadataJSON:    metadataJSON,
		RequestMethod:   c.Method(),
		RequestPath:     c.Path(),
	})
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
