export type Collaborator = {
  id: string;
  tenantId: string;

  personId: string;
  personName?: string;

  journeyStartDate: string;
  defaultEndDate: string;
  extensionDays: number;
  projectedEndDate: string;

  paymentMethodId: string;
  paymentMethodLabel?: string;
  paymentValue: number;

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
  sectorId: string;
  locationId: string;
  taskId: string;
  statusId: string;
  notes?: string;
};

export type CollaboratorListFilter = {
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
