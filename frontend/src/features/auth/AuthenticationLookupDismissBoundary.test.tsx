import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuthenticationLookupDismissBoundary } from "./AuthenticationLookupDismissBoundary";
import { AUTHENTICATION_ACCOUNT_FEEDBACK_EVENT } from "../../api/auth.api";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function renderBoundary() {
  await act(async () => {
    root.render(
      <AuthenticationLookupDismissBoundary>
        <input aria-label="Actor filter" role="combobox" />
        <div role="listbox" aria-label="Actor matches">
          <p>No Authorization Actor</p>
        </div>
        <input aria-label="Login" />
        <input aria-label="Temporary password" />
      </AuthenticationLookupDismissBoundary>,
    );
  });

  return container.querySelector<HTMLElement>(
    "[data-authentication-lookups-dismissed]",
  )!;
}

async function dispatch(target: Element, event: Event) {
  await act(async () => {
    target.dispatchEvent(event);
  });
}

describe("AuthenticationLookupDismissBoundary", () => {
  it("dismisses an open lookup when focus moves to the account fields", async () => {
    const boundary = await renderBoundary();
    const actorFilter = container.querySelector<HTMLInputElement>(
      'input[aria-label="Actor filter"]',
    )!;
    const login = container.querySelector<HTMLInputElement>(
      'input[aria-label="Login"]',
    )!;

    await dispatch(actorFilter, new FocusEvent("focusin", { bubbles: true }));
    expect(boundary.dataset.authenticationLookupsDismissed).toBe("false");

    await dispatch(login, new FocusEvent("focusin", { bubbles: true }));
    expect(boundary.dataset.authenticationLookupsDismissed).toBe("true");
  });

  it("dismisses with Escape and reopens when the lookup is used again", async () => {
    const boundary = await renderBoundary();
    const actorFilter = container.querySelector<HTMLInputElement>(
      'input[aria-label="Actor filter"]',
    )!;

    await dispatch(actorFilter, new FocusEvent("focusin", { bubbles: true }));
    await dispatch(
      actorFilter,
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    expect(boundary.dataset.authenticationLookupsDismissed).toBe("true");

    await dispatch(actorFilter, new Event("input", { bubbles: true }));
    expect(boundary.dataset.authenticationLookupsDismissed).toBe("false");
  });

  it("dismisses when the user clicks a no-results lookup notice", async () => {
    const boundary = await renderBoundary();
    const actorFilter = container.querySelector<HTMLInputElement>(
      'input[aria-label="Actor filter"]',
    )!;
    const noActorNotice = container.querySelector<HTMLElement>(
      '[role="listbox"] p',
    )!;

    await dispatch(actorFilter, new FocusEvent("focusin", { bubbles: true }));
    await dispatch(
      noActorNotice,
      new MouseEvent("pointerdown", { bubbles: true }),
    );
    expect(boundary.dataset.authenticationLookupsDismissed).toBe("true");
  });

  it("does not dismiss while selecting a lookup option", async () => {
    const boundary = await renderBoundary();
    const actorFilter = container.querySelector<HTMLInputElement>(
      'input[aria-label="Actor filter"]',
    )!;
    const listbox = container.querySelector<HTMLElement>('[role="listbox"]')!;
    const option = document.createElement("button");
    option.type = "button";
    option.setAttribute("role", "option");
    option.textContent = "Existing Actor";
    listbox.appendChild(option);

    await dispatch(actorFilter, new FocusEvent("focusin", { bubbles: true }));
    await dispatch(
      option,
      new MouseEvent("pointerdown", { bubbles: true }),
    );
    expect(boundary.dataset.authenticationLookupsDismissed).toBe("false");
  });

  it("allows Create account to submit when the selected Person has no Actor", async () => {
    await act(async () => {
      root.render(
        <AuthenticationLookupDismissBoundary>
          <form>
            <label>
              Authorization actor
              <input aria-label="Authorization actor" role="combobox" required />
            </label>
            <label>
              Login
              <input aria-label="Login" type="email" required />
            </label>
            <label>
              Temporary password
              <input aria-label="Temporary password" type="password" required />
            </label>
            <button type="submit" disabled>
              Create account
            </button>
          </form>
        </AuthenticationLookupDismissBoundary>,
      );
    });

    const actor = container.querySelector<HTMLInputElement>(
      'input[aria-label="Authorization actor"]',
    )!;
    const login = container.querySelector<HTMLInputElement>(
      'input[aria-label="Login"]',
    )!;
    const password = container.querySelector<HTMLInputElement>(
      'input[aria-label="Temporary password"]',
    )!;
    const button = container.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    )!;

    expect(actor.required).toBe(false);
    expect(login.required).toBe(true);
    expect(password.required).toBe(true);
    expect(button.disabled).toBe(false);
  });

  it("keeps Create account disabled while the account request is pending", async () => {
    await act(async () => {
      root.render(
        <AuthenticationLookupDismissBoundary>
          <form>
            <button type="submit" disabled>
              Creating…
            </button>
          </form>
        </AuthenticationLookupDismissBoundary>,
      );
    });

    expect(
      container.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled,
    ).toBe(true);
  });

  it("shows explicit account-creation success and failure feedback", async () => {
    await renderBoundary();

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(AUTHENTICATION_ACCOUNT_FEEDBACK_EVENT, {
          detail: {
            kind: "success",
            message: "Authentication account person@example.com created.",
          },
        }),
      );
    });
    expect(container.querySelector('[role="status"]')?.textContent).toContain(
      "person@example.com created",
    );

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(AUTHENTICATION_ACCOUNT_FEEDBACK_EVENT, {
          detail: {
            kind: "error",
            message:
              "Authentication account was not created. No Person in the selected tenant has this login email",
          },
        }),
      );
    });
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "was not created",
    );
  });

});
