export type AccrualRunStatus =
  | "DRAFT"
  | "PENDING_INPUT"
  | "READY_TO_POST"
  | "POSTED"
  | "VOIDED";

export type AccrualItemStatus = "PENDING" | "READY" | "POSTED" | "SKIPPED";

export type AccrualSummary = {
  totalItems: number;
  readyItems: number;
  pendingItems: number;
  skippedItems: number;
  postedItems: number;
};

export type AccrualRun = {
  id: string;
  tenantId: string;
  workPeriodId: string;
  status: AccrualRunStatus;
  accrualDate: string;
  notes?: string;
  summary: AccrualSummary;
  createdAt: string;
  updatedAt: string;
};

export type AccrualItem = {
  id: string;
  tenantId: string;
  accrualRunId: string;
  workPeriodId: string;
  workPeriodAssignmentId?: string;
  collaboratorId: string;
  collaboratorName?: string;
  calculationType: string;
  direction: "CREDIT" | "DEBIT";
  brlAmount?: number;
  goldGramAmount?: number;
  status: AccrualItemStatus;
  pendingReason?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
};

export type AccrualRunListResponse = {
  items: AccrualRun[];
  total: number;
  page: number;
  pageSize: number;
};

export type AccrualItemListResponse = {
  items: AccrualItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type CreateAccrualRunInput = {
  accrualDate: string;
  notes?: string;
};

export type GoldProductionEntry = {
  id: string;
  tenantId: string;
  workPeriodId: string;
  locationId: string;
  locationLabel?: string;
  productionDate: string;
  goldGramsProduced: number;
  active: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type GoldProductionEntryListResponse = {
  items: GoldProductionEntry[];
  total: number;
  page: number;
  pageSize: number;
};

export type CreateGoldProductionEntryInput = {
  locationId: string;
  productionDate: string;
  goldGramsProduced: number;
  notes?: string;
};

export type UpdateGoldProductionEntryInput = CreateGoldProductionEntryInput;
