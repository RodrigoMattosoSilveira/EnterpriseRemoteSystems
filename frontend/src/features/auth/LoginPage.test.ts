import { describe, expect, it } from "vitest";
import { ApiError } from "../../api/client";
import { loginFailurePresentation, loginFromLocationState, safeReturnTo } from "./LoginPage";

describe("safeReturnTo", () => {
  it("preserves ordinary protected routes", () => {
    expect(safeReturnTo("/expenses?status=active")).toBe("/expenses?status=active");
  });

  it("does not reuse authentication and terminal status routes", () => {
    expect(safeReturnTo("/login")).toBe("/");
    expect(safeReturnTo("/forbidden")).toBe("/");
    expect(safeReturnTo("/forbidden?from=authentication")).toBe("/");
    expect(safeReturnTo("/password/reset")).toBe("/");
  });

  it("rejects external and protocol-relative targets", () => {
    expect(safeReturnTo("https://example.com")).toBe("/");
    expect(safeReturnTo("//example.com/path")).toBe("/");
  });
});


describe("loginFromLocationState", () => {
  it("prefills the authoritative login returned by password reset", () => {
    expect(loginFromLocationState({ login: " Reset.User@Example.COM " })).toBe(
      "reset.user@example.com",
    );
  });

  it("ignores missing and malformed login state", () => {
    expect(loginFromLocationState(null)).toBe("");
    expect(loginFromLocationState({ login: 42 })).toBe("");
  });
});


describe("loginFailurePresentation", () => {
  it("preserves the generic message for ordinary invalid credentials", () => {
    expect(
      loginFailurePresentation(
        new ApiError({
          status: 401,
          code: "invalid_credentials",
          message: "Login or password is invalid",
        }),
      ),
    ).toEqual({
      code: "invalid_credentials",
      message: "The login or password is incorrect.",
    });
  });

  it("explains that a verified Authentication Account is inactive", () => {
    expect(
      loginFailurePresentation(
        new ApiError({
          status: 401,
          code: "account_inactive",
          message: "The authentication account is inactive",
        }),
      ),
    ).toEqual({
      code: "account_inactive",
      message: "Your authentication account is inactive. Contact an Application Administrator.",
    });
  });

  it("explains that verified authorization access is inactive", () => {
    expect(
      loginFailurePresentation(
        new ApiError({
          status: 401,
          code: "actor_inactive",
          message: "The authorization actor is inactive",
        }),
      ),
    ).toEqual({
      code: "actor_inactive",
      message: "Your authorization access is inactive. Contact a Tenant Administrator.",
    });
  });
});
