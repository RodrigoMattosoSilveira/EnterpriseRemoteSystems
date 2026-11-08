import { expect, test, type Page } from "@playwright/test";
import { seedBrowserAuthz } from "./support/authz";

// Bite 34.1 (#1056): screens translated in Bite 34.1 render in pt-BR, and a
// real backend validation error is shown in Portuguese through its error and
// field rule codes (not the server's English text).

// Lazy admin routes can need more than the global 5-second expect timeout on a
// cold Vite dev server.
const ROUTE_TIMEOUT = 30_000;

test.describe("Bite 34.1 pt-BR completion", () => {
  test.beforeEach(async ({ page }) => {
    await seedBrowserAuthz(page);
    await page.addInitScript(() => {
      window.localStorage.setItem("ers.i18n.locale", "pt-BR");
    });
  });

  test("renders the Tenant administration screens in Brazilian Portuguese", async ({ page }) => {
    const surfaces = [
      { path: "/admin/price-list-items", heading: "Itens da lista de preços" },
      { path: "/admin/gold-prices", heading: "Preços do ouro" },
      { path: "/admin/reference-data", heading: "Dados de referência" },
      { path: "/admin/current-account-settings", heading: "Configurações da Conta Corrente" },
    ];

    for (const surface of surfaces) {
      await page.goto(surface.path);
      await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
      await expect(page.getByRole("heading", { name: surface.heading, exact: true })).toBeVisible({
        timeout: ROUTE_TIMEOUT,
      });
    }
  });

  test("shows a backend validation error in Portuguese", async ({ page }) => {
    const suffix = `${Date.now().toString().slice(-9)}${Math.floor(Math.random() * 1000)}`;
    const code = `E2E_PTBR_${suffix}`;

    await page.goto("/admin/price-list-items");
    await expect(page.getByRole("heading", { name: "Itens da lista de preços", exact: true })).toBeVisible({
      timeout: ROUTE_TIMEOUT,
    });

    const firstDescription = `E2E pt-BR item ${suffix}`;
    const created = await submitPriceListItem(page, code, firstDescription, "11.25");
    expect(created.ok()).toBeTruthy();
    await expect(page.getByRole("status")).toContainText(`Item da lista de preços criado: ${firstDescription}.`);
    // Money follows the selected language (pt-BR) while the currency stays BRL.
    await expect(page.getByRole("row").filter({ hasText: firstDescription })).toContainText(/R\$\s11,25/);

    // Same code and category again: the backend rejects it with
    // fieldCodes.code = "duplicate_active_code".
    const rejected = await submitPriceListItem(page, code, `E2E pt-BR duplicate ${suffix}`, "12.50");
    expect(rejected.status()).toBe(400);
    const body = await rejected.json();
    expect(body.error.fieldCodes?.code).toBe("duplicate_active_code");

    await expect(page.getByText("Alguns campos precisam de correção.", { exact: true })).toBeVisible();
    await expect(page.getByText("Um item ativo já usa este código nesta categoria")).toBeVisible();
    await expect(page.getByText("Código:", { exact: true })).toBeVisible();
    await expect(page.getByText("Validation failed")).toHaveCount(0);
    await expect(page.getByText("An active price-list item already uses this code")).toHaveCount(0);
  });
});

async function submitPriceListItem(page: Page, code: string, description: string, unitPriceBrl: string) {
  const form = page.locator("form").filter({ hasText: "Criar item da lista de preços" });
  if ((await form.count()) === 0) {
    await page.getByRole("button", { name: "Adicionar item à lista de preços" }).click();
  }
  await expect(form).toBeVisible();

  await form.getByLabel("Categoria").selectOption("CANTEEN");
  await form.getByLabel("Código").fill(code);
  await form.getByLabel("Descrição").fill(description);
  await form.getByLabel("Preço unitário em BRL").fill(unitPriceBrl);
  await form.getByLabel("Ordem de exibição").fill("90");

  const response = page.waitForResponse((candidate) => {
    const url = new URL(candidate.url());
    return url.pathname.endsWith("/api/v1/price-list-items") && candidate.request().method() === "POST";
  });
  await form.getByRole("button", { name: "Criar item" }).click();
  return response;
}
