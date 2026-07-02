export type Collaborator = {
  id: string;
  tenantId: string;

  personId: string;
  personName?: string;
  personNickname?: string;

  journeyStartDate: string;
  defaultEndDate: string;
  extensionDays: number;
  projectedEndDate: string;

  paymentMethodId: string;
  paymentMethodLabel?: string;
  paymentValue: number;
  fixedMonthlyBrlAmount?: number;
  dailyBrlAmount?: number;
  goldCommissionPercent?: number;
  timeOffGoldSplitPercent?: number;
  sickDayOffReplacementGoldGrams?: number;

  sectorId: string;
  sectorLabel?: string;

  locationId: string;
  locationLabel?: string;

  taskId: string;
  taskLabel?: string;

  statusId: string;
  statusLabel?: string;

  notes?: string;
  closedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateCollaboratorInput = {
  personId: string;
  journeyStartDate: string;
  paymentMethodId: string;
  paymentValue: number;
  fixedMonthlyBrlAmount?: number;
  dailyBrlAmount?: number;
  goldCommissionPercent?: number;
  timeOffGoldSplitPercent?: number;
  sickDayOffReplacementGoldGrams?: number;
  sectorId: string;
  locationId: string;
  taskId: string;
  statusId: string;
  notes?: string;
};

export type UpdateCollaboratorInput = {
  paymentMethodId: string;
  paymentValue: number;
  fixedMonthlyBrlAmount?: number;
  dailyBrlAmount?: number;
  goldCommissionPercent?: number;
  timeOffGoldSplitPercent?: number;
  sickDayOffReplacementGoldGrams?: number;
  sectorId: string;
  locationId: string;
  taskId: string;
  extensionDays: number;
};

export type CollaboratorListFilter = {
  search?: string;
  statusId?: string;
  locationId?: string;
  paymentMethodId?: string;
  page?: number;
  pageSize?: number;
};

export type CollaboratorListResponse = {
  items: Collaborator[];
  total: number;
};
