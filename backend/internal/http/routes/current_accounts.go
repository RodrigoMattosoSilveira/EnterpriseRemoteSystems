package routes

import (
	"github.com/gofiber/fiber/v3"

	"enterpriseremotesystems/backend/internal/authz"
)

func RegisterCurrentAccountRoutes(v1 fiber.Router, deps Dependencies) {
	receipts := v1.Group("/receipts")
	receipts.Get("/outstanding", authorizationHandledByHandler(), deps.CurrentAccountHandler.ListOutstandingReceipts)
	receipts.Post("/backfill-debit-ledger-entries", authorizationHandledByHandler(), deps.CurrentAccountHandler.BackfillDebitLedgerReceipts)

	r := v1.Group("/current-accounts")
	r.Get("/settings/second-person-approval", authorizationHandledByHandler(), deps.CurrentAccountHandler.GetSecondPersonApprovalPolicy)
	r.Put("/settings/second-person-approval", authorizationHandledByHandler(), deps.CurrentAccountHandler.UpdateSecondPersonApprovalPolicy)
	r.Get("/:collaboratorId/balances", requirePermission(deps, authz.PermissionCurrentAccountsSummaryRead), deps.CurrentAccountHandler.ListBalances)
	r.Get("/:collaboratorId/ledger-entries", requirePermission(deps, authz.PermissionCurrentAccountsLedgerRead), deps.CurrentAccountHandler.ListEntries)

	ledger := v1.Group("/ledger-entries")
	ledger.Get("/:entryId/receipt", requirePermission(deps, authz.PermissionLedgerReceiptsRead), deps.CurrentAccountHandler.GetPrintableReceipt)
	ledger.Get("/:entryId/receipt/self", authorizationHandledByHandler(), deps.CurrentAccountHandler.GetSelfPrintableReceipt)
	ledger.Post("/:entryId/receipt/print", authorizationHandledByHandler(), deps.CurrentAccountHandler.PrintReceipt)
	ledger.Post("/:entryId/receipt/return", authorizationHandledByHandler(), deps.CurrentAccountHandler.ReturnReceipt)
	ledger.Post("/:entryId/receipt/accept", authorizationHandledByHandler(), deps.CurrentAccountHandler.AcceptReceipt)
	ledger.Post("/:entryId/reverse", authorizationHandledByHandler(), deps.CurrentAccountHandler.ReverseEntry)
	ledger.Post("/:entryId/replace", authorizationHandledByHandler(), deps.CurrentAccountHandler.ReplaceEntry)
}
