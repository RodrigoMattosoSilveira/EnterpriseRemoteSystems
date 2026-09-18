import { expect, test } from "@playwright/test";
import { seedBrowserAuthz } from "./support/authz";

test.describe("Bite 31.3 core business journey pt-BR", () => {
  test.beforeEach(async ({ page }) => {
    await seedBrowserAuthz(page);
    await page.addInitScript(() => {
      window.localStorage.setItem("ers.i18n.locale", "pt-BR");
    });
  });

  test("keeps the Tenant business workbenches in Brazilian Portuguese", async ({ page }) => {
    const surfaces = [
      { path: "/people", heading: "Pessoas" },
      { path: "/collaborators", heading: "Colaboradores" },
      { path: "/work-periods", heading: "Períodos de trabalho" },
      { path: "/expenses", heading: "Despesas" },
      { path: "/receipts/outstanding", heading: "Recibos pendentes" },
    ];

    for (const surface of surfaces) {
      await page.goto(surface.path);
      await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
      await expect(page.getByRole("heading", { name: surface.heading, exact: true })).toBeVisible();
      await expect
        .poll(() => page.evaluate(() => window.localStorage.getItem("ers.i18n.locale")))
        .toBe("pt-BR");
    }
  });

  test("renders Work Period start and end as deterministic 24-hour pt-BR fields", async ({ page }) => {
    await page.goto("/work-periods");
    await page.getByRole("button", { name: "Adicionar Período de Trabalho" }).click();

    const start = page.getByLabel("Início *");
    const end = page.getByLabel("Fim *");

    await expect(start).toHaveAttribute("type", "text");
    await expect(start).toHaveAttribute("inputmode", "numeric");
    await expect(start).toHaveValue("06:00");
    await expect(end).toHaveAttribute("type", "text");
    await expect(end).toHaveAttribute("inputmode", "numeric");
    await expect(end).toHaveValue("18:00");
  });
});
