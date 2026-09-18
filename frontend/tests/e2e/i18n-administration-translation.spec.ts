import { expect, test } from "@playwright/test";
import { applicationAdminHeaders, seedBrowserApplicationAdmin } from "./support/authz";
import { applicationAdminStorageStatePath } from "./support/storage";

test.use({
  storageState: applicationAdminStorageStatePath,
  extraHTTPHeaders: applicationAdminHeaders(),
});

test.beforeEach(async ({ page }) => {
  await seedBrowserApplicationAdmin(page);
});

test.describe("Bite 31.2 Administration pt-BR", () => {
  test("translates the common shell, Administration context, Tenants, and Authentication surfaces", async ({ page }) => {
    await page.goto("/admin/tenants");

    await page.getByRole("combobox", { name: "Language" }).selectOption("pt-BR");
    await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");

    await expect(page.getByRole("heading", { name: "Administração", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tenants", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Criar Tenant", exact: true })).toBeVisible();
    await expect(page.getByText("Catálogo de Tenants do plano de controle", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Contexto de Administração atual" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Navegação principal" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Seção Autenticação" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sair" })).toBeVisible();

    await page.goto("/admin/authentication");
    await expect(page.getByRole("heading", { name: "Contas de Autenticação", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Criar conta", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Filtro de Ator/conta", exact: true })).toBeVisible();

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
    await expect(page.getByRole("heading", { name: "Contas de Autenticação", exact: true })).toBeVisible();
  });
});
