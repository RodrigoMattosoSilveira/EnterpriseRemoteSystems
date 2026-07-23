import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ApiError } from "../api/client";
import { AUTHZ_REQUEST_ACTOR_STORAGE_KEY } from "../api/requestActorBootstrap";
import { ApiErrorPanel } from "./ApiErrorPanel";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  window.localStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  window.localStorage.clear();
});

describe("ApiErrorPanel local actor recovery", () => {
  it("offers an explicit bootstrap recovery for a forbidden non-default local actor", () => {
    window.localStorage.setItem(
      AUTHZ_REQUEST_ACTOR_STORAGE_KEY,
      JSON.stringify({ actorId: "restricted-actor", tenantId: "default" }),
    );

    act(() => {
      root.render(
        <ApiErrorPanel
          error={
            new ApiError({
              status: 403,
              code: "forbidden",
              message: "Actor is not permitted to perform this operation",
              url: "/api/v1/collaborators?page=1&pageSize=100",
            })
          }
        />,
      );
    });

    expect(container.textContent).toContain("restricted-actor");
    expect(container.textContent).toContain("Use bootstrap-admin and reload");
  });

  it("does not offer privilege recovery when bootstrap-admin itself is forbidden", () => {
    window.localStorage.setItem(
      AUTHZ_REQUEST_ACTOR_STORAGE_KEY,
      JSON.stringify({ actorId: "bootstrap-admin", tenantId: "default" }),
    );

    act(() => {
      root.render(
        <ApiErrorPanel
          error={
            new ApiError({
              status: 403,
              code: "forbidden",
              message: "Actor is not permitted to perform this operation",
            })
          }
        />,
      );
    });

    expect(container.textContent).not.toContain("Use bootstrap-admin and reload");
  });
});
