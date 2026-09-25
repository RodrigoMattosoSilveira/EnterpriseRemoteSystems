import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  matchSupportedLocale,
  persistLocale,
  readStoredLocale,
  resolveLocale,
} from "./locale";

describe("ERS locale contract", () => {
  it("supports only the explicit en-US and pt-BR locale mappings", () => {
    expect(matchSupportedLocale("en-US")).toBe("en-US");
    expect(matchSupportedLocale("EN_us")).toBe("en-US");
    expect(matchSupportedLocale("en")).toBe("en-US");
    expect(matchSupportedLocale("pt-BR")).toBe("pt-BR");
    expect(matchSupportedLocale("PT_br")).toBe("pt-BR");
    expect(matchSupportedLocale("pt")).toBe("pt-BR");
    expect(matchSupportedLocale("pt-PT")).toBeNull();
    expect(matchSupportedLocale("es-BR")).toBeNull();
  });

  it("gives a stored explicit preference precedence over browser language", () => {
    expect(
      resolveLocale({
        storedLocale: "en-US",
        browserLanguages: ["pt-BR"],
      }),
    ).toEqual({ locale: "en-US", source: "stored" });
  });

  it("uses the first supported browser language when no explicit preference exists", () => {
    expect(
      resolveLocale({ browserLanguages: ["fr-FR", "pt-BR", "en-US"] }),
    ).toEqual({ locale: "pt-BR", source: "browser" });
  });

  it("falls back to en-US when neither storage nor browser languages are supported", () => {
    expect(resolveLocale({ browserLanguages: ["fr-FR", "de-DE"] })).toEqual({
      locale: DEFAULT_LOCALE,
      source: "fallback",
    });
  });

  it("persists only the locale preference without coupling it to identity or Tenant state", () => {
    window.localStorage.clear();
    window.localStorage.setItem("ers.auth.selectedTenantId", "tenant-a");

    persistLocale(window.localStorage, "pt-BR");

    expect(readStoredLocale(window.localStorage)).toBe("pt-BR");
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("pt-BR");
    expect(window.localStorage.getItem("ers.auth.selectedTenantId")).toBe("tenant-a");
  });
});
