package routes

import (
	"github.com/gofiber/fiber/v3"

	"enterpriseremotesystems/backend/internal/authz"
)

func RegisterExpenseRoutes(v1 fiber.Router, deps Dependencies) {
	r := v1.Group("/expenses")
	r.Get("/", requirePermission(deps, authz.PermissionExpensesRead), deps.ExpenseHandler.List)
	r.Post("/", requirePermission(deps, authz.PermissionExpensesCreate), deps.ExpenseHandler.Create)
	r.Get("/:id", requirePermission(deps, authz.PermissionExpensesRead), deps.ExpenseHandler.GetByID)
	r.Patch("/:id", requirePermission(deps, authz.PermissionExpensesUpdate), deps.ExpenseHandler.Update)
	r.Patch("/:id/deactivate", requirePermission(deps, authz.PermissionExpensesUpdate), deps.ExpenseHandler.Deactivate)
	r.Delete("/:id", requirePermission(deps, authz.PermissionExpensesUpdate), deps.ExpenseHandler.Delete)
}
