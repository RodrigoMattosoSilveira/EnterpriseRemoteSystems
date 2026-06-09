import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JourneySettlementPanel } from "./JourneySettlementPanel";

let container: HTMLDivElement;
let root: Root | null;

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

describe("JourneySettlementPanel", () => {
  it("shows balances and opens the partial payout dialog", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            collaboratorId: "collab-1",
            brlBalance: 900,
            goldGramBalance: 2.5,
            pendingAccrualItems: 0,
            canClose: true,
            blockingReasons: [],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    renderPanel();
    await waitForText("R$ 900,00");
    expect(textNode("2.50000000 g")).toBeTruthy();

    const button = Array.from(container.querySelectorAll("button")).find(
      (node) => node.textContent?.includes("Partial Payout"),
    );
    await act(async () => button?.click());
    expect(container.querySelector('[role="dialog"]')).toBeTruthy();
    expect(textNode("Settlement key")).toBeTruthy();
  });
});

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  root = createRoot(container);
  act(() =>
    root?.render(
      <QueryClientProvider client={client}>
        <JourneySettlementPanel collaboratorId="collab-1" />
      </QueryClientProvider>,
    ),
  );
}

function textNode(text: string) {
  return Array.from(container.querySelectorAll("*")).find((element) =>
    element.textContent?.includes(text),
  );
}
async function waitForText(text: string) {
  const until = Date.now() + 1500;
  while (Date.now() < until) {
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
    if (textNode(text)) return;
  }
  throw new Error(`Timed out waiting for ${text}`);
}
