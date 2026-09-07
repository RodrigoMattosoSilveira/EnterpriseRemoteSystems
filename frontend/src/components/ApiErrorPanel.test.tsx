import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
