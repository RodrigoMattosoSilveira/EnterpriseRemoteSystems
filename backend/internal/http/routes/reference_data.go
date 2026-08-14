package routes

import (
	"github.com/gofiber/fiber/v3"

	"enterpriseremotesystems/backend/internal/authz"
)

func RegisterReferenceDataRoutes(v1 fiber.Router, deps Dependencies) {
	r := v1.Group("/reference-data")
	r.Get("/:type", requirePermission(deps, authz.PermissionReferenceDataRead), deps.ReferenceDataHandler.ListByType)
	r.Post("/:type", requirePermission(deps, authz.PermissionReferenceDataManage), deps.ReferenceDataHandler.Create)
	r.Put("/:type/:id", requirePermission(deps, authz.PermissionReferenceDataManage), deps.ReferenceDataHandler.Update)
	r.Patch("/:type/:id/deactivate", requirePermission(deps, authz.PermissionReferenceDataManage), deps.ReferenceDataHandler.Deactivate)
	r.Patch("/:type/:id/reactivate", requirePermission(deps, authz.PermissionReferenceDataManage), deps.ReferenceDataHandler.Reactivate)
}
