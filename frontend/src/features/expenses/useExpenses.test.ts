import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { invalidateExpenseFinancialQueries } from "./useExpenses";

describe("expense financial query invalidation", () => {
  it("invalidates the actual Current Account and outstanding receipt query families", async () => {
    const queryClient = new QueryClient();
    const currentAccountKey = ["current-account", "journey-a", {}] as const;
    const outstandingKey = ["outstanding-receipts", {}] as const;
    const staleWrongKey = ["currentAccounts", "journey-a"] as const;

    queryClient.setQueryData(currentAccountKey, { balance: 0 });
    queryClient.setQueryData(outstandingKey, { total: 0 });
    queryClient.setQueryData(staleWrongKey, { balance: 0 });

    await invalidateExpenseFinancialQueries(queryClient);

    expect(queryClient.getQueryState(currentAccountKey)?.isInvalidated).toBe(
      true,
    );
    expect(queryClient.getQueryState(outstandingKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(staleWrongKey)?.isInvalidated).toBe(false);
  });

  it("also invalidates cached receipt details after Expense cancellation", async () => {
    const queryClient = new QueryClient();
    const receiptKey = ["ledger-receipt", "ledger-r", "tenant"] as const;
    queryClient.setQueryData(receiptKey, { status: "PENDING_ISSUE" });

    await invalidateExpenseFinancialQueries(queryClient, true);

    expect(queryClient.getQueryState(receiptKey)?.isInvalidated).toBe(true);
  });
});
