package routes

import "github.com/gofiber/fiber/v3"

func RegisterExpenseRoutes(v1 fiber.Router, deps Dependencies) {
	r := v1.Group("/expenses")
	r.Get("/", deps.ExpenseHandler.List)
	r.Post("/", deps.ExpenseHandler.Create)
	r.Get("/:id", deps.ExpenseHandler.GetByID)
}
