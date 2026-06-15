package routes

import (
	"github.com/gofiber/fiber/v3"

	"enterpriseremotesystems/backend/internal/authz"
)

func RegisterAccrualRoutes(v1 fiber.Router, deps Dependencies) {
	workPeriods := v1.Group("/work-periods")
	workPeriods.Get("/:id/accrual-runs", requirePermission(deps, authz.PermissionEarningsRead), deps.AccrualHandler.ListRunsByWorkPeriod)
	workPeriods.Post("/:id/accrual-runs", requirePermission(deps, authz.PermissionEarningsCreate), deps.AccrualHandler.CreateRun)

	runs := v1.Group("/accrual-runs")
	runs.Get("/:runId", requirePermission(deps, authz.PermissionEarningsRead), deps.AccrualHandler.GetRunByID)
	runs.Post("/:runId/recalculate", requirePermission(deps, authz.PermissionEarningsUpdate), deps.AccrualHandler.RecalculateRun)
	runs.Post("/:runId/post", requirePermission(deps, authz.PermissionEarningsUpdate), deps.AccrualHandler.PostRun)
	runs.Get("/:runId/items", requirePermission(deps, authz.PermissionEarningsRead), deps.AccrualHandler.ListItemsByRun)
}
