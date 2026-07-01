export type WorkPeriodStatus =
  | "PLANNING"
  | "INFORMED"
  | "ACCRUAL_OPEN"
  | "PARTIALLY_POSTED"
  | "FULLY_POSTED"
  | "CLOSED";

export type WorkPeriod = {
  id: string;
  tenantId: string;
  workDate: string;
  periodCode: string;
  name: string;
  startsAt: string;
  endsAt: string;
  status: WorkPeriodStatus;
  informedAt?: string;
  accrualOpenedAt?: string;
  closedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateWorkPeriodInput = {
  workDate: string;
  periodCode: string;
  name: string;
  startsAt: string;
  endsAt: string;
};

export type WorkPeriodListFilter = {
  dateFrom?: string;
  dateTo?: string;
  status?: string;
  page?: number;
  pageSize?: number;
};

export type WorkPeriodListResponse = {
  items: WorkPeriod[];
  total: number;
  page: number;
  pageSize: number;
};

export type PlannedStatus = "INCLUDED" | "EXCLUDED";
export type ActualStatus =
  "WORKED" | "ABSENT" | "SICK_DAY_OFF" | "TIME_OFF" | "REPLACED" | "CANCELLED";

export type WorkPeriodAssignment = {
  id: string;
  tenantId: string;
  workPeriodId: string;
  collaboratorId: string;
  collaboratorName?: string;
  collaboratorNickname?: string;
  plannedStatus: PlannedStatus;
  actualStatus?: ActualStatus;
  replacementForAssignmentId?: string;
  sectorId: string;
  sectorLabel?: string;
  locationId: string;
  locationLabel?: string;
  taskId: string;
  taskLabel?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SaveWorkPeriodAssignmentInput = {
  collaboratorId: string;
  plannedStatus: PlannedStatus;
  replacementForAssignmentId?: string;
  sectorId: string;
  locationId: string;
  taskId: string;
};

export type WorkPeriodAssignmentListResponse = {
  items: WorkPeriodAssignment[];
  total: number;
  page: number;
  pageSize: number;
};

export type WorkPlanRosterRow = {
  assignmentId: string;
  collaboratorId: string;
  name: string;
  nickname?: string;
  sectorId: string;
  sectorLabel: string;
  locationId: string;
  locationLabel: string;
  taskId: string;
  taskLabel: string;
  replacementForAssignmentId?: string;
};

export type WorkPlanRoster = {
  workPeriodId: string;
  workDate: string;
  displayDate: string;
  periodCode: string;
  periodName: string;
  title: string;
  subtitle: string;
  status: string;
  rows: WorkPlanRosterRow[];
};

export type WorkPeriodPlanningTemplateRow = {
  assignmentId?: string;
  templateAssignmentId?: string;
  collaboratorId: string;
  collaboratorName?: string;
  collaboratorNickname?: string;
  projectedEndDate?: string;
  selected: boolean;
  sectorId: string;
  sectorLabel?: string;
  locationId: string;
  locationLabel?: string;
  taskId: string;
  taskLabel?: string;
};

export type WorkPeriodPlanningTemplate = {
  workPeriodId: string;
  sourceWorkPeriodId?: string;
  sourceWorkDate?: string;
  sourcePeriodName?: string;
  rows: WorkPeriodPlanningTemplateRow[];
};

export type BulkPlanWorkPeriodAssignmentRow = {
  collaboratorId: string;
  selected: boolean;
  sectorId: string;
  locationId: string;
  taskId: string;
  replacementForAssignmentId?: string;
};

export type BulkPlanWorkPeriodAssignmentsInput = {
  rows: BulkPlanWorkPeriodAssignmentRow[];
};

export type BulkPlanWorkPeriodAssignmentsResult = {
  assignments: WorkPeriodAssignment[];
  selectedCount: number;
};
