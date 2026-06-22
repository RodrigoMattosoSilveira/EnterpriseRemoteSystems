import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrintableReceipt } from "../../types/receipts";
import { PrintableReceiptPage } from "./PrintableReceiptPage";

let container: HTMLDivElement;
let root: Root | null;
let fetchCalls: FetchCall[];
let receipt: PrintableReceipt;

type FetchCall = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: unknown;
};

beforeEach(() => {
  window.localStorage.clear();
  window.localStorage.setItem(
    "ers.authzAdmin.requestActor",
    JSON.stringify({ actorId: "bootstrap-admin", tenantId: "default" }),
  );
  container = document.createElement("div");
  document.body.appendChild(container);
  root = null;
  fetchCalls = [];
  receipt = receiptFixture();
  vi.stubGlobal("print", vi.fn());
});

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
  }
  document.body.removeChild(container);
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("PrintableReceiptPage", () => {
  it("shows lifecycle status and requires a signed document reference before return", async () => {
    mockReceiptFetch();
    renderPage();

    await waitForText("Receipt lifecycle");
    await waitForText("Pending issue");
    await waitForText("Signed document reference");
    expect(fieldControl("Received by")).toBeFalsy();

    const blockedButton = buttonByText("Enter signed document reference first");
    expect(blockedButton?.disabled).toBe(true);

    await setFieldValue("Signed document reference", "receipt-scan-20e.pdf");
    await setFieldValue("Notes", "Returned with required document reference.");
    await waitForText("Record signed return");

    const submitButton = buttonByText("Record signed return");
    expect(submitButton?.disabled).toBe(false);
    await clickButton("Record signed return");

    await waitForText("Returned");
    await waitForText("Terminal status: no further lifecycle mutations are allowed.");

    const returnCall = fetchCalls.find((call) => call.url.endsWith("/receipt/return"));
    expect(returnCall?.method).toBe("POST");
    expect(returnCall?.body).toEqual({
      signedDocumentRef: "receipt-scan-20e.pdf",
      notes: "Returned with required document reference.",
    });
    expect(returnCall?.body).not.toHaveProperty("receivedBy");
  });

  it("locks receipt lifecycle actions for returned receipts", async () => {
    receipt = receiptFixture({
      status: "RETURNED",
      issuedAt: "2026-06-22T12:00:00Z",
      printedAt: "2026-06-22T12:01:00Z",
      signedAt: "2026-06-22T12:02:00Z",
      returnedAt: "2026-06-22T12:03:00Z",
      receivedBy: "bootstrap-admin",
      signedDocumentRef: "returned-receipt.pdf",
    });
    mockReceiptFetch();

    renderPage();

    await waitForText("Terminal status: no further lifecycle mutations are allowed.");
    await waitForText("Return details are locked.");

    const terminalButtons = buttonsByText("Receipt returned");
    expect(terminalButtons.length).toBeGreaterThan(0);
    expect(terminalButtons.every((button) => button.disabled)).toBe(true);
    expect((fieldControl("Signed document reference") as HTMLInputElement | null)?.disabled).toBe(true);
  });
});

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(
    [{ path: "/ledger-entries/:entryId/receipt", element: <PrintableReceiptPage /> }],
    { initialEntries: ["/ledger-entries/ledger-entry-20e/receipt"] },
  );

  act(() => {
    root = createRoot(container);
    root.render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
  });
}

function mockReceiptFetch() {
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    fetchCalls.push({
      url,
      method: init?.method?.toUpperCase() ?? "GET",
      headers: normalizeHeaders(init?.headers),
      body: parseBody(init?.body),
    });

    if (url === "/api/v1/ledger-entries/ledger-entry-20e/receipt" && (!init?.method || init.method === "GET")) {
      return Promise.resolve(jsonResponse({ data: receipt }));
    }

    if (url === "/api/v1/ledger-entries/ledger-entry-20e/receipt/return" && init?.method === "POST") {
      const body = parseBody(init.body) as { signedDocumentRef: string; notes: string };
      receipt = {
        ...receipt,
        status: "RETURNED",
        signedAt: "2026-06-22T12:02:00Z",
        returnedAt: "2026-06-22T12:03:00Z",
        receivedBy: "bootstrap-admin",
        signedDocumentRef: body.signedDocumentRef,
        notes: body.notes,
      };
      return Promise.resolve(jsonResponse({ data: receipt }));
    }

    throw new Error(`Unhandled request: ${url}`);
  }));
}

function receiptFixture(overrides: Partial<PrintableReceipt> = {}): PrintableReceipt {
  return {
    id: "receipt-20e",
    receiptNumber: "RCP-20E",
    receiptType: "LEDGER_DEBIT",
    status: "PENDING_ISSUE",
    ledgerEntryId: "ledger-entry-20e",
    entryType: "DEBIT",
    effectiveDate: "2026-06-22",
    valueUnitCode: "BRL",
    valueUnitLabel: "Brazilian Real",
    amount: 12.34,
    description: "Receipt lifecycle test debit",
    collaboratorId: "collab-20e",
    collaboratorLabel: "Receipt 20E",
    collaboratorLegalName: "Receipt Lifecycle",
    collaboratorCpf: "12345678901",
    createdAt: "2026-06-22T12:00:00Z",
    ...overrides,
  };
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function normalizeHeaders(headers: HeadersInit | undefined) {
  if (!headers) return {};
  if (headers instanceof Headers) return Object.fromEntries(headers.entries());
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  return headers as Record<string, string>;
}

function parseBody(body: BodyInit | null | undefined) {
  if (typeof body !== "string" || !body) return undefined;
  return JSON.parse(body);
}

async function waitForText(text: string) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (textNode(text)) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  throw new Error(`Text not found: ${text}`);
}

function textNode(text: string) {
  return Array.from(container.querySelectorAll("body *")).find((node) =>
    Array.from(node.childNodes).some(
      (child) => child.nodeType === Node.TEXT_NODE && child.textContent?.includes(text),
    ),
  );
}

function fieldControl(labelText: string): HTMLInputElement | HTMLTextAreaElement | null {
  const label = Array.from(container.querySelectorAll("label")).find((candidate) =>
    candidate.textContent?.includes(labelText),
  );
  return label?.querySelector("input, textarea") ?? null;
}

async function setFieldValue(labelText: string, value: string) {
  const field = fieldControl(labelText);
  if (!field) throw new Error(`Field not found: ${labelText}`);
  await act(async () => {
    setNativeFieldValue(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function setNativeFieldValue(field: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = field instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const valueSetter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (valueSetter) {
    valueSetter.call(field, value);
    return;
  }
  field.value = value;
}

function buttonByText(text: string): HTMLButtonElement | undefined {
  return buttonsByText(text)[0];
}

function buttonsByText(text: string): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll("button")).filter((button) =>
    button.textContent?.includes(text),
  );
}

async function clickButton(text: string) {
  const button = buttonByText(text);
  if (!button) throw new Error(`Button not found: ${text}`);
  await act(async () => {
    button.click();
  });
}
