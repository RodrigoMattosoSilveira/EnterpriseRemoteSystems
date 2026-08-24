export type PrintableReceipt = {
  id: string;
  receiptNumber: string;
  receiptType: string;
  receiptPurpose: string;
  paymentDirection: string;
  acceptingParty: string;
  status: string;
  issuedAt?: string;
  issuedBy?: string;
  printedAt?: string;
  signedAt?: string;
  returnedAt?: string;
  receivedBy?: string;
  signedDocumentRef?: string;
  acceptedAt?: string;
  acceptedBy?: string;
  acceptanceMethod?: string;
  notes?: string;
  ledgerEntryId: string;
  entryType: string;
  effectiveDate: string;
  valueUnitCode: string;
  valueUnitLabel: string;
  amount: number;
  description?: string;
  collaboratorId: string;
  collaboratorLabel: string;
  collaboratorLegalName: string;
  collaboratorCpf: string;
  createdAt: string;
};

export type AcceptReceiptRequest = {
  confirm: boolean;
  notes: string;
};

export type ReturnReceiptRequest = {
  signedDocumentRef: string;
  notes: string;
};

export type OutstandingReceipt = PrintableReceipt & {
  sourceType: string;
  sourceId: string;
};

export type ReceiptStatusSummary = {
  pendingIssue: number;
  issued: number;
  printed: number;
  signed: number;
  total: number;
};

export type OutstandingReceiptListResult = {
  items: OutstandingReceipt[];
  total: number;
  page: number;
  pageSize: number;
  summary: ReceiptStatusSummary;
};

export type OutstandingReceiptListFilter = {
  status?: string;
  collaborator?: string;
  sourceType?: string;
  page?: number;
  pageSize?: number;
};
