package routes

import "github.com/gofiber/fiber/v3"

func RegisterCurrentAccountRoutes(v1 fiber.Router, deps Dependencies) {
	r := v1.Group("/current-accounts")
	r.Get("/:collaboratorId/balances", deps.CurrentAccountHandler.ListBalances)
	r.Get("/:collaboratorId/ledger-entries", deps.CurrentAccountHandler.ListEntries)

	ledger := v1.Group("/ledger-entries")
	ledger.Post("/:entryId/reverse", deps.CurrentAccountHandler.ReverseEntry)
	ledger.Post("/:entryId/replace", deps.CurrentAccountHandler.ReplaceEntry)
}
