import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthorizationProvider } from "../../components/layout/AuthorizationContext";
import { I18nProvider, LOCALE_STORAGE_KEY } from "../../i18n";
import { WorkPeriodsPage } from "./WorkPeriodsPage";

vi.mock("./usePlanning", () => ({
  useWorkPeriods: () => ({
    data: { items: [], total: 0, page: 1, pageSize: 200 },
    error: null,
    isLoading: false,
  }),
  useCreateWorkPeriod: () => ({
    error: null,
    isPending: false,
    mutate: vi.fn(),
  }),
}));

let container: HTMLDivElement;
let root: Root | null;

beforeEach(() => {
  localStorage.setItem(LOCALE_STORAGE_KEY, "pt-BR");
  container = document.createElement("div");
  document.body.appendChild(container);
  root = null;
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  document.body.removeChild(container);
  localStorage.clear();
  vi.clearAllMocks();
});

describe("WorkPeriodsPage", () => {
  it("renders pt-BR Work Period start and end as deterministic 24-hour HH:MM fields", async () => {
    await act(async () => {
      root = createRoot(container);
      root.render(
        <MemoryRouter>
          <I18nProvider>
            <AuthorizationProvider
              value={{
                actorKey: "tenant-admin",
                actorRecordId: "actor-1",
                tenantId: "default",
                scope: "TENANT",
                roleCodes: ["TENANT_ADMIN"],
                permissions: [],
              }}
            >
              <WorkPeriodsPage />
            </AuthorizationProvider>
          </I18nProvider>
        </MemoryRouter>,
      );
    });

    const addButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Adicionar Período de Trabalho",
    );
    expect(addButton).toBeTruthy();

    await act(async () => {
      addButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    const startInput = inputForLabel("Início *");
    const endInput = inputForLabel("Fim *");

    expect(startInput?.type).toBe("text");
    expect(startInput?.inputMode).toBe("numeric");
    expect(startInput?.placeholder).toBe("HH:MM");
    expect(startInput?.value).toBe("06:00");

    expect(endInput?.type).toBe("text");
    expect(endInput?.inputMode).toBe("numeric");
    expect(endInput?.placeholder).toBe("HH:MM");
    expect(endInput?.value).toBe("18:00");
  });
});

function inputForLabel(text: string): HTMLInputElement | null {
  const label = Array.from(container.querySelectorAll("label")).find(
    (candidate) => candidate.childNodes[0]?.textContent?.trim() === text,
  );
  return label?.querySelector("input") ?? null;
}
