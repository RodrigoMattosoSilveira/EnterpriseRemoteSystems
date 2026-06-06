package routes

import "github.com/gofiber/fiber/v3"

func RegisterWorkPeriodAssignmentRoutes(v1 fiber.Router, deps Dependencies) {
	workPeriods := v1.Group("/work-periods")
	workPeriods.Get("/:id/assignments", deps.WorkPeriodAssignmentHandler.ListByWorkPeriod)
	workPeriods.Post("/:id/assignments", deps.WorkPeriodAssignmentHandler.Create)

	assignments := v1.Group("/work-period-assignments")
	assignments.Get("/:assignmentId", deps.WorkPeriodAssignmentHandler.GetByID)
	assignments.Patch("/:assignmentId", deps.WorkPeriodAssignmentHandler.Update)
	assignments.Patch("/:assignmentId/deactivate", deps.WorkPeriodAssignmentHandler.Deactivate)
	assignments.Delete("/:assignmentId", deps.WorkPeriodAssignmentHandler.Delete)
}
