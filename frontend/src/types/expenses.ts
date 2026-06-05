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
  createdAt: string;
  updatedAt: string;
};

export type CreateExpenseInput = {
  collaboratorId: string;
  expenseCategoryId: string;
  valueUnitId: string;
  amount: number;
  expenseDate: string;
  description?: string;
};

export type ExpenseListFilter = {
  collaboratorId?: string;
  expenseCategoryId?: string;
  valueUnitId?: string;
  page?: number;
  pageSize?: number;
};

export type ExpenseListResponse = {
  items: Expense[];
  total: number;
};
