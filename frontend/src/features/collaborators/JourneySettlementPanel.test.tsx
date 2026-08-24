import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthzActor } from "../../types/authz";
import type { SettlementPreview } from "../../types/settlements";
import { JourneySettlementPanel } from "./JourneySettlementPanel";

let container: HTMLDivElement;
let root: Root | null;

beforeEach(() => {
  window.localStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = null;
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  document.body.removeChild(container);
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("JourneySettlementPanel", () => {
  it("shows balances and opens the inline partial payout form", async () => {
    mockSettlementFetch();

    renderPanel();
    await waitForText("R$ 900,00");
    expect(textNode("2.50 g")).toBeTruthy();

    await clickButton("Partial Payout");
    expect(container.querySelector('[role="region"]')).toBeTruthy();
    expect(textNode("Journey Settlement")).toBeTruthy();
    expect(textNode("Gold balance")).toBeTruthy();
    expect(textNode("2.50 g")).toBeTruthy();
    expect(textNode("Settlement key")).toBeFalsy();
    expect(textNode("Authorized by")).toBeFalsy();
    expect(textNode("Authorization actor")).toBeTruthy();
    expect(textNode("Reason code")).toBeTruthy();
    expect(textNode("Reason text")).toBeTruthy();
    expect(textNode("Settlement reason required")).toBeTruthy();
    expect(textNode("Recent reauthentication required")).toBeTruthy();
    expect(textNode("Second-person approval optional")).toBeTruthy();
    expect(textNode("Confirm reauthentication first")).toBeTruthy();
  });

  it("disables Close Journey while any Journey balance is non-zero", async () => {
    mockSettlementFetch();

    renderPanel();
    await waitForText("non-zero balance");

    const closeButton = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent?.includes("Close Journey"));
    expect(closeButton).toBeTruthy();
    expect(closeButton?.disabled).toBe(true);
    expect(container.textContent).toContain(
      "close only after every value-unit balance is zero",
    );
  });

  it("formats partial payout gold grams with two decimals", async () => {
    mockSettlementFetch({ preview: { goldGramBalance: 2.55555555 } });

    renderPanel();
    await waitForText("2.56 g");
    await clickButton("Partial Payout");

    const goldInput = fieldControl("Gold grams") as HTMLInputElement;
    expect(goldInput.step).toBe("0.01");

    await setFieldValue("Gold grams", "1.23456789");
    await blurField("Gold grams");

    expect(goldInput.value).toBe("1.23");
  });

  it("shows payout reasons instead of correction reasons for partial payouts", async () => {
    mockSettlementFetch();

    renderPanel();
    await waitForText("R$ 900,00");
    await clickButton("Partial Payout");

    const reasonOptions = Array.from(
      container.querySelectorAll('label select option'),
    ).map((option) => option.textContent ?? "");

    expect(reasonOptions).toContain("Collaborator requested payout");
    expect(reasonOptions).toContain("Scheduled payout");
    expect(reasonOptions).not.toContain("Payout correction");
    expect(reasonOptions).not.toContain("Manual correction");
  });

  it("submits structured reason metadata with sensitive settlement actions", async () => {
    const requests: Array<{ url: string; init?: RequestInit; body?: unknown }> =
      [];

    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(
      "request-20b" as ReturnType<Crypto["randomUUID"]>,
    );
    mockSettlementFetch({ onRequest: (request) => requests.push(request) });

    renderPanel();
    await waitForText("R$ 900,00");

    await clickButton("Partial Payout");
    await setFieldValue("BRL amount", "25.50");
    await setFieldValue("Reason code", "COLLABORATOR_REQUESTED_PAYOUT");
    await setFieldValue("Reason text", "Pay selected BRL balance.");
    await clickButton("Confirm reauthentication");

    await clickButton("Post Payout");
    await waitForText("Partial payout posted successfully.");

    const payoutRequest = requests.find((request) =>
      request.url.includes("/payout"),
    );
    expect(payoutRequest?.body).toMatchObject({
      requestId: "request-20b",
      brlAmount: 25.5,
      goldGramAmount: 0,
      reasonCode: "COLLABORATOR_REQUESTED_PAYOUT",
      reasonText: "Pay selected BRL balance.",
    });
    expect(payoutRequest?.body).not.toHaveProperty("settlementKey");
    expect(payoutRequest?.body).not.toHaveProperty("authorizedBy");
    expect(payoutRequest?.body).not.toHaveProperty("secondApproval");
    expect(payoutRequest?.init?.headers).toMatchObject({
      "X-Reauthentication-Method": "password",
    });
    expect(
      (payoutRequest?.init?.headers as Record<string, string>)?.[
        "X-Reauthenticated-At"
      ],
    ).toBeTruthy();
  });

  it("requires and submits a different second approver when the tenant policy requires it", async () => {
    const requests: Array<{ url: string; init?: RequestInit; body?: unknown }> =
      [];

    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(
      "request-20d" as ReturnType<Crypto["randomUUID"]>,
    );
    mockSettlementFetch({
      policyRequired: true,
      onRequest: (request) => requests.push(request),
    });

    renderPanel();
    await waitForText("R$ 900,00");
    await clickButton("Partial Payout");
    await waitForText("Second-person approval required");

    const approverOptions = Array.from(
      (fieldControl("Second approver") as HTMLSelectElement).options,
    ).map((option) => option.value);
    expect(approverOptions).toContain("tenant-approver@example.com");
    expect(approverOptions).not.toContain("tenant-admin@example.com");
    expect(
      requests.some((request) => request.url.includes("/authz/tenant-actors")),
    ).toBe(true);
    expect(
      requests.some((request) => request.url.endsWith("/authz/actors")),
    ).toBe(false);

    await setFieldValue("BRL amount", "25.50");
    await setFieldValue("Reason code", "COLLABORATOR_REQUESTED_PAYOUT");
    await setFieldValue("Reason text", "Pay selected BRL balance.");
    await setFieldValue("Second approver", "tenant-approver@example.com");
    await setFieldValue("Second approval notes", "Reviewed balance and approved.");
    await clickButton("Confirm reauthentication");

    await clickButton("Post Payout");
    await waitForText("Partial payout posted successfully.");

    const payoutRequest = requests.find((request) =>
      request.url.includes("/payout"),
    );
    expect(payoutRequest?.body).toMatchObject({
      requestId: "request-20d",
      secondApproval: {
        approvedBy: "tenant-approver@example.com",
        notes: "Reviewed balance and approved.",
      },
    });
  });

  it("presents the final settlement workflow according to balance direction", async () => {
    mockSettlementFetch({ preview: { brlBalance: -80, goldGramBalance: -1.25 } });

    renderPanel();
    await waitForText("Collaborator owes Tenant");
    expect(textNode("Extend Journey")).toBeTruthy();
    expect(textNode("Record Collaborator Payment")).toBeTruthy();
    expect(textNode("Settle Tenant Owed Balance")).toBeFalsy();
  });

  it("presents both settlement directions when BRL and Gold have opposite signs", async () => {
    mockSettlementFetch({ preview: { brlBalance: 100, goldGramBalance: -1.25 } });

    renderPanel();
    await waitForText("Tenant owes Collaborator");
    expect(textNode("Collaborator owes Tenant")).toBeTruthy();
    expect(textNode("Settle Tenant Owed Balance")).toBeTruthy();
    expect(textNode("Extend Journey")).toBeTruthy();
    expect(textNode("Record Collaborator Payment")).toBeTruthy();
  });

  it("shows receipt acceptance as the remaining blocker after balances reach zero", async () => {
    mockSettlementFetch({
      preview: {
        brlBalance: 0,
        goldGramBalance: 0,
        outstandingReceipts: 2,
        canClose: false,
        blockingReasons: ["OUTSTANDING_RECEIPTS"],
      },
    });

    renderPanel();
    await waitForText("Balances settled — receipt acceptance pending");
    expect(container.textContent).toContain("2 final-settlement receipts remain outstanding");
    const closeButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
      (button) => button.textContent?.includes("Close Journey"),
    );
    expect(closeButton?.disabled).toBe(true);
  });

  it("extends a Journey by additional days without invoking settlement reauthentication", async () => {
    const requests: Array<{ url: string; init?: RequestInit; body?: unknown }> = [];
    mockSettlementFetch({
      preview: { brlBalance: -80, goldGramBalance: 0 },
      onRequest: (request) => requests.push(request),
    });

    renderPanel();
    await waitForText("Collaborator owes Tenant");
    await clickButton("Extend Journey");
    await waitForText("Extending the Journey does not post a Ledger Entry");
    await setFieldValue("Additional days", "14");
    await clickSubmitButton("Confirm Extension");
    await waitForText("Journey extended by 14 days");

    const request = requests.find((candidate) => candidate.url.includes("/collaborators/collab-1/extend"));
    expect(request?.body).toEqual({ additionalDays: 14 });
    const headers = new Headers(request?.init?.headers);
    expect(headers.get("X-Reauthentication-Method")).toBeNull();
  });

  it("posts the full positive Journey balance as a final Tenant payment without caller amounts", async () => {
    const requests: Array<{ url: string; init?: RequestInit; body?: unknown }> = [];
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(
      "request-final-tenant" as ReturnType<Crypto["randomUUID"]>,
    );
    mockSettlementFetch({ onRequest: (request) => requests.push(request) });

    renderPanel();
    await waitForText("R$ 900,00");
    await clickButton("Settle Tenant Owed Balance");
    await setFieldValue("Reason code", "FINAL_TENANT_PAYMENT");
    await setFieldValue("Reason text", "Pay all positive final Journey balances.");
    await clickButton("Confirm reauthentication");
    await clickSubmitButton("Post Final Tenant Payment");
    await waitForText("Collaborator receipt acceptance is required");

    const request = requests.find((candidate) => candidate.url.includes("/final-settlement/tenant-payment"));
    expect(request?.body).toMatchObject({
      requestId: "request-final-tenant",
      reasonCode: "FINAL_TENANT_PAYMENT",
      reasonText: "Pay all positive final Journey balances.",
    });
    expect(request?.body).not.toHaveProperty("brlAmount");
    expect(request?.body).not.toHaveProperty("goldGramAmount");
  });

  it("records the full negative Journey balance as a final Collaborator payment without caller amounts", async () => {
    const requests: Array<{ url: string; init?: RequestInit; body?: unknown }> = [];
    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(
      "request-final-collaborator" as ReturnType<Crypto["randomUUID"]>,
    );
    mockSettlementFetch({
      preview: { brlBalance: -80, goldGramBalance: -1.25 },
      onRequest: (request) => requests.push(request),
    });

    renderPanel();
    await waitForText("-R$ 80,00");
    await clickButton("Record Collaborator Payment");
    await setFieldValue("Reason code", "FINAL_COLLABORATOR_PAYMENT");
    await setFieldValue("Reason text", "Record repayment of all negative final Journey balances.");
    await clickButton("Confirm reauthentication");
    await clickSubmitButton("Record Final Collaborator Payment");
    await waitForText("Tenant receipt acceptance is required");

    const request = requests.find((candidate) => candidate.url.includes("/final-settlement/collaborator-payment"));
    expect(request?.body).toMatchObject({
      requestId: "request-final-collaborator",
      reasonCode: "FINAL_COLLABORATOR_PAYMENT",
      reasonText: "Record repayment of all negative final Journey balances.",
    });
    expect(request?.body).not.toHaveProperty("brlAmount");
    expect(request?.body).not.toHaveProperty("goldGramAmount");
  });

  it("notifies the detail page immediately after a Journey closes", async () => {
    const onJourneyClosed = vi.fn();

    vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(
      "request-close-success" as ReturnType<Crypto["randomUUID"]>,
    );
    mockSettlementFetch({
      preview: {
        brlBalance: 0,
        goldGramBalance: 0,
        canClose: true,
        blockingReasons: [],
      },
    });

    renderPanel({ onJourneyClosed });
    await waitForText("R$ 0,00");

    await clickButton("Close Journey");
    await setFieldValue("Reason code", "END_OF_JOURNEY_SETTLEMENT");
    await setFieldValue(
      "Reason text",
      "Close the Journey after final settlement verification.",
    );
    await clickButton("Confirm reauthentication");
    await clickSubmitButton("Close Journey");

    await waitFor(() =>
      onJourneyClosed.mock.calls.some(
        ([message]) => message === "Journey closed successfully.",
      ),
    );
  });

  it("does not expose backend settlement secrets to operators", async () => {
    mockSettlementFetch();

    renderPanel();
    await waitForText("R$ 900,00");
    await clickButton("Partial Payout");

    expect(textNode("Settlement key")).toBeFalsy();
    expect(textNode("Authorized by")).toBeFalsy();
    expect(textNode("Backend settlement keys are not entered")).toBeTruthy();
  });
});

