import { expect, test } from "@playwright/test";
import { uniquePersonSuffix } from "./support/test-data";
import { applicationAdminHeaders, seedBrowserApplicationAdmin } from "./support/authz";
import { applicationAdminStorageStatePath } from "./support/storage";

test.use({
  storageState: applicationAdminStorageStatePath,
  extraHTTPHeaders: applicationAdminHeaders(),
});

test.beforeEach(async ({ page }) => {
  await seedBrowserApplicationAdmin(page);
});

test("application administrator can create an identity-neutral authorization actor without granting delegated authority", async ({
  page,
}, testInfo) => {
  const suffix = uniquePersonSuffix(testInfo.workerIndex);
  const actorKey = `global-authz-e2e-${suffix}`;
  const displayName = `Global Authorization E2E ${suffix}`;

  await page.goto("/admin/authorization");

  await expect(
    page.getByRole("heading", { name: "Application Authorization", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Authenticated authorization context" }),
  ).toBeVisible();
  await expect(page.getByLabel("Selected Tenant ID")).toHaveValue("*");
  await expect(page.getByText("Authenticated actor verified")).toBeVisible();

  const createForm = page.locator("form").filter({
    has: page.getByRole("heading", { name: "Create actor", exact: true }),
  });
  await createForm.getByLabel("Actor Key").fill(actorKey);
  await createForm.getByLabel("Display Name").fill(displayName);
  await createForm.getByRole("button", { name: "Create Actor" }).click();

  await expect(page.getByRole("status")).toContainText(`${actorKey} created.`);

  const actorCard = page
    .getByTestId("authz-actor-card")
    .filter({
      has: page.getByRole("heading", { name: actorKey, exact: true }),
    });

  await expect(actorCard).toBeVisible();
  await expect(actorCard).toContainText(displayName);
  await expect(actorCard).toContainText("No current Role Grants.");
  await expect(actorCard).toContainText("Tenant Role Grants: INELIGIBLE");
  await expect(actorCard).toContainText("Authentication Account binding is required.");

  const roleSelector = actorCard.getByRole("button", { name: "Role selector", exact: true });
  await expect(roleSelector).toBeDisabled();
  await expect(actorCard.getByRole("listbox", { name: "Role choices" })).toHaveCount(0);
  await expect(actorCard.getByRole("button", { name: "Grant Role" })).toBeDisabled();

  await page.reload();
  await expect(actorCard).toContainText("No current Role Grants.");
  await expect(actorCard.getByRole("button", { name: "Grant Role" })).toBeDisabled();
});

test("authorization Actor cards use a filterable Role selector", async ({ page }) => {
  await page.goto("/admin/authorization");

  const actorCard = page
    .getByTestId("authz-actor-card")
    .filter({
      has: page.getByRole("heading", {
        name: "e2e-default-tenant-admin",
        exact: true,
      }),
    });

  await expect(actorCard).toBeVisible();
  await expect(actorCard.getByRole("heading", { name: "Grant a Role", exact: true })).toBeVisible();
  await expect(
    actorCard.getByRole("heading", { name: "Current Role Grants", exact: true }),
  ).toBeVisible();

  const roleSelector = actorCard.getByRole("button", { name: "Role selector", exact: true });
  await expect(roleSelector).toContainText("Select a Role");
  await expect(roleSelector).toBeEnabled();
  await expect(roleSelector).toHaveAttribute("aria-expanded", "false");

  await roleSelector.click();

  const roleFilter = actorCard.getByRole("combobox", { name: "Filter roles" });
  const roleChoices = actorCard.getByRole("listbox", { name: "Role choices" });

  await expect(roleFilter).toBeVisible();
  await expect(roleChoices.getByRole("option")).not.toHaveCount(0);
  await expect(roleChoices.getByRole("option", { name: /EXPENSE_OPERATOR/ })).toBeVisible();
  await expect(roleChoices.getByRole("option", { name: /TENANT_ADMIN/ })).toBeVisible();

  await roleFilter.fill("expense");
  await expect(roleChoices.getByRole("option")).toHaveCount(1);
  await expect(roleChoices.getByRole("option", { name: /EXPENSE_OPERATOR/ })).toBeVisible();

  await roleFilter.fill("");
  await roleChoices
    .getByRole("option", { name: /EXPENSE_OPERATOR/ })
    .click();

  await expect(roleSelector).toHaveAttribute("aria-expanded", "false");
  await expect(roleSelector).toContainText("EXPENSE_OPERATOR");

  await roleSelector.click();
  await expect(roleChoices.getByRole("option", { name: /TENANT_ADMIN/ })).toBeVisible();

  await roleFilter.press("Escape");
  await expect(roleSelector).toHaveAttribute("aria-expanded", "false");
  await expect(roleSelector).toContainText("EXPENSE_OPERATOR");
});
