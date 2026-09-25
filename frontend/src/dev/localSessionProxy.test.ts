import { describe, expect, it } from "vitest";
import {
  firstHeaderValue,
  isPrivateLanHost,
  replaceSessionCookie,
  sessionTokenFromSetCookie,
} from "./localSessionProxy";

describe("LOCAL private-LAN session proxy helpers", () => {
  it("recognizes only private IPv4 LAN Host headers", () => {
    expect(isPrivateLanHost("192.168.2.154:5173")).toBe(true);
    expect(isPrivateLanHost("10.0.0.9:5173")).toBe(true);
    expect(isPrivateLanHost("172.20.4.7:5173")).toBe(true);
    expect(isPrivateLanHost("localhost:5173")).toBe(false);
    expect(isPrivateLanHost("8.8.8.8:5173")).toBe(false);
  });

  it("extracts the canonical ERS token from a Set-Cookie response", () => {
    expect(
      sessionTokenFromSetCookie([
        "other=value; Path=/",
        "ers_session=fresh-session-token; Path=/; HttpOnly; SameSite=Lax",
      ]),
    ).toBe("fresh-session-token");
    expect(
      sessionTokenFromSetCookie(
        "ers_session=token-with-equals==; Path=/; HttpOnly",
      ),
    ).toBe("token-with-equals==");
  });

  it("replaces only the ERS session cookie while preserving unrelated cookies", () => {
    expect(
      replaceSessionCookie(
        "theme=dark; ers_session=stale-mobile-cookie; locale=pt-BR",
        "fresh-session-token",
      ),
    ).toBe(
      "theme=dark; locale=pt-BR; ers_session=fresh-session-token",
    );
  });

  it("normalizes incoming proxy header values", () => {
    expect(firstHeaderValue(" token ")).toBe("token");
    expect(firstHeaderValue([" first ", "second"])).toBe("first");
    expect(firstHeaderValue(undefined)).toBe("");
  });
});
