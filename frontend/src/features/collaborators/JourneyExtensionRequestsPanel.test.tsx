import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthorizationProvider } from "../../components/layout/AuthorizationContext";
import { I18nProvider } from "../../i18n";
import type { AuthzCurrentActor } from "../../types/authz";
import { JourneyExtensionRequestsPanel } from "./JourneyExtensionRequestsPanel";

let container: HTMLDivElement;
let root: Root | null;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = null;
});

afterEach(async () => {
  vi.restoreAllMocks();
  if (root) await act(async () => root?.unmount());
  document.body.removeChild(container);
});

describe("JourneyExtensionRequestsPanel", () => {
  it("lets only the matching Collaborator accept or reject a pending extension", async () => {
    const calls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString();
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (url.endsWith("/extension-requests") && (init?.method ?? "GET") === "GET") {
        return jsonResponse({ data: [pendingRequest] });
      }
      if (url.endsWith("/extension-requests/request-1/accept")) {
        return jsonResponse({ data: { ...pendingRequest, status: "ACCEPTED", acceptedBy: "collaborator@example.test" } });
      }
      throw new Error(`Unhandled request ${url}`);
    });

    renderPanel({
      actorKey: "collaborator@example.test",
      actorRecordId: "actor-collaborator",
      tenantId: "default",
      scope: "TENANT",
      collaboratorId: "collab-1",
      roleCodes: [],
      permissions: ["collaborators.self.read", "journey.extensions.self.respond"],
      intrinsicPermissions: ["collaborators.self.read", "journey.extensions.self.respond"],
    });

    await waitForText("Extension receipt JER-TEST");
    expect(button("Accept Extension")).toBeTruthy();
    expect(button("Reject Extension")).toBeTruthy();
    expect(button("Cancel Proposal")).toBeFalsy();
    await act(async () => button("Accept Extension")?.click());
    await waitFor(() => calls.some((call) => call.includes("POST /api/v1/collaborators/collab-1/extension-requests/request-1/accept")));
  });

  it("lets a Tenant Administrator cancel but not accept on behalf of the Collaborator", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/extension-requests")) return jsonResponse({ data: [pendingRequest] });
      throw new Error(`Unhandled request ${url}`);
    });
    renderPanel({
      actorKey: "tenant-admin@example.test",
      actorRecordId: "actor-admin",
      tenantId: "default",
      scope: "TENANT",
      roleCodes: ["TENANT_ADMIN"],
      permissions: ["collaborators.read", "collaborators.update"],
    });
    await waitForText("Extension receipt JER-TEST");
    expect(button("Accept Extension")).toBeFalsy();
    expect(button("Reject Extension")).toBeFalsy();
    expect(button("Cancel Proposal")).toBeTruthy();
  });
});

const pendingRequest = {
  id: "request-1",
  collaboratorJourneyId: "collab-1",
  receiptNumber: "JER-TEST",
  previousEndDate: "2026-12-28",
  proposedEndDate: "2027-01-04",
  additionalDays: 7,
  reason: "Finish the current assignment",
  status: "PENDING",
  requestedBy: "tenant-admin@example.test",
  requestedAt: "2026-09-29T12:00:00Z",
};

function renderPanel(actor: AuthzCurrentActor) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  act(() => {
    root = createRoot(container);
    root.render(
      <I18nProvider>
        <AuthorizationProvider value={actor}>
          <QueryClientProvider client={queryClient}>
            <JourneyExtensionRequestsPanel collaboratorId="collab-1" />
          </QueryClientProvider>
        </AuthorizationProvider>
      </I18nProvider>,
    );
  });
}

function button(text: string) {
  return Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.trim() === text) as HTMLButtonElement | undefined;
}
async function waitForText(text: string) { await waitFor(() => container.textContent?.includes(text) === true); }
async function waitFor(predicate: () => boolean) {
  for (let i = 0; i < 50; i += 1) {
    if (predicate()) return;
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  }
  throw new Error("condition not met");
}
function jsonResponse(payload: unknown) { return Promise.resolve(new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } })); }