type MockSettlementFetchOptions = {
  preview?: Partial<SettlementPreview>;
  policyRequired?: boolean;
  actors?: AuthzActor[];
  onRequest?: (request: { url: string; init?: RequestInit; body?: unknown }) => void;
};

function mockSettlementFetch(options: MockSettlementFetchOptions = {}) {
  const preview = {
    collaboratorId: "collab-1",
    brlBalance: 900,
    goldGramBalance: 2.5,
    pendingAccrualItems: 0,
    outstandingReceipts: 0,
    canClose: false,
    blockingReasons: ["NON_ZERO_BALANCE"],
    ...options.preview,
  } satisfies SettlementPreview;
  const actors = options.actors ?? [
    {
      id: "actor-primary",
      actorKey: "tenant-admin@example.com",
      displayName: "Tenant Administrator",
      active: true,
      roleGrants: [],
    },
    {
      id: "actor-second",
      actorKey: "tenant-approver@example.com",
      displayName: "Tenant Approver",
      active: true,
      roleGrants: [],
    },
    {
      id: "actor-inactive",
      actorKey: "inactive-approver@example.com",
      displayName: "Inactive Approver",
      active: false,
      roleGrants: [],
    },
  ];

  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    const body =
      typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    options.onRequest?.({ url, init, body });

    if (url.includes("/current-accounts/settings/second-person-approval")) {
      return jsonResponse({
        tenantId: "default",
        required: Boolean(options.policyRequired),
      });
    }

    if (url.includes("/authz/current-actor")) {
      return jsonResponse({
        actorKey: "tenant-admin@example.com",
        actorRecordId: "actor-primary",
        tenantId: "default",
        scope: "TENANT",
        roleCodes: ["TENANT_ADMIN"],
        permissions: ["*"],
      });
    }

    if (url.includes("/authz/tenant-actors")) {
      return jsonResponse(actors);
    }

    if (url.includes("/close")) {
      return jsonResponse({
        settlement: { id: "settlement-close" },
        ledgerEntries: [],
        journeyStatus: "CLOSED",
        closedAt: "2026-08-21T12:00:00Z",
      });
    }

    if (url.includes("/collaborators/collab-1/extend")) {
      return jsonResponse({
        id: "collab-1",
        extensionDays: 14,
        projectedEndDate: "2100-01-14",
      });
    }

    if (url.includes("/final-settlement/tenant-payment")) {
      return jsonResponse({
        settlement: { id: "settlement-final-tenant", settlementType: "FINAL_TENANT_PAYMENT" },
        ledgerEntries: [{ id: "ledger-final-tenant-brl" }, { id: "ledger-final-tenant-gold" }],
      });
    }

    if (url.includes("/final-settlement/collaborator-payment")) {
      return jsonResponse({
        settlement: { id: "settlement-final-collaborator", settlementType: "FINAL_COLLABORATOR_PAYMENT" },
        ledgerEntries: [{ id: "ledger-final-collaborator-brl" }, { id: "ledger-final-collaborator-gold" }],
      });
    }

    if (url.includes("/payout")) {
      return jsonResponse({
        settlement: { id: "settlement-1" },
        ledgerEntries: [{ id: "ledger-1" }],
      });
    }

    return jsonResponse(preview);
  });
}

