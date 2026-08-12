package workperiodassignments

import (
	"github.com/gofiber/fiber/v3"

	"enterpriseremotesystems/backend/internal/shared/httpx"
	"enterpriseremotesystems/backend/internal/shared/requesttenant"
)

type Handler struct{ service Service }

func NewHandler(service Service) *Handler { return &Handler{service: service} }

func (h *Handler) ListByWorkPeriod(c fiber.Ctx) error {
	var filter WorkPeriodAssignmentListFilter
	if err := c.Bind().Query(&filter); err != nil {
		return httpx.WriteError(c, err)
	}

	result, err := h.service.ListByWorkPeriod(requesttenant.Context(c), c.Params("id"), filter)
	if err != nil {
		return httpx.WriteError(c, err)
	}

	return c.JSON(httpx.APIResponse{Data: result})
}

func (h *Handler) GetPlanningTemplate(c fiber.Ctx) error {
	result, err := h.service.GetPlanningTemplate(requesttenant.Context(c), c.Params("id"))
	if err != nil {
		return httpx.WriteError(c, err)
	}
	return c.JSON(httpx.APIResponse{Data: result})
}

func (h *Handler) BulkPlan(c fiber.Ctx) error {
	var req BulkPlanWorkPeriodAssignmentsRequest
	if err := c.Bind().Body(&req); err != nil {
		return httpx.WriteError(c, err)
	}
	result, err := h.service.BulkPlan(requesttenant.Context(c), c.Params("id"), req, actorUserID(c))
	if err != nil {
		return httpx.WriteError(c, err)
	}
	return c.JSON(httpx.APIResponse{Data: result})
}

func (h *Handler) RefinePlanAssignment(c fiber.Ctx) error {
	var req PlanAssignmentRefinementRequest
	if err := c.Bind().Body(&req); err != nil {
		return httpx.WriteError(c, err)
	}
	result, err := h.service.RefinePlanAssignment(requesttenant.Context(c), c.Params("id"), req, actorUserID(c))
	if err != nil {
		return httpx.WriteError(c, err)
	}
	return c.JSON(httpx.APIResponse{Data: result})
}

func (h *Handler) Create(c fiber.Ctx) error {
	var req CreateWorkPeriodAssignmentRequest
	if err := c.Bind().Body(&req); err != nil {
		return httpx.WriteError(c, err)
	}

	created, err := h.service.Create(requesttenant.Context(c), c.Params("id"), req, actorUserID(c))
	if err != nil {
		return httpx.WriteError(c, err)
	}

	return c.Status(fiber.StatusCreated).JSON(httpx.APIResponse{Data: created})
}

func (h *Handler) GetByID(c fiber.Ctx) error {
	item, err := h.service.GetByID(requesttenant.Context(c), c.Params("assignmentId"))
	if err != nil {
		return httpx.WriteError(c, err)
	}
	return c.JSON(httpx.APIResponse{Data: item})
}

func (h *Handler) Update(c fiber.Ctx) error {
	var req UpdateWorkPeriodAssignmentRequest
	if err := c.Bind().Body(&req); err != nil {
		return httpx.WriteError(c, err)
	}

	updated, err := h.service.Update(requesttenant.Context(c), c.Params("assignmentId"), req, actorUserID(c))
	if err != nil {
		return httpx.WriteError(c, err)
	}
	return c.JSON(httpx.APIResponse{Data: updated})
}

func (h *Handler) MarkActualOutcome(c fiber.Ctx) error {
	var req MarkActualOutcomeRequest
	if err := c.Bind().Body(&req); err != nil {
		return httpx.WriteError(c, err)
	}

	updated, err := h.service.MarkActualOutcome(requesttenant.Context(c), c.Params("assignmentId"), req, actorUserID(c))
	if err != nil {
		return httpx.WriteError(c, err)
	}
	return c.JSON(httpx.APIResponse{Data: updated})
}

func (h *Handler) Deactivate(c fiber.Ctx) error {
	updated, err := h.service.Deactivate(requesttenant.Context(c), c.Params("assignmentId"), actorUserID(c))
	if err != nil {
		return httpx.WriteError(c, err)
	}
	return c.JSON(httpx.APIResponse{Data: updated})
}

func (h *Handler) Delete(c fiber.Ctx) error {
	if err := h.service.Delete(requesttenant.Context(c), c.Params("assignmentId"), actorUserID(c)); err != nil {
		return httpx.WriteError(c, err)
	}
	return c.SendStatus(fiber.StatusNoContent)
}

func actorUserID(c fiber.Ctx) string {
	value := c.Locals("userID")
	if userID, ok := value.(string); ok {
		return userID
	}
	return "system"
}
