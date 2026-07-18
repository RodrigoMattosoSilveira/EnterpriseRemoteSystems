package currentaccounts

import "errors"

var ErrDebitReceiptObligationMissing = errors.New("debit ledger entry receipt obligation was not generated")
