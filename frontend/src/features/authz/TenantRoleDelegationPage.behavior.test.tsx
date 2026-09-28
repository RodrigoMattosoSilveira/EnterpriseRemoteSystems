import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AuthorizationProvider,
  type AuthorizationContextValue,
} from "../../components/layout/AuthorizationContext";
import { I18nProvider } from "../../i18n";
import type { AuthzActor, AuthzActorRoleGrant } from "../../types/authz";
import { TenantRoleDelegationPage } from "./TenantRoleDelegationPage";

let container: HTMLDivElement;
let root: Root | null;

const currentActor: AuthorizationContextValue = {
  actorKey: "tenant-admin@example.test",
  actorRecordId: "actor-admin",
  tenantId: "tenant-a",
  scope: "TENANT",
  roleCodes: ["TENANT_ADMIN"],
  permissions: ["authz.tenant_roles.manage"],
};

const targetActor: AuthzActor = {
  id: "actor-target",
  actorKey: "target@example.test",
  displayName: "Target Person",
  personId: "person-target",
  active: true,
  roleGrants: [],
  binding: {
    accountId: "account-target",
    accountLogin: "target@example.test",
    scopeType: "TENANT",
    tenantId: "tenant-a",
    membershipId: "membership-target",
    membershipTenantId: "tenant-a",
    membershipActive: true,
    membershipSameTenant: true,
  },
  hasDelegatedAuthorityInOtherTenant: false,
};

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
});

describe("TenantRoleDelegationPage grant feedback", () => {
  it("shows first-grant success under the Role selector without immediately reporting already granted", async () => {
    let roleGrants: AuthzActorRoleGrant[] = [];

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = input.toString();
      if (url === "/api/v1/authz/tenant-role-actors" && !init?.method) {
        return json({ data: [{ ...targetActor, roleGrants }] });
      }
      if (
        url === "/api/v1/authz/tenant-role-actors/actor-target/role-grants" &&
        init?.method === "POST"
      ) {
        const body = JSON.parse(String(init.body ?? "{}")) as { roleCode?: string };
        expect(body.roleCode).toBe("EARNINGS_OPERATOR");
        const grant: AuthzActorRoleGrant = {
          id: "grant-earnings",
          actorId: "actor-target",
          roleId: "role-earnings",
          roleCode: "EARNINGS_OPERATOR",
          tenantId: "tenant-a",
          scopeType: "TENANT",
          active: true,
        };
        roleGrants = [grant];
        return json({ data: grant });
      }
      throw new Error(`Unhandled request: ${url}`);
    });

    renderPage();
    await waitForText("Target Person");

    await clickRoleSelector();
    await clickRoleOption("EARNINGS_OPERATOR");
    await clickButton("Grant Role");

    await waitForText("Earnings Operator granted.");
    await waitForText("EARNINGS_OPERATOR");

    const grantSection = sectionWithHeading("Grant a Role");
    expect(grantSection?.textContent).toContain("Earnings Operator granted.");
    expect(grantSection?.textContent).not.toContain("Earnings Operator is already granted.");
    expect(grantSection?.textContent).toContain("Select a Role");

    const currentGrants = sectionWithHeading("Current Role Grants");
    expect(currentGrants?.textContent).toContain("EARNINGS_OPERATOR");
  });
});

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      {
        path: "/authorization",
        element: (
          <I18nProvider>
            <AuthorizationProvider value={currentActor}>
              <TenantRoleDelegationPage />
            </AuthorizationProvider>
          </I18nProvider>
        ),
      },
    ],
    { initialEntries: ["/authorization"] },
  );
  root = createRoot(container);
  act(() =>
    root?.render(
      <QueryClientProvider client={client}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    ),
  );
}

function json(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

async function clickRoleSelector() {
  const button = container.querySelector<HTMLButtonElement>('button[aria-label="Role selector"]');
  if (!button) throw new Error("Role selector not found");
  await act(async () => button.click());
}

async function clickRoleOption(roleCode: string) {
  const option = container.querySelector<HTMLButtonElement>(`button[data-role-code="${roleCode}"]`);
  if (!option) throw new Error(`Role option ${roleCode} not found`);
  await act(async () => option.click());
}

async function clickButton(text: string) {
  const button = [...container.querySelectorAll<HTMLButtonElement>("button")].find(
    (node) => node.textContent?.trim() === text,
  );
  if (!button) throw new Error(`Button ${text} not found`);
  await act(async () => button.click());
}

function sectionWithHeading(heading: string) {
  return [...container.querySelectorAll("section")].find((section) =>
    section.querySelector("h3")?.textContent?.includes(heading),
  );
}

async function waitForText(text: string) {
  const timeout = Date.now() + 1500;
  while (Date.now() < timeout) {
    if (container.textContent?.includes(text)) return;
    await act(async () => new Promise((resolve) => setTimeout(resolve, 10)));
  }
  throw new Error(`Timed out waiting for ${text}`);
}
