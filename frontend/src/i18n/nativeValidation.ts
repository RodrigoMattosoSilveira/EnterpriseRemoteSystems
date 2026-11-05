import type { AppLocale } from "./locale";
import { translateForLocale } from "./translateResource";

type ValidatableControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function isControl(target: EventTarget | null): target is ValidatableControl {
  return target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement;
}

/** Localize the browser's constraint-validation bubble without altering constraints or submission. */
export function installNativeValidationTranslations(locale: AppLocale, root: Document = document): () => void {
  const owned = new Set<ValidatableControl>();
  const clear = (control: ValidatableControl) => {
    if (!owned.has(control)) return;
    control.setCustomValidity("");
    owned.delete(control);
  };
  const onEdit = (event: Event) => {
    if (isControl(event.target)) clear(event.target);
  };
  const onInvalid = (event: Event) => {
    const control = event.target;
    if (!isControl(control) || control.willValidate === false) return;
    // Preserve a component's own custom validation messages.
    if (control.validity.customError && !owned.has(control)) return;
    clear(control);
    const validity = control.validity;
    const key = validity.valueMissing ? "native.validation.required" :
      validity.badInput || validity.typeMismatch ? "native.validation.numberOrType" :
      validity.rangeUnderflow ? "native.validation.minimum" :
      validity.rangeOverflow ? "native.validation.maximum" :
      validity.stepMismatch ? "native.validation.step" :
      validity.tooShort ? "native.validation.tooShort" :
      validity.tooLong ? "native.validation.tooLong" :
      validity.patternMismatch ? "native.validation.pattern" : null;
    if (!key) return;
    const message = translateForLocale(locale, key === "native.validation.numberOrType" && control instanceof HTMLInputElement && control.type === "number"
      ? "native.validation.number" : key);
    control.setCustomValidity(message);
    owned.add(control);
  };
  // invalid does not bubble; use capture so this applies to all ERS forms.
  root.addEventListener("invalid", onInvalid, true);
  root.addEventListener("input", onEdit, true);
  root.addEventListener("change", onEdit, true);
  return () => {
    root.removeEventListener("invalid", onInvalid, true);
    root.removeEventListener("input", onEdit, true);
    root.removeEventListener("change", onEdit, true);
    for (const control of owned) control.setCustomValidity("");
    owned.clear();
  };
}
