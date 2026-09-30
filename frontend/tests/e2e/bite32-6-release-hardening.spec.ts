import { expect, test } from "@playwright/test";
import { authzHeaders, seedBrowserAuthz } from "./support/authz";
import { tenantAdminStorageStatePath } from "./support/storage";

test.use({
  storageState: tenantAdminStorageStatePath,
  extraHTTPHeaders: authzHeaders(),
});

test.beforeEach(async ({ page }) => {
  await seedBrowserAuthz(page);
});

const personId = "e2e-bite32-journey-person";
const journeyId = "e2e-bite32-current-journey";

test.describe("Bite 32.6.6 integrated release hardening", () => {
  test("32.6.1 through 32.6.5 surfaces remain integrated in en-US and pt-BR", async ({ page }) => {
    await page.goto(`/people/${personId}`);
    await expect(page.getByRole("heading", { name: "Photo", exact: true })).toBeVisible();
    await expect(page.getByText("Add, replace, or remove the global Person photo.", { exact: false })).toBeVisible();

    await page.goto(`/collaborators/${journeyId}`);
    await expect(page.getByRole("heading", { name: "Journey Bonus", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Journey Extension Requests", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Propose Journey Extension", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Request Bonus Award", exact: true })).toBeVisible();

    await page.goto("/admin/authorization");
    const actorCard = page.getByTestId("tenant-role-actor-card").filter({ hasText: "Actor Key: e2e-default-tenant-admin" });
    await actorCard.getByRole("button", { name: "Role selector", exact: true }).click();
    const choices = actorCard.getByRole("listbox", { name: "Role choices" });
    await expect(choices.getByRole("option", { name: /TENANT_VIEWER/ })).toBeVisible();
    await expect(choices.getByRole("option", { name: /TENANT_ADMIN/ })).toBeVisible();

    await page.evaluate(() => localStorage.setItem("ers.i18n.locale", "pt-BR"));
    await page.goto(`/collaborators/${journeyId}`);
    await expect(page.getByRole("heading", { name: "Bônus da Jornada", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Solicitações de Extensão da Jornada", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Propor extensão da Jornada", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Solicitar bônus", exact: true })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Locatário");
    await expect(page.locator("body")).not.toContainText("bonus.");
  });
});
