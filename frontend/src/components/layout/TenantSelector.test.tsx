import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AuthTenantOption } from "../../types/auth";
import { TenantSelector } from "./TenantSelector";

let container: HTMLDivElement;
let root: Root;

const tenants: AuthTenantOption[] = [
  { id: "default", code: "DEFAULT", name: "Default Tenant", roleCodes: ["TENANT_ADMIN"] },
  { id: "tenant-alpha", code: "ALPHA", name: "Alpha Operations", roleCodes: ["TENANT_ADMIN"] },
  { id: "tenant-beta", code: "BETA", name: "Beta Cooperative", roleCodes: ["TENANT_ADMIN"] },
];

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.removeChild(container);
  vi.restoreAllMocks();
});

describe("TenantSelector", () => {
  it("opens an in-page list and progressively filters tenants", async () => {
    const onTenantChange = vi.fn();
    renderSelector(onTenantChange);

    await click(currentTenantButton());
    expect(filterInput()).toBeTruthy();
    expect(options()).toHaveLength(3);

    await typeInto(filterInput(), "bet");

    expect(options()).toHaveLength(1);
    expect(options()[0]?.textContent).toContain("Beta Cooperative");
    expect(container.textContent).toContain("1 of 3 tenants");

    await click(options()[0] as HTMLButtonElement);

    expect(onTenantChange).toHaveBeenCalledWith("tenant-beta");
    expect(filterInputOrNull()).toBeNull();
  });

  it("supports keyboard selection from the filtered list", async () => {
    const onTenantChange = vi.fn();
    renderSelector(onTenantChange);

    await click(currentTenantButton());
    await typeInto(filterInput(), "alpha");
    await keyDown(filterInput(), "Enter");

    expect(onTenantChange).toHaveBeenCalledWith("tenant-alpha");
  });

  it("labels the GLOBAL option as an administration context instead of a tenant", async () => {
    const onTenantChange = vi.fn();

    act(() => {
      root.render(
        <TenantSelector
          tenants={[
            {
              id: "*",
              code: "GLOBAL",
              name: "Global administration",
              roleCodes: ["APPLICATION_ADMIN"],
              actorRecordId: "global-admin-actor",
              actorKey: "global-admin",
              actorScope: "APPLICATION",
            },
          ]}
          selectedTenantId="*"
          onTenantChange={onTenantChange}
        />,
      );
    });

    expect(container.textContent).toContain("Administration context");
    expect(container.textContent).toContain("Global administration");
    expect(container.textContent).toContain("GLOBAL");

    const button = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Current administration context"]',
    );
    if (!button) throw new Error("Current administration context button not found");
    await click(button);

    expect(container.querySelector('section[aria-label="Administration context selection"]')).toBeTruthy();
    expect(container.querySelector('input[aria-label="Filter contexts"]')).toBeTruthy();
    expect(container.textContent).toContain("1 of 1 contexts");
  });

});

function renderSelector(onTenantChange: (tenantId: string) => void) {
  act(() => {
    root.render(
      <TenantSelector
        tenants={tenants}
        selectedTenantId="default"
        onTenantChange={onTenantChange}
      />,
    );
  });
}

function currentTenantButton() {
  const button = container.querySelector<HTMLButtonElement>(
    'button[aria-label="Current tenant"]',
  );
  if (!button) throw new Error("Current tenant button not found");
  return button;
}

function filterInput() {
  const input = filterInputOrNull();
  if (!input) throw new Error("Filter tenants input not found");
  return input;
}

function filterInputOrNull() {
  return container.querySelector<HTMLInputElement>('input[aria-label="Filter tenants"]');
}

function options() {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('[role="option"]'));
}

async function click(element: HTMLElement) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function typeInto(input: HTMLInputElement, value: string) {
  const valueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;

  await act(async () => {
    valueSetter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function keyDown(input: HTMLInputElement, key: string) {
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
}
