import { expect, test } from "@playwright/test";

const LOCALE_STORAGE_KEY = "ers.i18n.locale";

test.describe("I18N locale lifecycle", () => {
  test("same-profile tabs share the locale preference and synchronize document language", async ({
    context,
    page,
  }) => {
    await page.goto("/");
    await page.evaluate((key) => window.localStorage.setItem(key, "en-US"), LOCALE_STORAGE_KEY);
    await page.reload();
    await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe("en-US");

    const secondPage = await context.newPage();
    await secondPage.goto("/");

    const firstOrigin = await page.evaluate(() => window.location.origin);
    const secondOrigin = await secondPage.evaluate(() => window.location.origin);
    expect(secondOrigin).toBe(firstOrigin);

    // Cross-tab locale propagation is a same-origin Web Storage contract.
    // Prove that both pages see the same storage area before testing the
    // provider's synchronization behavior. A null value here means the test
    // pages are not sharing the expected storage partition; no application
    // event/polling strategy can bridge a different origin/profile partition.
    await expect
      .poll(() =>
        secondPage.evaluate(
          (key) => window.localStorage.getItem(key),
          LOCALE_STORAGE_KEY,
        ),
      )
      .toBe("en-US");

    await expect.poll(() => secondPage.evaluate(() => document.documentElement.lang)).toBe("en-US");

    await page.bringToFront();
    await page.evaluate((key) => window.localStorage.setItem(key, "pt-BR"), LOCALE_STORAGE_KEY);
    await secondPage.bringToFront();

    await expect
      .poll(() =>
        secondPage.evaluate(
          (key) => window.localStorage.getItem(key),
          LOCALE_STORAGE_KEY,
        ),
      )
      .toBe("pt-BR");
    await expect.poll(() => secondPage.evaluate(() => document.documentElement.lang)).toBe("pt-BR");
  });
});
