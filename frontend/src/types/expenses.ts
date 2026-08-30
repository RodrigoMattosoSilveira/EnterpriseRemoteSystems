export type ExpenseFinancialPosting = {
  ledgerEntryId: string;
  direction: string;
  entryType: string;
  amount: number;
  signedAmount: number;
  effectiveDate: string;
  valueUnitId: string;
  valueUnitCode?: string;
  valueUnitLabel?: string;
  sourceType: string;
  sourceId: string;
  correctionType: string;
  receiptId: string;
  receiptNumber?: string;
  receiptStatus: string;
  outstandingReceipt: boolean;
};

export type Expense = {
  id: string;
  tenantId: string;
  personId: string;
  collaboratorId: string;
  collaboratorLabel?: string;
  expenseCategoryId: string;
  expenseCategoryLabel?: string;
  valueUnitId: string;
  valueUnitLabel?: string;
  amount: number;
  expenseDate: string;
  description?: string;
  active?: boolean;
  cancelledAt?: string;
  cancelledBy?: string;
  cancellationReason?: string;
  recreatedFromExpenseId?: string;
  priceListItemId?: string;
  priceListItemCode?: string;
  itemType?: "CANTEEN" | "ADMINISTRATIVE" | string;
  itemDescription?: string;
  quantity?: number;
  unitPriceBrl?: number;
  currencyCode?: "BRL" | "GOLD_GRAM" | string;
  goldPriceId?: string;
  goldBrlPerGram?: number;
  goldPriceDate?: string;
  unitPriceAmount?: number;
  totalAmount?: number;
  calculationMethod?: string;
  calculationDetailsJson?: string;
  financialPosting?: ExpenseFinancialPosting;
  createdAt: string;
  updatedAt: string;
};

export type CreateExpenseInput = {
  collaboratorId: string;
  expenseDate: string;
  description?: string;
  recreatedFromExpenseId?: string;

  // Bite 21 canonical price-list expense fields. Expense category, value unit,
  // amount, item description, and totals are derived by the backend from these
  // fields and stored as audit snapshots on the expense record.
  priceListItemId?: string;
  currencyCode?: "BRL" | "GOLD_GRAM" | string;
  quantity?: number;

  // Legacy direct-entry fields are retained until the old New Expense form is
  // replaced. New callers should not send these together with price-list fields.
  expenseCategoryId?: string;
  valueUnitId?: string;
  amount?: number;
};

export type CreateCanteenExpenseBatchItemInput = {
  priceListItemId: string;
  currencyCode: "BRL" | "GOLD_GRAM";
  quantity: number;
};

export type CreateCanteenExpenseBatchInput = {
  collaboratorId: string;
  expenseDate: string;
  description?: string;
  items: CreateCanteenExpenseBatchItemInput[];
};

export type CreateCanteenExpenseBatchResult = {
  items: Expense[];
};

export type ExpenseListFilter = {
  collaboratorId?: string;
  collaboratorSearch?: string;
  expenseCategoryId?: string;
  valueUnitId?: string;
  itemType?: "CANTEEN" | "ADMINISTRATIVE" | string;
  priceListItemId?: string;
  currencyCode?: "BRL" | "GOLD_GRAM" | string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
};

export type ExpenseListResponse = {
  items: Expense[];
  total: number;
  page?: number;
  pageSize?: number;
};
