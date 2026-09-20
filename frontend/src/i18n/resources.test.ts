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
});
