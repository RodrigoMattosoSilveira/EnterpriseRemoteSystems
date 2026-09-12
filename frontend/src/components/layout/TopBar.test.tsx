import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TopBar } from "./TopBar";
import type { AuthSession, AuthTenantOption } from "../../types/auth";
import type { AuthzCurrentActor } from "../../types/authz";

let container: HTMLDivElement;
let root: Root | null;

const session: AuthSession = {
  accountId: "account-admin",
  displayName: "Application Administrator",
  login: "admin@example.com",
  mustChangePassword: false,
  expiresAt: "2026-09-08T00:00:00Z",
};

const tenants: AuthTenantOption[] = [
  { id: "default", code: "DEFAULT", name: "Tenant A", roleCodes: [] },
];

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = null;
});

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
  }
  document.body.removeChild(container);
});

describe("TopBar support access provenance", () => {
  it("shows the active Tenant Support Access Lease on every workspace page", () => {
    const actor: AuthzCurrentActor = {
      actorKey: "bootstrap-admin",
      actorRecordId: "actor-bootstrap-admin",
      tenantId: "default",
      scope: "APPLICATION",
      roleCodes: ["APPLICATION_ADMIN"],
      permissions: ["people.read"],
      supportLeaseId: "lease-a",
      supportLeaseExpiresAt: "2026-09-07T22:00:00Z",
      supportLeasePermissions: ["people.read"],
    };

    act(() => {
      root = createRoot(container);
      root.render(
        <TopBar
          session={session}
          tenants={tenants}
          selectedTenantId="default"
          effectiveActor={actor}
          onTenantChange={vi.fn()}
          onTenantOptionsRefresh={vi.fn()}
          onLogout={vi.fn()}
        />,
      );
    });

    expect(container.textContent).toContain("Support access active");
    expect(container.textContent).toContain("lease-a");
    expect(container.querySelector('[data-testid="support-access-active"]')).not.toBeNull();
  });

  it("does not show a support-access badge for ordinary Tenant authority", () => {
    const actor: AuthzCurrentActor = {
      actorKey: "tenant-admin",
      actorRecordId: "actor-tenant-admin",
      tenantId: "default",
      scope: "TENANT",
      roleCodes: ["TENANT_ADMIN"],
      permissions: ["people.read"],
      supportLeasePermissions: [],
    };

    act(() => {
      root = createRoot(container);
      root.render(
        <TopBar
          session={session}
          tenants={tenants}
          selectedTenantId="default"
          effectiveActor={actor}
          onTenantChange={vi.fn()}
          onTenantOptionsRefresh={vi.fn()}
          onLogout={vi.fn()}
        />,
      );
    });

    expect(container.querySelector('[data-testid="support-access-active"]')).toBeNull();
  });
});
