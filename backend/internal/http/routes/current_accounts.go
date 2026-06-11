package routes

import "github.com/gofiber/fiber/v3"

func RegisterCurrentAccountRoutes(v1 fiber.Router, deps Dependencies) {
	receipts := v1.Group("/receipts")
	receipts.Get("/outstanding", deps.CurrentAccountHandler.ListOutstandingReceipts)
	receipts.Post("/backfill-debit-ledger-entries", deps.CurrentAccountHandler.BackfillDebitLedgerReceipts)

	r := v1.Group("/current-accounts")
	r.Get("/:collaboratorId/balances", deps.CurrentAccountHandler.ListBalances)
	r.Get("/:collaboratorId/ledger-entries", deps.CurrentAccountHandler.ListEntries)

	ledger := v1.Group("/ledger-entries")
	ledger.Get("/:entryId/receipt", deps.CurrentAccountHandler.GetPrintableReceipt)
	ledger.Post("/:entryId/receipt/print", deps.CurrentAccountHandler.PrintReceipt)
	ledger.Post("/:entryId/receipt/return", deps.CurrentAccountHandler.ReturnReceipt)
	ledger.Post("/:entryId/reverse", deps.CurrentAccountHandler.ReverseEntry)
	ledger.Post("/:entryId/replace", deps.CurrentAccountHandler.ReplaceEntry)
}
