import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { I18nextProvider } from "react-i18next";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import i18n from "../app/i18n";
import { ApiError } from "../api/client";
import { ApiErrorPanel } from "./ApiErrorPanel";

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
        <I18nextProvider i18n={i18n}>
          <ApiErrorPanel
            error={
              new ApiError({
                status: 401,
                code: "authentication_required",
                message: "An authenticated session is required",
                url: "/api/v1/people",
              })
            }
          />
        </I18nextProvider>,
      );
    });

    expect(container.textContent).toContain("Sign in again");
    expect(container.textContent).not.toContain("bootstrap-admin");
  });

  it("explains when tenant selection is required", () => {
    act(() => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <ApiErrorPanel
            error={
              new ApiError({
                status: 403,
                code: "tenant_selection_required",
                message: "A specific tenant must be selected",
              })
            }
          />
        </I18nextProvider>,
      );
    });

    expect(container.textContent).toContain("Select a tenant");
  });

  it("translates current-account error codes", () => {
    act(() => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <ApiErrorPanel
            error={
              new ApiError({
                status: 409,
                code: "payout_exceeds_available_balance",
                message: "requested payout exceeds the available positive balance",
              })
            }
          />
        </I18nextProvider>,
      );
    });

    expect(container.textContent).toContain(
      "The requested payout exceeds the available positive balance.",
    );
  });

  it("translates current-account field validation messages", () => {
    act(() => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <ApiErrorPanel
            error={
              new ApiError({
                status: 400,
                code: "validation_failed",
                message: "Validation failed",
                fields: {
                  effectiveDate: "Effective date must be YYYY-MM-DD",
                  brlAmount: "BRL amount cannot be negative",
                  "secondApproval.approvedBy": "Second approver must be different from the authorizing actor",
                },
              })
            }
          />
        </I18nextProvider>,
      );
    });

    expect(container.textContent).toContain("Effective date must be YYYY-MM-DD");
    expect(container.textContent).toContain("BRL amount cannot be negative");
    expect(container.textContent).toContain(
      "Second approver must be different from the authorizing actor",
    );
  });

  it("renders Portuguese translations for current-account validation messages", async () => {
    await i18n.changeLanguage("pt-BR");

    act(() => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <ApiErrorPanel
            error={
              new ApiError({
                status: 400,
                code: "validation_failed",
                message: "Validation failed",
                fields: {
                  page: "Page must be greater than zero",
                  direction: "Direction must be CREDIT or DEBIT",
                },
              })
            }
          />
        </I18nextProvider>,
      );
    });

    expect(container.textContent).toContain("A página deve ser maior que zero");
    expect(container.textContent).toContain("A direção deve ser CREDIT ou DEBIT");

    await i18n.changeLanguage("en");
  });
});
