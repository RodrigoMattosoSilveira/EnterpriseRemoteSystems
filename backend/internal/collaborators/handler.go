package collaborators

import (
	"encoding/json"
	"errors"
	"strings"

	"github.com/gofiber/fiber/v3"

	"enterpriseremotesystems/backend/internal/authz"
	"enterpriseremotesystems/backend/internal/shared/httpx"
	"enterpriseremotesystems/backend/internal/shared/requesttenant"
	"enterpriseremotesystems/backend/internal/shared/tenantctx"
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

func (h *Handler) ListCandidates(c fiber.Ctx) error {
	items, err := h.service.ListCandidates(requesttenant.Context(c))
	if err != nil {
		return httpx.WriteError(c, err)
	}

	return c.JSON(httpx.APIResponse{Data: items})
}

func (h *Handler) ListForMembership(c fiber.Ctx) error {
	membershipID := strings.TrimSpace(c.Params("membershipId"))
	if membershipID == "" {
		return httpx.WriteError(c, authz.ErrForbidden)
	}

	items, err := h.service.ListForMembership(requesttenant.Context(c), membershipID)
	if err != nil {
		return httpx.WriteError(c, err)
	}

	return c.JSON(httpx.APIResponse{Data: items})
}

func (h *Handler) ListSelf(c fiber.Ctx) error {
	actor, err := authz.RequestActorFromContext(c)
	if err != nil {
		return httpx.WriteError(c, err)
	}
	membershipID := strings.TrimSpace(actor.MembershipID)
	if membershipID == "" {
		return httpx.WriteError(c, authz.ErrForbidden)
	}

	items, err := h.service.ListSelf(requesttenant.Context(c), membershipID)
	if err != nil {
		return httpx.WriteError(c, err)
	}

	return c.JSON(httpx.APIResponse{Data: items})
}

func (h *Handler) List(c fiber.Ctx) error {
	var filter CollaboratorListFilter
	if err := c.Bind().Query(&filter); err != nil {
		return httpx.WriteError(c, err)
	}

	items, total, err := h.service.List(requesttenant.Context(c), filter)
	if err != nil {
		return httpx.WriteError(c, err)
	}

	return c.JSON(httpx.APIResponse{Data: map[string]any{"items": items, "total": total}})
}

func (h *Handler) Create(c fiber.Ctx) error {
	var req CreateCollaboratorRequest
	if err := c.Bind().Body(&req); err != nil {
		return httpx.WriteError(c, err)
	}

	created, err := h.service.Create(requesttenant.Context(c), req, actorUserID(c))
	if err != nil {
		return httpx.WriteError(c, err)
	}
	h.recordLifecycleAudit(c, authz.PermissionCollaboratorsCreate, "collaborators.journey.create", created.ID, created.PersonID, created.MembershipID)

	return c.Status(fiber.StatusCreated).JSON(httpx.APIResponse{Data: created})
}

func (h *Handler) GetSelfByID(c fiber.Ctx) error {
	actor, err := authz.RequestActorFromContext(c)
	if err != nil {
		return httpx.WriteError(c, err)
	}
	membershipID := strings.TrimSpace(actor.MembershipID)
	if membershipID == "" {
		return httpx.WriteError(c, authz.ErrForbidden)
	}

	item, err := h.service.GetSelfByID(requesttenant.Context(c), c.Params("id"), membershipID)
	if err != nil {
		return httpx.WriteError(c, err)
	}
	return c.JSON(httpx.APIResponse{Data: item})
}

func (h *Handler) GetByID(c fiber.Ctx) error {
	item, err := h.service.GetByID(requesttenant.Context(c), c.Params("id"))
	if err != nil {
		return httpx.WriteError(c, err)
	}
	return c.JSON(httpx.APIResponse{Data: item})
}

func (h *Handler) Update(c fiber.Ctx) error {
	var req UpdateCollaboratorRequest
	if err := c.Bind().Body(&req); err != nil {
		return httpx.WriteError(c, err)
	}

	updated, err := h.service.Update(requesttenant.Context(c), c.Params("id"), req, actorUserID(c))
	if err != nil {
		return httpx.WriteError(c, err)
	}

	return c.JSON(httpx.APIResponse{Data: updated})
}

func (h *Handler) UpdateWorkAssignment(c fiber.Ctx) error {
	var req UpdateCollaboratorWorkAssignmentRequest
	if err := c.Bind().Body(&req); err != nil {
		return httpx.WriteError(c, err)
	}

	updated, err := h.service.UpdateWorkAssignment(requesttenant.Context(c), c.Params("id"), req, actorUserID(c))
	if err != nil {
		return httpx.WriteError(c, err)
	}

	return c.JSON(httpx.APIResponse{Data: updated})
}

func (h *Handler) ExtendJourney(c fiber.Ctx) error {
	var req ExtendCollaboratorJourneyRequest
	if err := c.Bind().Body(&req); err != nil {
		return httpx.WriteError(c, err)
	}

	updated, err := h.service.ExtendJourney(requesttenant.Context(c), c.Params("id"), req, actorUserID(c))
	if err != nil {
		return httpx.WriteError(c, err)
	}

	return c.JSON(httpx.APIResponse{Data: updated})
}

func (h *Handler) recordLifecycleAudit(c fiber.Ctx, permission authz.Permission, operation, collaboratorID, personID, membershipID string) {
	if h.auditStore == nil {
		return
	}
	actor, err := authz.ResolveRequestActor(c, h.actorStore)
	if err != nil && !errors.Is(err, authz.ErrMissingActor) {
		return
	}
	metadata, _ := json.Marshal(map[string]string{
		"personId":     strings.TrimSpace(personID),
		"membershipId": strings.TrimSpace(membershipID),
	})
	_ = h.auditStore.RecordAuthorizationAudit(requesttenant.Context(c), authz.AuthorizationAuditEntry{
		Actor:           actor,
		FallbackActorID: strings.TrimSpace(c.Get(authz.HeaderActorID)),
		TenantID:        tenantctx.TenantID(requesttenant.Context(c)),
		Permission:      permission,
		Operation:       operation,
		TargetType:      "collaborator_journey",
		TargetID:        strings.TrimSpace(collaboratorID),
		Decision:        authz.AuditDecisionAuthorized,
		MetadataJSON:    string(metadata),
		CorrelationID:   authz.RequestCorrelationID(c),
		RequestMethod:   c.Method(),
		RequestPath:     c.Path(),
	})
}

func actorUserID(c fiber.Ctx) string {
	value := c.Locals("userID")
	if userID, ok := value.(string); ok {
		return userID
	}
	return "system"
}
