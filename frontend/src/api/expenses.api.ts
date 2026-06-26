import { apiFetch } from "./client";
import type {
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
