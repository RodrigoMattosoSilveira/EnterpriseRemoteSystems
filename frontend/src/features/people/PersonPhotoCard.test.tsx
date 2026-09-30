import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../../i18n";
import { PersonPhotoCard } from "./PersonPhotoCard";

const PERSON_ID = "person-photo-1";
let container: HTMLDivElement;
let root: Root | null;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = null;
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => "blob:person-photo"),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  document.body.removeChild(container);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("PersonPhotoCard", () => {
  it("keeps photo management controls hidden for a read-only viewer", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: "not_found", message: "Record not found" } }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    })));

    renderCard(false);
    await waitForText("PP");
    expect(buttonByText("Remove Photo")).toBeUndefined();
    expect(inputByLabel("Choose person photo")).toBeUndefined();
  });

  it("uploads an accepted photo for a Tenant Administrator", async () => {
    const calls: Array<{ url: string; method: string; contentType: string }> = [];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method?.toUpperCase() ?? "GET";
      calls.push({ url, method, contentType: new Headers(init?.headers).get("Content-Type") ?? "" });
      if (method === "GET") {
        return new Response(JSON.stringify({ error: { code: "not_found", message: "Record not found" } }), { status: 404, headers: { "Content-Type": "application/json" } });
      }
      if (method === "PUT") {
        return new Response(JSON.stringify({ data: { contentType: "image/png", byteSize: 4, width: 100, height: 100, updatedAt: "2026-09-29T00:00:00Z" } }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      throw new Error(`Unhandled ${method} ${url}`);
    }));

    renderCard(true);
    await waitForText("PP");
    const input = inputByLabel("Choose person photo");
    expect(input).toBeDefined();
    const file = new File([new Uint8Array([1, 2, 3, 4])], "person.png", { type: "image/png" });
    Object.defineProperty(input!, "files", { value: [file], configurable: true });
    await act(async () => input!.dispatchEvent(new Event("change", { bubbles: true })));
    await waitFor(() => calls.some((call) => call.method === "PUT"));
    const put = calls.find((call) => call.method === "PUT");
    expect(put?.url).toBe(`/api/v1/people/${PERSON_ID}/photo`);
    expect(put?.contentType).toBe("image/png");
  });
});

function renderCard(canManage: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  act(() => {
    root = createRoot(container);
    root.render(<I18nProvider><QueryClientProvider client={client}><PersonPhotoCard personId={PERSON_ID} canManage={canManage} displayName="Photo Person" /></QueryClientProvider></I18nProvider>);
  });
}

function buttonByText(text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.trim() === text);
}
function inputByLabel(label: string): HTMLInputElement | undefined {
  return Array.from(container.querySelectorAll("input")).find((input) => input.getAttribute("aria-label") === label);
}
async function waitForText(text: string) { await waitFor(() => container.textContent?.includes(text) ?? false); }
async function waitFor(predicate: () => boolean) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
  }
  throw new Error("Timed out waiting for condition");
}
