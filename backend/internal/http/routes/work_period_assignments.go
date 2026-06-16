package routes

import (
	"github.com/gofiber/fiber/v3"

	"enterpriseremotesystems/backend/internal/authz"
)

func RegisterWorkPeriodAssignmentRoutes(v1 fiber.Router, deps Dependencies) {
	workPeriods := v1.Group("/work-periods")
	workPeriods.Get("/:id/assignments", requirePermission(deps, authz.PermissionPlanningRead), deps.WorkPeriodAssignmentHandler.ListByWorkPeriod)
	workPeriods.Post("/:id/assignments", requirePermission(deps, authz.PermissionPlanningCreate), deps.WorkPeriodAssignmentHandler.Create)

	assignments := v1.Group("/work-period-assignments")
	assignments.Get("/:assignmentId", requirePermission(deps, authz.PermissionPlanningRead), deps.WorkPeriodAssignmentHandler.GetByID)
	assignments.Patch("/:assignmentId", requirePermission(deps, authz.PermissionPlanningUpdate), deps.WorkPeriodAssignmentHandler.Update)
	assignments.Patch("/:assignmentId/outcome", requirePermission(deps, authz.PermissionPlanningUpdate), deps.WorkPeriodAssignmentHandler.MarkActualOutcome)
	assignments.Patch("/:assignmentId/deactivate", requirePermission(deps, authz.PermissionPlanningUpdate), deps.WorkPeriodAssignmentHandler.Deactivate)
	assignments.Delete("/:assignmentId", requirePermission(deps, authz.PermissionPlanningUpdate), deps.WorkPeriodAssignmentHandler.Delete)
}
