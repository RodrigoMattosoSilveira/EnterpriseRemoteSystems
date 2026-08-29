import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  cancelExpense,
  createCanteenExpenseBatch,
  createExpense,
  getExpense,
  listExpenses,
} from "../../api/expenses.api";
import type {
  CreateCanteenExpenseBatchInput,
  CreateExpenseInput,
  ExpenseListFilter,
} from "../../types/expenses";

export const expenseQueryKeys = {
  all: ["expenses"] as const,
  lists: () => [...expenseQueryKeys.all, "list"] as const,
  list: (filter: ExpenseListFilter = {}) =>
    [...expenseQueryKeys.lists(), filter] as const,
  details: () => [...expenseQueryKeys.all, "detail"] as const,
  detail: (id: string) => [...expenseQueryKeys.details(), id] as const,
};

export function useExpenses(filter: ExpenseListFilter = {}) {
  return useQuery({
    queryKey: expenseQueryKeys.list(filter),
    queryFn: () => listExpenses(filter),
  });
}

export function useExpense(id: string) {
  return useQuery({
    queryKey: expenseQueryKeys.detail(id),
    queryFn: () => getExpense(id),
    enabled: Boolean(id),
  });
}

export function useCancelExpense() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      cancelExpense(id, reason),
    onSuccess: (expense) => {
      queryClient.invalidateQueries({ queryKey: expenseQueryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ["currentAccounts"] });
      queryClient.setQueryData(expenseQueryKeys.detail(expense.id), expense);
    },
  });
}

export function useCreateCanteenExpenseBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateCanteenExpenseBatchInput) =>
      createCanteenExpenseBatch(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: expenseQueryKeys.lists() });
      queryClient.invalidateQueries({ queryKey: ["currentAccounts"] });
    },
  });
}

export function useCreateExpense() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateExpenseInput) => createExpense(input),
    onSuccess: (expense) => {
      queryClient.invalidateQueries({ queryKey: expenseQueryKeys.lists() });
      queryClient.setQueryData(expenseQueryKeys.detail(expense.id), expense);
    },
  });
}
