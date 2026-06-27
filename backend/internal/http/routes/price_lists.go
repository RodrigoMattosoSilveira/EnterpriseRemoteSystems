package routes

import (
	"github.com/gofiber/fiber/v3"

	"enterpriseremotesystems/backend/internal/authz"
)

func RegisterPriceListRoutes(v1 fiber.Router, deps Dependencies) {
	items := v1.Group("/price-list-items")
	items.Get("/", requirePermission(deps, authz.PermissionPriceListsRead), deps.PriceListHandler.ListItems)
	items.Post("/", requirePermission(deps, authz.PermissionPriceListsCreate), deps.PriceListHandler.CreateItem)
	items.Patch("/:id", requirePermission(deps, authz.PermissionPriceListsUpdate), deps.PriceListHandler.UpdateItem)
	items.Patch("/:id/deactivate", requirePermission(deps, authz.PermissionPriceListsUpdate), deps.PriceListHandler.DeactivateItem)
	items.Patch("/:id/reactivate", requirePermission(deps, authz.PermissionPriceListsUpdate), deps.PriceListHandler.ReactivateItem)

	goldPrices := v1.Group("/gold-prices")
	goldPrices.Get("/", requirePermission(deps, authz.PermissionPriceListsRead), deps.PriceListHandler.ListGoldPrices)
	goldPrices.Get("/latest", requirePermission(deps, authz.PermissionPriceListsRead), deps.PriceListHandler.LatestGoldPrice)
	goldPrices.Post("/", requirePermission(deps, authz.PermissionPriceListsCreate), deps.PriceListHandler.CreateGoldPrice)
	goldPrices.Patch("/:id/deactivate", requirePermission(deps, authz.PermissionPriceListsUpdate), deps.PriceListHandler.DeactivateGoldPrice)
}
