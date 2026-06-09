import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CurrentAndFutureEarningsModal } from "./CurrentAndFutureEarningsModal";

let root: Root | null;
let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = null;
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  document.body.removeChild(container);
  vi.restoreAllMocks();
});

describe("CurrentAndFutureEarningsModal", () => {
  it("shows current and projected earnings and closes with Escape", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response({
      collaboratorId: "c-1",
      collaboratorLabel: "Maria",
      paymentMethodCode: "GOLD_COMMISSION",
      currentBalances: { brlAmount: 450, goldGramAmount: 3.25 },
      projectedEarnings: { brlAmount: 0, goldGramAmount: 8.725 },
      projectedFinalBalances: { brlAmount: 450, goldGramAmount: 11.975 },
      projection: {
        projectionDate: "2026-06-08",
        journeyEndDate: "2026-06-15",
        periodsPerDay: 1,
        remainingWorkPeriods: 8,
        locationId: "well-1",
        locationLabel: "Well 1",
        productionMethod: "DISCRETE_LOWER_MEDIAN_LAST_10_RECORDED_DATES",
        productionDatesAvailable: 10,
        productionValueUsed: 17.45,
      },
    })));
    const onClose = vi.fn();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    await act(async () => {
      root = createRoot(container);
      root.render(
        <QueryClientProvider client={queryClient}>
          <CurrentAndFutureEarningsModal collaboratorId="c-1" onClose={onClose} />
        </QueryClientProvider>,
      );
    });

    await waitForText("Projected Journey-End Balances");
    expect(container.textContent).toContain("R$ 450,00");
    expect(container.textContent).toContain("11.97500000 g");
    expect(container.textContent).toContain("Well 1");

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

function response(data: unknown) {
  return Promise.resolve(new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  }));
}

async function waitForText(text: string) {
  for (let i = 0; i < 40; i += 1) {
    if (container.textContent?.includes(text)) return;
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
  }
  throw new Error(`Missing text: ${text}`);
}
