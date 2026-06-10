export type PrintableReceipt = {
  id: string;
  receiptNumber: string;
  receiptType: string;
  status: string;
  issuedAt?: string;
  issuedBy?: string;
  printedAt?: string;
  signedAt?: string;
  returnedAt?: string;
  receivedBy?: string;
  signedDocumentRef?: string;
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

export type ReturnReceiptRequest = {
  signedDocumentRef: string;
  notes: string;
};
