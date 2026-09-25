import { describe, expect, it } from "vitest";
import { enUSMessages, messagesByLocale, ptBRMessages } from "./resources";

describe("ERS translation resources", () => {
  it("keeps pt-BR and en-US on the same key contract", () => {
    expect(Object.keys(ptBRMessages).sort()).toEqual(Object.keys(enUSMessages).sort());
  });

  it("provides foundation labels in both supported locales", () => {
    expect(messagesByLocale["en-US"]["locale.selectorLabel"]).toBe("Language");
    expect(messagesByLocale["pt-BR"]["locale.selectorLabel"]).toBe("Idioma");
  });

  it("uses Locatário terminology only in pt-BR while preserving English Tenant terminology", () => {
    expect(messagesByLocale["en-US"]["common.tenant"]).toBe("Tenant");
    expect(messagesByLocale["en-US"]["common.tenants"]).toBe("Tenants");
    expect(messagesByLocale["pt-BR"]["common.tenant"]).toBe("Locatário");
    expect(messagesByLocale["pt-BR"]["common.tenants"]).toBe("Locatários");
  });
});
