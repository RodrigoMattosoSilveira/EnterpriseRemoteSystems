import { describe, expect, it } from "vitest";
import { loginFromLocationState, safeReturnTo } from "./LoginPage";

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
