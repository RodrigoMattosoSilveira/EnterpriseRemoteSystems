import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { I18nProvider, useI18n } from "./I18nProvider";
import { LOCALE_STORAGE_KEY } from "./locale";

let container: HTMLDivElement;
let root: Root | null;

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.lang = "en";
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root?.unmount());
  document.body.removeChild(container);
});

function LocaleHarness() {
  const i18n = useI18n();
  return (
    <div>
      <output data-testid="locale">{i18n.locale}</output>
      <output data-testid="source">{i18n.localeSource}</output>
      <output data-testid="label">{i18n.t("locale.selectorLabel")}</output>
      <button type="button" onClick={() => i18n.setLocale("pt-BR")}>Português</button>
      <button type="button" onClick={() => i18n.setLocale("en-US")}>English</button>
      <button type="button" onClick={i18n.useBrowserLocale}>Browser</button>
    </div>
  );
}

function text(testId: string): string | null {
  return container.querySelector(`[data-testid="${testId}"]`)?.textContent ?? null;
}

function button(label: string): HTMLButtonElement {
  const match = [...container.querySelectorAll("button")].find(
    (candidate) => candidate.textContent === label,
  );
  if (!(match instanceof HTMLButtonElement)) {
    throw new Error(`Missing ${label} button`);
  }
  return match;
}

describe("I18nProvider", () => {
  it("exposes locale-aware resources, persists explicit selection, and synchronizes document language", async () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, "en-US");

    await act(async () => {
      root?.render(
        <I18nProvider>
          <LocaleHarness />
        </I18nProvider>,
      );
    });

    expect(text("locale")).toBe("en-US");
    expect(text("source")).toBe("stored");
    expect(text("label")).toBe("Language");
    expect(document.documentElement.lang).toBe("en-US");

    await act(async () => button("Português").click());

    expect(text("locale")).toBe("pt-BR");
    expect(text("source")).toBe("stored");
    expect(text("label")).toBe("Idioma");
    expect(document.documentElement.lang).toBe("pt-BR");
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("pt-BR");
  });

  it("reacts to locale preference changes made by another browser tab", async () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, "en-US");
    await act(async () => {
      root?.render(
        <I18nProvider>
          <LocaleHarness />
        </I18nProvider>,
      );
    });

    await act(async () => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: LOCALE_STORAGE_KEY,
          newValue: "pt-BR",
        }),
      );
    });

    expect(text("locale")).toBe("pt-BR");
    expect(text("label")).toBe("Idioma");
  });
});
