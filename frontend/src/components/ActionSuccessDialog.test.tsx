import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActionSuccessDialog } from "./ActionSuccessDialog";

let container: HTMLDivElement;
let root: Root | null;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  document.body.removeChild(container);
});

describe("ActionSuccessDialog", () => {
  it("announces a completed action and requires explicit dismissal", async () => {
    const onDismiss = vi.fn();
    await act(async () => {
      root?.render(
        <ActionSuccessDialog
          message="Tenant Administrator assignment was revoked."
          onDismiss={onDismiss}
        />,
      );
    });

    const dialog = container.querySelector('[role="alertdialog"]');
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(dialog?.textContent).toContain("Action completed");
    expect(dialog?.textContent).toContain("Tenant Administrator assignment was revoked.");

    const button = [...container.querySelectorAll("button")].find(
      (node) => node.textContent === "Continue",
    );
    expect(button).toBeTruthy();
    await act(async () => button?.click());
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
