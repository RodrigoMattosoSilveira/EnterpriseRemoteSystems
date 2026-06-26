export type Expense = {
  id: string;
  tenantId: string;
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
  createdAt: string;
  updatedAt: string;
};

export type CreateExpenseInput = {
  collaboratorId: string;
  expenseDate: string;
  description?: string;

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

export type ExpenseListFilter = {
  collaboratorId?: string;
  expenseCategoryId?: string;
  valueUnitId?: string;
  itemType?: "CANTEEN" | "ADMINISTRATIVE" | string;
  priceListItemId?: string;
  currencyCode?: "BRL" | "GOLD_GRAM" | string;
  page?: number;
  pageSize?: number;
};

export type ExpenseListResponse = {
  items: Expense[];
  total: number;
};
