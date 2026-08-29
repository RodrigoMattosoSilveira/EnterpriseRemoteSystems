import { apiFetch } from "./client";
import type {
  CreateCanteenExpenseBatchInput,
  CreateCanteenExpenseBatchResult,
  CreateExpenseInput,
  Expense,
  ExpenseListFilter,
  ExpenseListResponse,
} from "../types/expenses";

export async function listExpenses(
  filter: ExpenseListFilter = {},
): Promise<ExpenseListResponse> {
  const searchParams = new URLSearchParams();

  if (filter.collaboratorId) {
    searchParams.set("collaboratorId", filter.collaboratorId);
  }
  if (filter.collaboratorSearch) {
    searchParams.set("collaboratorSearch", filter.collaboratorSearch);
  }
  if (filter.expenseCategoryId) {
    searchParams.set("expenseCategoryId", filter.expenseCategoryId);
  }
  if (filter.valueUnitId) {
    searchParams.set("valueUnitId", filter.valueUnitId);
  }
  if (filter.itemType) {
    searchParams.set("itemType", filter.itemType);
  }
  if (filter.priceListItemId) {
    searchParams.set("priceListItemId", filter.priceListItemId);
  }
  if (filter.currencyCode) {
    searchParams.set("currencyCode", filter.currencyCode);
  }
  if (filter.dateFrom) {
    searchParams.set("dateFrom", filter.dateFrom);
  }
  if (filter.dateTo) {
    searchParams.set("dateTo", filter.dateTo);
  }
  if (filter.page !== undefined) {
    searchParams.set("page", String(filter.page));
  }
  if (filter.pageSize !== undefined) {
    searchParams.set("pageSize", String(filter.pageSize));
  }

  const query = searchParams.toString();
  const response = await apiFetch<ExpenseListResponse | Expense[]>(
    `/expenses${query ? `?${query}` : ""}`,
  );

  if (Array.isArray(response)) {
    return { items: response, total: response.length };
  }

  return {
    items: response.items ?? [],
    total: response.total ?? 0,
    page: response.page,
    pageSize: response.pageSize,
  };
}

export function getExpense(id: string): Promise<Expense> {
  return apiFetch<Expense>(`/expenses/${encodeURIComponent(id)}`);
}

export function createExpense(input: CreateExpenseInput): Promise<Expense> {
  return apiFetch<Expense>("/expenses", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function createCanteenExpenseBatch(
  input: CreateCanteenExpenseBatchInput,
): Promise<CreateCanteenExpenseBatchResult> {
  return apiFetch<CreateCanteenExpenseBatchResult>("/expenses/canteen-batch", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function cancelExpense(id: string, reason: string): Promise<Expense> {
  return apiFetch<Expense>(`/expenses/${encodeURIComponent(id)}/cancel`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}
