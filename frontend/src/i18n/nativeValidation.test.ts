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
    expect(input.validationMessage).toBe("Use um valor igual ou maior que 0.01.");
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
    expect(input.validationMessage).toBe("Use um número válido.");
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(input.validationMessage).toBe("");
  });


  it("prioritizes bad numeric input over required when both constraints are reported", () => {
    attach("pt-BR");
    const input = document.createElement("input");
    input.type = "number";
    input.required = true;
    document.body.appendChild(input);
    // Chromium may report both for text like "e"; JSDOM cannot type that into type=number.
    Object.defineProperty(input, "validity", {
      configurable: true,
      value: { badInput: true, valueMissing: true, customError: false },
    });
    input.dispatchEvent(new Event("invalid", { cancelable: true }));
    expect(input.validationMessage).toBe("Use um número válido.");
  });

  it("keeps a genuinely empty required numeric field distinct from invalid content", () => {
    attach("pt-BR");
    const input = document.createElement("input");
    input.type = "number";
    input.required = true;
    document.body.appendChild(input);
    input.dispatchEvent(new Event("invalid", { cancelable: true }));
    expect(input.validationMessage).toBe("Preencha este campo.");
  });

  it("explains numeric bounds and increments using the actual constraints", () => {
    attach("pt-BR");
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0.01";
    input.max = "500";
    input.step = "0.01";
    document.body.appendChild(input);
    input.value = "0";
    input.dispatchEvent(new Event("invalid", { cancelable: true }));
    expect(input.validationMessage).toBe("Use um valor igual ou maior que 0.01.");
    input.value = "501";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("invalid", { cancelable: true }));
    expect(input.validationMessage).toBe("Use um valor igual ou menor que 500.");
    input.value = "1.005";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("invalid", { cancelable: true }));
    expect(input.validationMessage).toBe("Use incrementos de 0.01 a partir do mínimo permitido.");
  });

  it("uses type-specific guidance for invalid email and URL fields", () => {
    attach("pt-BR");
    for (const [type, invalidValue, expected] of [
      ["email", "not-an-email", "Informe um endereço de e-mail válido."],
      ["url", "not-a-url", "Informe um endereço de site válido (URL)."],
    ]) {
      const input = document.createElement("input");
      input.type = type;
      input.value = invalidValue;
      document.body.appendChild(input);
      input.dispatchEvent(new Event("invalid", { cancelable: true }));
      expect(input.validationMessage).toBe(expected);
    }
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
