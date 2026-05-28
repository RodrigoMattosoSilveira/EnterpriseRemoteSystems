package routes

import "github.com/gofiber/fiber/v3"

func RegisterReferenceDataRoutes(v1 fiber.Router, deps Dependencies) {
	r := v1.Group("/reference-data")
	r.Get("/:type", deps.ReferenceDataHandler.ListByType)
	r.Post("/:type", deps.ReferenceDataHandler.Create)
	r.Put("/:type/:id", deps.ReferenceDataHandler.Update)
	r.Patch("/:type/:id/deactivate", deps.ReferenceDataHandler.Deactivate)
	r.Patch("/:type/:id/reactivate", deps.ReferenceDataHandler.Reactivate)
}