function jsonResponse(data: unknown) {
  return new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function renderPanel({
  onJourneyClosed,
}: {
  onJourneyClosed?: (message: string) => void;
} = {}) {
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
            onJourneyClosed={onJourneyClosed}
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

async function clickSubmitButton(text: string) {
  const button = Array.from(
    container.querySelectorAll<HTMLButtonElement>('button[type="submit"]'),
  ).find((node) => node.textContent?.includes(text));
  if (!button) throw new Error(`Submit button not found: ${text}`);
  await act(async () => button.click());
}

function fieldControl(label: string) {
  const field = Array.from(container.querySelectorAll("label")).find((node) =>
    node.textContent?.includes(label),
  );
  const control = field?.querySelector("input, select, textarea") as
    | HTMLInputElement
    | HTMLSelectElement
    | HTMLTextAreaElement
    | null;
  if (!control) throw new Error(`Field not found: ${label}`);
  return control;
}

async function blurField(label: string) {
  const control = fieldControl(label);
  await act(async () => {
    control.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
    control.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
}
async function setFieldValue(label: string, value: string) {
  const control = fieldControl(label);

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

async function waitFor(assertion: () => boolean) {
  const until = Date.now() + 1500;
  while (Date.now() < until) {
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
    if (assertion()) return;
  }
  throw new Error("Timed out waiting for assertion");
}

async function waitForText(text: string) {
  await waitFor(() => Boolean(textNode(text)));
}
