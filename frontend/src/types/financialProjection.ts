export type ProjectionAmounts = {
  brlAmount: number | null;
  goldGramAmount: number | null;
};

export type FinancialProjectionBasis = {
  projectionDate: string;
  journeyEndDate: string;
  periodsPerDay: number;
  remainingWorkPeriods: number;
  locationId?: string;
  locationLabel?: string;
  productionMethod?: string;
  productionDatesAvailable: number;
  productionValueUsed?: number;
  warning?: string;
};

export type FinancialProjection = {
  collaboratorId: string;
  collaboratorLabel?: string;
  paymentMethodCode: string;
  currentBalances: ProjectionAmounts;
  projectedEarnings: ProjectionAmounts;
  projectedFinalBalances: ProjectionAmounts;
  projection: FinancialProjectionBasis;
};
