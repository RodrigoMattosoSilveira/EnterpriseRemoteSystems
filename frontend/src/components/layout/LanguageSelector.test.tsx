import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  vi.restoreAllMocks();
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


  it("re-establishes an explicit locale preference after a transient Local Storage write failure", async () => {
    const nativeSetItem = Storage.prototype.setItem;
    let failedLocaleWrite = false;
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
      this: Storage,
      key: string,
      value: string,
    ) {
      if (key === LOCALE_STORAGE_KEY && !failedLocaleWrite) {
        failedLocaleWrite = true;
        throw new DOMException("simulated transient storage failure", "QuotaExceededError");
      }
      return nativeSetItem.call(this, key, value);
    });

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

    expect(failedLocaleWrite).toBe(true);
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("pt-BR");
    expect(document.documentElement.lang).toBe("pt-BR");

    const activeSelect = container.querySelector("select");
    if (!(activeSelect instanceof HTMLSelectElement)) throw new Error("language selector not found");
    expect(activeSelect.value).toBe("pt-BR");
    expect(container.textContent).toContain("Idioma");

    setItemSpy.mockRestore();

    // If the preference disappears while this mounted provider still owns an
    // explicit locale, page teardown for a frontend rebuild must re-establish
    // the canonical value before the provider is recreated.
    window.localStorage.removeItem(LOCALE_STORAGE_KEY);
    await act(async () => window.dispatchEvent(new Event("pagehide")));
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("pt-BR");

    // A frontend rebuild/full reload recreates the provider. The repaired
    // preference must therefore be sufficient to restore Portuguese without
    // relying on the previous in-memory React state.
    await act(async () => root.unmount());
    container.replaceChildren();
    root = createRoot(container);
    await act(async () => {
      root.render(
        <I18nProvider>
          <LanguageSelector />
        </I18nProvider>,
      );
    });

    const remountedSelect = container.querySelector("select");
    if (!(remountedSelect instanceof HTMLSelectElement)) throw new Error("language selector not found");
    expect(remountedSelect.value).toBe("pt-BR");
    expect(document.documentElement.lang).toBe("pt-BR");
    expect(container.textContent).toContain("Idioma");
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
