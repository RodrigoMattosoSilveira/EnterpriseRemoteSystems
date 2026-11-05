import { afterEach, describe, expect, it } from "vitest";
import { installNativeValidationTranslations } from "./nativeValidation";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
  document.body.replaceChildren();
});

function attach(locale: "en-US" | "pt-BR") {
  const dispose = installNativeValidationTranslations(locale);
  cleanups.push(dispose);
  return dispose;
}

describe("localized native constraint validation", () => {
  it("shows a Portuguese number error and clears it as the user edits", () => {
    attach("pt-BR");
    const input = document.createElement("input");
    input.type = "number";
    input.required = true;
    input.min = "0.01";
    input.step = "0.01"; // Match GoldPriceForm: 10 is valid only with this increment.
    document.body.appendChild(input);
    input.value = "0";
    input.dispatchEvent(new Event("invalid", { cancelable: true }));
    expect(input.validationMessage).toBe("O valor está abaixo do mínimo permitido.");
    input.value = "10";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(input.validity.stepMismatch).toBe(false);
    expect(input.checkValidity()).toBe(true);
  });

  it("localizes number errors, and respects separate component validation", () => {
    attach("pt-BR");
    const input = document.createElement("input");
    input.type = "number";
    document.body.appendChild(input);
    // Simulate Chromium's badInput constraint (which JSDOM cannot emulate by typing 'e').
    Object.defineProperty(input, "validity", { configurable: true, value: { badInput: true } });
    input.dispatchEvent(new Event("invalid", { cancelable: true }));
    expect(input.validationMessage).toBe("Informe um número válido.");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(input.validationMessage).toBe("");
  });

  it("changes languages without leaving a stale custom error", () => {
    const dispose = attach("pt-BR");
    const input = document.createElement("input");
    input.required = true;
    document.body.appendChild(input);
    input.dispatchEvent(new Event("invalid", { cancelable: true }));
    expect(input.validationMessage).toBe("Preencha este campo.");
    dispose();
    expect(input.validationMessage).not.toBe("Preencha este campo.");
    attach("en-US");
    input.dispatchEvent(new Event("invalid", { cancelable: true }));
    expect(input.validationMessage).toBe("Fill out this field.");
  });

  it("never overwrites an explicit component custom validation message", () => {
    attach("pt-BR");
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.setCustomValidity("Specific component error");
    input.dispatchEvent(new Event("invalid", { cancelable: true }));
    expect(input.validationMessage).toBe("Specific component error");
  });
});
