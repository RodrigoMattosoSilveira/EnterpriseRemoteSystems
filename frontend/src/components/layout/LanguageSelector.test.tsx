import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { I18nProvider, LOCALE_STORAGE_KEY } from "../../i18n";
import { LanguageSelector } from "./LanguageSelector";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  window.localStorage.removeItem(LOCALE_STORAGE_KEY);
  Object.defineProperty(window.navigator, "languages", {
    configurable: true,
    value: ["en-US"],
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  window.localStorage.removeItem(LOCALE_STORAGE_KEY);
});

describe("LanguageSelector", () => {
  it("persists an explicit pt-BR selection and translates itself", async () => {
    await act(async () => {
      root.render(
        <I18nProvider>
          <LanguageSelector />
        </I18nProvider>,
      );
    });

    const select = container.querySelector("select");
    if (!(select instanceof HTMLSelectElement)) throw new Error("language selector not found");

    await act(async () => {
      select.value = "pt-BR";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("pt-BR");
    expect(document.documentElement.lang).toBe("pt-BR");
    expect(container.textContent).toContain("Idioma");
    expect(container.textContent).toContain("Idioma do navegador");
  });

  it("returns to browser-derived locale without leaving a stored preference", async () => {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, "pt-BR");
    await act(async () => {
      root.render(
        <I18nProvider>
          <LanguageSelector />
        </I18nProvider>,
      );
    });

    const select = container.querySelector("select");
    if (!(select instanceof HTMLSelectElement)) throw new Error("language selector not found");

    await act(async () => {
      select.value = "browser";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBeNull();
    expect(document.documentElement.lang).toBe("en-US");
    expect(container.textContent).toContain("Language");
  });
});
