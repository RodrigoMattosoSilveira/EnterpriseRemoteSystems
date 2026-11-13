import { describe, expect, it } from "vitest";
import { ledgerSourceTypeLabel } from "./financialLabels";
import { translateForLocale, type Translate } from "./translateResource";

const ptBR: Translate = (key, parameters) => translateForLocale("pt-BR", key, parameters);

describe("financial labels", () => {
  it("translates the Journey bonus ledger source instead of humanizing the code", () => {
    expect(ledgerSourceTypeLabel("JOURNEY_BONUS", ptBR)).toBe("bônus da Jornada");
  });

  it("still humanizes unknown codes as a last resort", () => {
    expect(ledgerSourceTypeLabel("SOME_FUTURE_SOURCE", ptBR)).toBe("some future source");
  });
});
