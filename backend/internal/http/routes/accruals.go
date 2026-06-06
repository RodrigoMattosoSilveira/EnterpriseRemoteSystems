package routes

import "github.com/gofiber/fiber/v3"

func RegisterAccrualRoutes(v1 fiber.Router, deps Dependencies) {
	workPeriods := v1.Group("/work-periods")
	workPeriods.Get("/:id/accrual-runs", deps.AccrualHandler.ListRunsByWorkPeriod)
	workPeriods.Post("/:id/accrual-runs", deps.AccrualHandler.CreateRun)

	runs := v1.Group("/accrual-runs")
	runs.Get("/:runId", deps.AccrualHandler.GetRunByID)
	runs.Post("/:runId/recalculate", deps.AccrualHandler.RecalculateRun)
	runs.Get("/:runId/items", deps.AccrualHandler.ListItemsByRun)
}
