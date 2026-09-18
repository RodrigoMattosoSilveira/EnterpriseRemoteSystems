import { expect, test } from "@playwright/test";

const LOCALE_STORAGE_KEY = "ers.i18n.locale";

test.use({
  storageState: { cookies: [], origins: [] },
  extraHTTPHeaders: {},
});

test.describe("Bite 31.2 visible language selection", () => {
  test("switches the sign-in surface between en-US and pt-BR and persists the choice", async ({ page }) => {
    await page.goto("/login");

    const language = page.getByRole("combobox", { name: "Language" });
    await expect(language).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();

    await language.selectOption("pt-BR");

    await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
    await expect(page.getByRole("combobox", { name: "Idioma" })).toHaveValue("pt-BR");
    await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
    await expect(page.getByLabel("Senha")).toBeVisible();
    await expect(page.getByRole("link", { name: "Redefinir uma senha" })).toBeVisible();
    await expect
      .poll(() => page.evaluate((key) => localStorage.getItem(key), LOCALE_STORAGE_KEY))
      .toBe("pt-BR");

    // Repeated reloads must be idempotent. In particular, an outgoing page
    // must never rewrite stale in-memory locale state during teardown and make
    // the next page alternate between English and Portuguese.
    for (let reload = 0; reload < 4; reload += 1) {
      await page.reload();
      await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
      await expect(page.getByRole("combobox", { name: "Idioma" })).toHaveValue("pt-BR");
      await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
      await expect
        .poll(() => page.evaluate((key) => localStorage.getItem(key), LOCALE_STORAGE_KEY))
        .toBe("pt-BR");
    }

    // A browser may restore a native select independently of React after a
    // frontend rebuild. Simulate that DOM-only drift and verify the visible
    // selector snaps back to the provider's persisted pt-BR state.
    await page.getByRole("combobox", { name: "Idioma" }).evaluate((select) => {
      (select as HTMLSelectElement).value = "browser";
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: false }));
    });
    await expect(page.getByRole("combobox", { name: "Idioma" })).toHaveValue("pt-BR");
    await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();

    await page.getByRole("combobox", { name: "Idioma" }).selectOption("en-US");
    await expect(page.locator("html")).toHaveAttribute("lang", "en-US");
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
    await expect
      .poll(() => page.evaluate((key) => localStorage.getItem(key), LOCALE_STORAGE_KEY))
      .toBe("en-US");
  });
});
