package currentaccounts

import "errors"

var (
	ErrDebitReceiptObligationMissing           = errors.New("debit ledger entry receipt obligation was not generated")
	ErrFinalSettlementReceiptObligationMissing = errors.New("final settlement ledger entry receipt obligation was not generated")
)
