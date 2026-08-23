package collaborators

import (
	"strings"

	"github.com/gofiber/fiber/v3"

	"enterpriseremotesystems/backend/internal/authz"
	"enterpriseremotesystems/backend/internal/shared/httpx"
	"enterpriseremotesystems/backend/internal/shared/requesttenant"
)

type Handler struct{ service Service }

func NewHandler(service Service) *Handler { return &Handler{service: service} }

func (h *Handler) ListCandidates(c fiber.Ctx) error {
	items, err := h.service.ListCandidates(requesttenant.Context(c))
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

func actorUserID(c fiber.Ctx) string {
	value := c.Locals("userID")
	if userID, ok := value.(string); ok {
		return userID
	}
	return "system"
}
