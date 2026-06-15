package routes

import (
	"github.com/gofiber/fiber/v3"

	"enterpriseremotesystems/backend/internal/authz"
)

func RegisterPeopleRoutes(v1 fiber.Router, deps Dependencies) {
	r := v1.Group("/people")
	r.Get("/", requirePermission(deps, authz.PermissionPeopleRead), deps.PeopleHandler.List)
	r.Post("/", requirePermission(deps, authz.PermissionPeopleCreate), deps.PeopleHandler.Create)
	r.Get("/:id", requirePermission(deps, authz.PermissionPeopleRead), deps.PeopleHandler.GetByID)
	r.Put("/:id", requirePermission(deps, authz.PermissionPeopleUpdate), deps.PeopleHandler.Update)
}
