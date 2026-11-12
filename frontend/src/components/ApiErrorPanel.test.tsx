import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ApiError } from "../api/client";
import { I18nProvider, LOCALE_STORAGE_KEY } from "../i18n";
import { ApiErrorPanel } from "./ApiErrorPanel";

describe("ApiErrorPanel localization", () => {
  afterEach(() => window.localStorage.removeItem(LOCALE_STORAGE_KEY));

  it("uses the active pt-BR locale without an explicit translate prop", () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, "pt-BR");
    act(() => {
      root.render(
        <I18nProvider>
          <ApiErrorPanel
            error={
              new ApiError({
                status: 400,
                code: "validation_failed",
                message: "Validation failed",
                fields: { description: "Required" },
                fieldCodes: { description: "required" },
              })
            }
          />
        </I18nProvider>,
      );
    });

    expect(container.textContent).toContain("Alguns campos precisam de correção.");
    expect(container.textContent).toContain("Descrição: Obrigatório");
    expect(container.textContent).toContain("Código: validation_failed");
    expect(container.textContent).not.toContain("Validation failed");
  });

  it("keeps the server's English text in en-US", () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, "en-US");
    act(() => {
      root.render(
        <I18nProvider>
          <ApiErrorPanel
            error={
              new ApiError({
                status: 400,
                code: "validation_failed",
                message: "Validation failed",
                fields: { description: "Required" },
                fieldCodes: { description: "required" },
              })
            }
          />
        </I18nProvider>,
      );
    });

    expect(container.textContent).toContain("Validation failed");
    expect(container.textContent).toContain("description: Required");
  });
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("ApiErrorPanel authentication guidance", () => {
  it("explains that an authenticated session is required", () => {
    act(() => {
      root.render(
        <ApiErrorPanel
          error={
            new ApiError({
              status: 401,
              code: "authentication_required",
              message: "An authenticated session is required",
              url: "/api/v1/people",
            })
          }
        />,
      );
    });

    expect(container.textContent).toContain("Sign in again");
    expect(container.textContent).not.toContain("bootstrap-admin");
  });

  it("explains when tenant selection is required", () => {
    act(() => {
      root.render(
        <ApiErrorPanel
          error={
            new ApiError({
              status: 403,
              code: "tenant_selection_required",
              message: "An authorization context must be selected",
            })
          }
        />,
      );
    });

    expect(container.textContent).toContain("Select an available authorization context");
  });
});
