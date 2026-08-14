export type SecondPersonApprovalPolicy = {
  tenantId: string;
  required: boolean;
  updatedBy?: string;
  updatedAt?: string;
};

export type UpdateSecondPersonApprovalPolicyInput = {
  required: boolean;
};

export type LedgerEntryReceipt = {
  id: string;
  receiptNumber?: string;
  status: string;
  outstanding: boolean;
  printedAt?: string;
  returnedAt?: string;
  signedDocumentRef?: string;
};

export type LedgerEntry = {
  id: string;
  tenantId: string;
  collaboratorId: string;
  collaboratorLabel?: string;
  valueUnitId: string;
  valueUnitLabel?: string;
  valueUnitCode?: string;
  entryType: string;
  direction: string;
  amount: number;
  signedAmount: number;
  effectiveDate: string;
  sourceType: string;
  sourceId: string;
  sourceLabel?: string;
  sourceWorkPeriodId?: string;
  sourceWorkDate?: string;
  sourceWorkPeriodName?: string;
  description?: string;
  active: boolean;
  correctionType: string;
  relatedEntryId?: string;
  receipt?: LedgerEntryReceipt;
  createdAt: string;
  updatedAt: string;
};

export type CurrentAccountBalance = {
  collaboratorId: string;
  collaboratorLabel?: string;
  valueUnitId: string;
  valueUnitCode?: string;
  valueUnitLabel?: string;
  balance: number;
};

export type LedgerEntryListResult = {
  items: LedgerEntry[];
  total: number;
  page: number;
  pageSize: number;
};

export type CurrentAccountDetail = {
  collaboratorId: string;
  collaboratorLabel?: string;
  balances: CurrentAccountBalance[];
  ledgerEntries: LedgerEntryListResult;
};

export type CurrentAccountFilter = {
  valueUnitId?: string;
  entryType?: string;
  direction?: string;
  sourceType?: string;
  outstandingReceipts?: boolean;
  includeInactive?: boolean;
  page?: number;
  pageSize?: number;
};
