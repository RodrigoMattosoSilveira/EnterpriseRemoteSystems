package routes

import (
	"github.com/gofiber/fiber/v3"

	"enterpriseremotesystems/backend/internal/authz"
)

func RegisterWorkPeriodRoutes(v1 fiber.Router, deps Dependencies) {
	r := v1.Group("/work-periods")
	r.Get("/", requirePermission(deps, authz.PermissionPlanningRead), deps.WorkPeriodHandler.List)
	r.Post("/", requirePermission(deps, authz.PermissionPlanningCreate), deps.WorkPeriodHandler.Create)
	r.Get("/:id/print-roster", requirePermission(deps, authz.PermissionPlanningRead), deps.WorkPeriodHandler.PrintRoster)
	r.Post("/:id/inform", requirePermission(deps, authz.PermissionPlanningUpdate), deps.WorkPeriodHandler.Inform)
	r.Get("/:id", requirePermission(deps, authz.PermissionPlanningRead), deps.WorkPeriodHandler.GetByID)
}
