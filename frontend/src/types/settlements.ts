export type SettlementPreview = {
  collaboratorId: string;
  collaboratorLabel?: string;
  journeyStatusCode?: string;
  brlBalance: number;
  goldGramBalance: number;
  pendingAccrualItems: number;
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

export type SettlementAuthorization = {
  settlementKey: string;
  authorizedBy: string;
};

export type CorrectionReasonInput = {
  reasonCode: string;
  reasonText: string;
};

export type ZeroGoldInput = SettlementAuthorization &
  CorrectionReasonInput & {
    requestId: string;
    effectiveDate: string;
    notes?: string;
  };

export type ZeroGoldResult = {
  settlement: JourneySettlement;
  ledgerEntry: SettlementLedgerEntry;
};

export type PartialPayoutInput = SettlementAuthorization &
  CorrectionReasonInput & {
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

export type CloseJourneyInput = SettlementAuthorization &
  CorrectionReasonInput & {
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
