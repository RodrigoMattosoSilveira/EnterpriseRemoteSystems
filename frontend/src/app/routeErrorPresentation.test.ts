import { describe, expect, it } from "vitest";
import { describeRouteError } from "./routeErrorPresentation";

describe("describeRouteError", () => {
  it("renders understandable access-denied guidance for routed 403 responses", () => {
    expect(
      describeRouteError({
        status: 403,
        statusText: "Forbidden",
        internal: false,
        data: null,
      }),
    ).toEqual({
      title: "Access denied",
      message:
        "Your account does not have permission to access this page. Contact an administrator if you believe access is required.",
    });
  });

  it("renders access-denied guidance for API-style forbidden errors", () => {
    expect(
      describeRouteError({
        code: "forbidden",
        message: "Forbidden",
      }),
    ).toEqual({
      title: "Access denied",
      message:
        "Your account does not have permission to access this page. Contact an administrator if you believe access is required.",
    });
  });

  it("keeps genuine missing routes distinct from authorization failures", () => {
    expect(
      describeRouteError({
        status: 404,
        statusText: "Not Found",
        internal: true,
        data: null,
      }),
    ).toEqual({
      title: "Page not found",
      message: "The requested page could not be found.",
    });
  });

  it("renders authentication guidance for unauthenticated route failures", () => {
    expect(
      describeRouteError({
        code: "authentication_required",
        message: "An authenticated session is required",
      }),
    ).toEqual({
      title: "Authentication required",
      message: "Sign in with an authorized account to access this page.",
    });
  });

  it("does not expose an unknown thrown value as raw JSON", () => {
    expect(describeRouteError({ unexpected: true })).toEqual({
      title: "Something went wrong",
      message: "An unexpected error occurred.",
    });
  });
});
