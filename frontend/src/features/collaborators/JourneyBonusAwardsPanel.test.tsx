import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n";
import { JourneyBonusAwardsPanel } from "./JourneyBonusAwardsPanel";

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

describe("JourneyBonusAwardsPanel", () => {
  it("requests multiple-unit bonus awards and requires a different Tenant Administrator to approve", async () => {
    const pending = {
      id: "award-1",
      collaboratorJourneyId: "collab-1",
      receiptNumber: "JBA-AWARD1",
      valueUnitCode: "GOLD_GRAM",
      amount: 1.25,
      effectiveDate: "2026-09-29",
      description: "Safety milestone",
      status: "PENDING_APPROVAL",
      requestedByActorId: "tenant-admin-a",
      requestedByUserId: "admin-a@example.test",
      requestedAt: "2026-09-29T12:00:00Z",
    };
    let awards = [pending];
    let createdPayload: Record<string, unknown> | undefined;
    let approved = false;

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/api/v1/collaborators/collab-1/bonus-awards") && (!init?.method || init.method === "GET")) {
        return jsonResponse({ data: awards });
      }
      if (url.endsWith("/api/v1/collaborators/collab-1/bonus-awards") && init?.method === "POST") {
        createdPayload = JSON.parse(String(init.body));
        const created = { ...pending, id: "award-2", receiptNumber: "JBA-AWARD2", valueUnitCode: "BRL", amount: 500, description: "Retention" };
        awards = [created, ...awards];
        return jsonResponse({ data: created }, 201);
      }
      if (url.endsWith("/api/v1/collaborators/collab-1/bonus-awards/award-1/approve") && init?.method === "POST") {
        approved = true;
        awards = [{ ...pending, status: "POSTED", approvedByActorId: "tenant-admin-b", approvedByUserId: "admin-b@example.test", approvedAt: "2026-09-29T13:00:00Z", ledgerEntryId: "ledger-bonus-award-1" }];
        return jsonResponse({ data: awards[0] });
      }
      throw new Error(`Unhandled request: ${url}`);
    });

    renderPanel("tenant-admin-a");
    await waitForText("Safety milestone");
    expect(buttonByText("Approve Bonus")).toBeFalsy();
    expect(textNode("A different Tenant Administrator must approve this bonus.")).toBeTruthy();

    changeSelect("Value unit", "BRL");
    changeInput("Bonus amount", "500");
    changeInput("Bonus description", "Retention");
    await act(async () => buttonByText("Request Bonus Award")?.click());
    expect(createdPayload).toMatchObject({ valueUnitCode: "BRL", amount: 500, description: "Retention" });

    await act(async () => root?.unmount());
    root = null;
    renderPanel("tenant-admin-b");
    await waitForText("Safety milestone");
    await act(async () => buttonWithinText("Safety milestone", "Approve Bonus")?.click());
    expect(approved).toBe(true);
    await waitForText("Posted");
  });
});

function renderPanel(actorId: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  root = createRoot(container);
  act(() => root?.render(<I18nProvider><QueryClientProvider client={client}><JourneyBonusAwardsPanel collaboratorId="collab-1" actorId={actorId} canManage /></QueryClientProvider></I18nProvider>));
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
function textNode(text: string) { return Array.from(container.querySelectorAll("*")).find((n) => n.textContent?.trim() === text) ?? null; }
function buttonByText(text: string) { return Array.from(container.querySelectorAll("button")).find((n) => n.textContent?.trim() === text) ?? null; }
function buttonWithinText(text: string, buttonText: string) {
  const node = textNode(text);
  const article = node?.closest("article");
  return article ? Array.from(article.querySelectorAll("button")).find((n) => n.textContent?.trim() === buttonText) ?? null : null;
}
async function waitForText(text: string) {
  for (let i = 0; i < 50; i += 1) { if (textNode(text)) return; await act(async () => { await new Promise((r) => setTimeout(r, 10)); }); }
  throw new Error(`Timed out waiting for ${text}`);
}
function changeInput(label: string, value: string) {
  const el = Array.from(container.querySelectorAll("label")).find((n) => n.textContent?.includes(label))?.querySelector("input");
  if (!el) throw new Error(`Input not found: ${label}`);
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  act(() => {
    valueSetter?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
function changeSelect(label: string, value: string) {
  const el = Array.from(container.querySelectorAll("label")).find((n) => n.textContent?.includes(label))?.querySelector("select");
  if (!el) throw new Error(`Select not found: ${label}`);
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  act(() => {
    valueSetter?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
