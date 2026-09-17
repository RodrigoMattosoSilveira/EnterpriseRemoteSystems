import { expect, test } from "@playwright/test";

const LOCALE_STORAGE_KEY = "ers.i18n.locale";

test.describe("I18N locale lifecycle", () => {
  test("an open tab reconciles the shared locale preference when it regains focus", async ({
    context,
    page,
  }) => {
    await page.goto("/");
    await page.evaluate((key) => window.localStorage.setItem(key, "en-US"), LOCALE_STORAGE_KEY);
    await page.reload();
    await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe("en-US");

    const secondPage = await context.newPage();
    await secondPage.goto("/");
    await expect.poll(() => secondPage.evaluate(() => document.documentElement.lang)).toBe("en-US");

    await page.bringToFront();
    await page.evaluate((key) => window.localStorage.setItem(key, "pt-BR"), LOCALE_STORAGE_KEY);
    await secondPage.bringToFront();
    await expect.poll(() => secondPage.evaluate(() => document.documentElement.lang)).toBe("pt-BR");

    // A raw same-tab Local Storage write does not notify that tab with a
    // `storage` event. Explicitly dispatch the browser focus event consumed by
    // I18nProvider to exercise the missed-event reconciliation path. Playwright
    // `bringToFront()` changes the frontmost page in headless Chromium but does
    // not guarantee that the page receives a DOM `focus` event.
    await secondPage.evaluate((key) => window.localStorage.setItem(key, "en-US"), LOCALE_STORAGE_KEY);
    expect(await secondPage.evaluate(() => document.documentElement.lang)).toBe("pt-BR");

    await secondPage.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect.poll(() => secondPage.evaluate(() => document.documentElement.lang)).toBe("en-US");
    expect(
      await secondPage.evaluate((key) => window.localStorage.getItem(key), LOCALE_STORAGE_KEY),
    ).toBe("en-US");
  });
});
