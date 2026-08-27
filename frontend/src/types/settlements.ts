export type SettlementPreview = {
  collaboratorId: string;
  collaboratorLabel?: string;
  journeyStatusCode?: string;
  brlBalance: number;
  goldGramBalance: number;
  pendingAccrualItems: number;
  outstandingReceipts: number;
  canClose: boolean;
  blockingReasons: string[];
};

export type JourneySettlement = {
  id: string;
  collaboratorId: string;
  settlementType: string;
  requestId: string;
  status: string;
  effectiveDate: string;
  brlAmount: number;
  goldGramAmount: number;
  notes?: string;
  authorizedBy?: string;
  authorizedAt?: string;
};

export type SettlementLedgerEntry = {
  id: string;
  entryType: string;
  direction: string;
  valueUnitCode?: string;
  amount: number;
  effectiveDate: string;
};

export type SecondApprovalInput = {
  approvedBy: string;
  notes?: string;
};

export type CorrectionReasonInput = {
  reasonCode: string;
  reasonText: string;
  secondApproval?: SecondApprovalInput;
};

export type ZeroGoldInput = CorrectionReasonInput & {
    requestId: string;
    effectiveDate: string;
    notes?: string;
  };

export type ZeroGoldResult = {
  settlement: JourneySettlement;
  ledgerEntry: SettlementLedgerEntry;
};

export type PartialPayoutInput = CorrectionReasonInput & {
    requestId: string;
    effectiveDate: string;
    brlAmount: number;
    goldGramAmount: number;
    notes?: string;
  };

export type PartialPayoutResult = {
  settlement: JourneySettlement;
  ledgerEntries: SettlementLedgerEntry[];
};

export type CloseJourneyInput = CorrectionReasonInput & {
    requestId: string;
    effectiveDate: string;
    confirm: boolean;
    notes?: string;
  };

export type CloseJourneyResult = {
  settlement: JourneySettlement;
  ledgerEntries: SettlementLedgerEntry[];
  journeyStatus: string;
  closedAt: string;
};

export type FinalSettlementInput = CorrectionReasonInput & {
  requestId: string;
  effectiveDate: string;
  notes: string;
};

export type FinalSettlementResult = {
  settlement: JourneySettlement;
  ledgerEntries: SettlementLedgerEntry[];
};
