import type { Collaborator } from "./collaborators";

export type WorkCreditWorkEvidence = {
  assignmentId: string;
  workPeriodId: string;
  workDate: string;
  periodCode: string;
  workPeriodName?: string;
  workPeriodStatus: string;
  plannedStatus: string;
  actualStatus?: string;
  sectorId: string;
  sectorLabel?: string;
  locationId: string;
  locationLabel?: string;
  taskId: string;
  taskLabel?: string;
  productionEntries: number;
  goldGramsProduced: number;
};

export type WorkCreditAccrualEvidence = {
  id: string;
  accrualRunId: string;
  accrualRunStatus: string;
  accrualDate: string;
  workPeriodId: string;
  workDate: string;
  workPeriodAssignmentId?: string;
  calculationType: string;
  direction: string;
  brlAmount?: number;
  goldGramAmount?: number;
  status: string;
  pendingReason?: string;
  description?: string;
};

export type WorkCreditReceiptEvidence = {
  id: string;
  receiptNumber?: string;
  receiptPurpose?: string;
  paymentDirection?: string;
  acceptingParty?: string;
  status: string;
  outstanding: boolean;
  returnedAt?: string;
  acceptedAt?: string;
};

export type WorkCreditAccountPosting = {
  id: string;
  entryType: string;
  direction: string;
  amount: number;
  signedAmount: number;
  valueUnitCode?: string;
  valueUnitLabel?: string;
  effectiveDate: string;
  sourceType: string;
  sourceId: string;
  description?: string;
  active: boolean;
  correctionType: string;
  relatedEntryId?: string;
  correctionReasonCode?: string;
  correctionReasonText?: string;
  receipt?: WorkCreditReceiptEvidence;
};

export type WorkCreditEvidence = {
  journey: Collaborator;
  workRecognized: WorkCreditWorkEvidence[];
  earningsCalculated: WorkCreditAccrualEvidence[];
  accountPostings: WorkCreditAccountPosting[];
};
