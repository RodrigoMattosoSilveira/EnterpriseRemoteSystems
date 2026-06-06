package routes

import "github.com/gofiber/fiber/v3"

func RegisterGoldProductionRoutes(v1 fiber.Router, deps Dependencies) {
	workPeriods := v1.Group("/work-periods")
	workPeriods.Get("/:id/gold-production-entries", deps.GoldProductionHandler.ListByWorkPeriod)
	workPeriods.Post("/:id/gold-production-entries", deps.GoldProductionHandler.Create)

	entries := v1.Group("/gold-production-entries")
	entries.Get("/:entryId", deps.GoldProductionHandler.GetByID)
	entries.Patch("/:entryId", deps.GoldProductionHandler.Update)
	entries.Patch("/:entryId/deactivate", deps.GoldProductionHandler.Deactivate)
	entries.Delete("/:entryId", deps.GoldProductionHandler.Delete)
}
