package routes

import "github.com/gofiber/fiber/v3"

func RegisterWorkPeriodRoutes(v1 fiber.Router, deps Dependencies) {
	r := v1.Group("/work-periods")
	r.Get("/", deps.WorkPeriodHandler.List)
	r.Post("/", deps.WorkPeriodHandler.Create)
	r.Get("/:id/print-roster", deps.WorkPeriodHandler.PrintRoster)
	r.Post("/:id/inform", deps.WorkPeriodHandler.Inform)
	r.Get("/:id", deps.WorkPeriodHandler.GetByID)
}
