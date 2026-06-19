import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
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
    expect(textNode("Reason code")).toBeTruthy();
    expect(textNode("Reason text")).toBeTruthy();
    expect(textNode("Correction reason required")).toBeTruthy();
  });

  it("submits structured correction reason metadata with sensitive settlement actions", async () => {
    const requests: Array<{ url: string; init?: RequestInit; body?: unknown }> =
      [];

    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(
      "request-20b" as ReturnType<Crypto["randomUUID"]>,
    );
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const body =
        typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
      requests.push({ url, init, body });

      if (url.includes("/payout")) {
        return new Response(
          JSON.stringify({
            data: {
              settlement: { id: "settlement-1" },
              ledgerEntries: [{ id: "ledger-1" }],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response(
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
      );
    });

    renderPanel();
    await waitForText("R$ 900,00");

    await clickButton("Partial Payout");
    await setFieldValue("BRL amount", "25.50");
    await setFieldValue("Authorized by", "admin@example.com");
    await setFieldValue("Settlement key", "local-settlement-key");
    await setFieldValue("Reason code", "PAYOUT_CORRECTION");
    await setFieldValue("Reason text", "Pay selected BRL balance.");

    await clickButton("Post Payout");
    await waitForText("Partial payout posted successfully.");

    const payoutRequest = requests.find((request) =>
      request.url.includes("/payout"),
    );
    expect(payoutRequest?.body).toMatchObject({
      requestId: "request-20b",
      brlAmount: 25.5,
      goldGramAmount: 0,
      reasonCode: "PAYOUT_CORRECTION",
      reasonText: "Pay selected BRL balance.",
    });
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
        <MemoryRouter>
          <JourneySettlementPanel
            collaboratorId="collab-1"
            projectedEndDate="2099-12-31"
          />
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  );
}

function textNode(text: string) {
  return Array.from(container.querySelectorAll("*")).find((element) =>
    element.textContent?.includes(text),
  );
}

async function clickButton(text: string) {
  const button = Array.from(container.querySelectorAll("button")).find((node) =>
    node.textContent?.includes(text),
  );
  if (!button) throw new Error(`Button not found: ${text}`);
  await act(async () => button.click());
}

async function setFieldValue(label: string, value: string) {
  const field = Array.from(container.querySelectorAll("label")).find((node) =>
    node.textContent?.includes(label),
  );
  const control = field?.querySelector("input, select, textarea") as
    | HTMLInputElement
    | HTMLSelectElement
    | HTMLTextAreaElement
    | null;
  if (!control) throw new Error(`Field not found: ${label}`);

  await act(async () => {
    setNativeValue(control, value);
    control.dispatchEvent(new Event("input", { bubbles: true }));
    control.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function setNativeValue(
  control: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement,
  value: string,
) {
  const prototype = Object.getPrototypeOf(control) as HTMLInputElement;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  descriptor?.set?.call(control, value);
}

async function waitForText(text: string) {
  const until = Date.now() + 1500;
  while (Date.now() < until) {
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
    if (textNode(text)) return;
  }
  throw new Error(`Timed out waiting for ${text}`);
}
