import {
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import {
  AUTHENTICATION_ACCOUNT_FEEDBACK_EVENT,
  type AuthenticationAccountFeedback,
} from "../../api/auth.api";

function elementFromEventTarget(target: EventTarget | null): Element | null {
  return target instanceof Element ? target : null;
}

function isLookupSurface(target: EventTarget | null): boolean {
  const element = elementFromEventTarget(target);
  return Boolean(element?.closest('[role="combobox"], [role="listbox"]'));
}

function isLookupInput(target: EventTarget | null): boolean {
  return elementFromEventTarget(target)?.getAttribute("role") === "combobox";
}

function isInteractiveLookupResult(target: EventTarget | null): boolean {
  const element = elementFromEventTarget(target);
  return Boolean(
    element?.closest(
      '[role="option"], button, a, input, select, textarea, [tabindex]',
    ),
  );
}

function normalizedText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

function isCreateAccountButton(button: HTMLButtonElement): boolean {
  const text = normalizedText(button.textContent);
  return (
    text === "create account" || text === "creating…" || text === "creating..."
  );
}

function relaxIdentityLookupRequirements(form: HTMLFormElement): void {
  for (const control of form.querySelectorAll<
    HTMLInputElement | HTMLSelectElement
  >('input[role="combobox"], select[name="actorId"]')) {
    if (control.required) control.required = false;
  }

  for (const select of form.querySelectorAll<HTMLSelectElement>("select")) {
    const firstOption = normalizedText(select.options.item(0)?.textContent);
    if (firstOption.includes("select actor") && select.required) {
      select.required = false;
    }
  }
}

function relaxMissingActorSubmission(root: HTMLElement): void {
  for (const form of root.querySelectorAll<HTMLFormElement>("form")) {
    const createButton = Array.from(
      form.querySelectorAll<HTMLButtonElement>(
        'button[type="submit"], button:not([type])',
      ),
    ).find(isCreateAccountButton);
    if (!createButton) continue;

    // Actor provisioning is now a backend responsibility when the selected
    // tenant Person has no Actor. Do not let the old actor-required UI
    // contract prevent the POST from reaching that backend path.
    relaxIdentityLookupRequirements(form);

    // Preserve the pending guard. Other disabled states on this button were
    // inherited from the former "pre-existing Actor required" contract.
    const pending = normalizedText(createButton.textContent).startsWith(
      "creating",
    );
    if (createButton.disabled && !pending) createButton.disabled = false;
  }
}

export function AuthenticationLookupDismissBoundary({
  children,
}: {
  children: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [dismissed, setDismissed] = useState(false);
  const [feedback, setFeedback] =
    useState<AuthenticationAccountFeedback | null>(null);

  useEffect(() => {
    function handleFeedback(event: Event) {
      const detail = (event as CustomEvent<AuthenticationAccountFeedback>).detail;
      if (!detail || (detail.kind !== "success" && detail.kind !== "error")) {
        return;
      }
      setFeedback(detail);
      setDismissed(true);
    }

    window.addEventListener(
      AUTHENTICATION_ACCOUNT_FEEDBACK_EVENT,
      handleFeedback,
    );
    return () =>
      window.removeEventListener(
        AUTHENTICATION_ACCOUNT_FEEDBACK_EVENT,
        handleFeedback,
      );
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    relaxMissingActorSubmission(root);
    const observer = new MutationObserver(() =>
      relaxMissingActorSubmission(root),
    );
    observer.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["disabled", "required"],
    });
    return () => observer.disconnect();
  }, []);

  function handleFocusCapture(event: FocusEvent<HTMLDivElement>) {
    if (isLookupInput(event.target)) {
      setDismissed(false);
      return;
    }

    if (!isLookupSurface(event.target)) {
      setDismissed(true);
    }
  }

  function handleInputCapture(event: FormEvent<HTMLDivElement>) {
    if (isLookupInput(event.target)) {
      setDismissed(false);
    }
  }

  function handlePointerDownCapture(event: PointerEvent<HTMLDivElement>) {
    const element = elementFromEventTarget(event.target);
    const listbox = element?.closest('[role="listbox"]');

    if (listbox) {
      if (!isInteractiveLookupResult(event.target)) {
        setDismissed(true);
      }
      return;
    }

    if (!element?.closest('[role="combobox"]')) {
      setDismissed(true);
    }
  }

  function handleKeyDownCapture(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape" && isLookupSurface(event.target)) {
      setDismissed(true);
    }
  }

  return (
    <div
      ref={rootRef}
      data-authentication-lookups-dismissed={dismissed ? "true" : "false"}
      onFocusCapture={handleFocusCapture}
      onInputCapture={handleInputCapture}
      onPointerDownCapture={handlePointerDownCapture}
      onKeyDownCapture={handleKeyDownCapture}
    >
      {feedback && (
        <div
          role={feedback.kind === "error" ? "alert" : "status"}
          className={`mb-4 rounded-lg border p-3 text-sm ${
            feedback.kind === "error"
              ? "border-red-200 bg-red-50 text-red-900"
              : "border-emerald-200 bg-emerald-50 text-emerald-900"
          }`}
        >
          {feedback.message}
        </div>
      )}
      {children}
    </div>
  );
}
