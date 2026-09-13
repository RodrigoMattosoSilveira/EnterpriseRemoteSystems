import { expect, test } from "@playwright/test";

test("Tenant Administrator Actor cards expose a filterable Role selector", async ({ page }) => {
  await page.goto("/admin/authorization");

  await expect(
    page.getByRole("heading", { name: "Tenant Authorization", exact: true }),
  ).toBeVisible();

  const actorCard = page
    .getByTestId("tenant-role-actor-card")
    .filter({ hasText: "Actor Key: e2e-default-tenant-admin" });

  await expect(actorCard).toBeVisible();
  await expect(
    actorCard.getByRole("heading", { name: "Grant a Role", exact: true }),
  ).toBeVisible();
  await expect(
    actorCard.getByRole("heading", { name: "Current Role Grants", exact: true }),
  ).toBeVisible();

  const roleSelector = actorCard.getByRole("button", {
    name: "Role selector",
    exact: true,
  });
  await expect(roleSelector).toBeVisible();
  await expect(roleSelector).toBeEnabled();
  await expect(roleSelector).toContainText("Select a Role");
  await expect(roleSelector).toHaveAttribute("aria-expanded", "false");

  await roleSelector.click();

  const roleFilter = actorCard.getByRole("combobox", { name: "Filter roles" });
  const roleChoices = actorCard.getByRole("listbox", { name: "Role choices" });

  await expect(roleFilter).toBeVisible();
  await expect(
    roleChoices.getByRole("option", { name: /EARNINGS_OPERATOR/ }),
  ).toBeVisible();
  await expect(
    roleChoices.getByRole("option", { name: /EXPENSE_OPERATOR/ }),
  ).toBeVisible();
  await expect(
    roleChoices.getByRole("option", { name: /TENANT_ADMIN/ }),
  ).toHaveCount(0);

  await roleFilter.fill("expense");
  await expect(roleChoices.getByRole("option")).toHaveCount(1);
  await expect(
    roleChoices.getByRole("option", { name: /EXPENSE_OPERATOR/ }),
  ).toBeVisible();
  await expect(roleSelector).toContainText("Select a Role");

  await roleFilter.fill("");
  await roleChoices
    .getByRole("option", { name: /EXPENSE_OPERATOR/ })
    .click();

  await expect(roleSelector).toHaveAttribute("aria-expanded", "false");
  await expect(roleSelector).toContainText("EXPENSE_OPERATOR");

  await roleSelector.click();
  await expect(roleChoices.getByRole("option")).toHaveCount(2);
  await roleFilter.press("Escape");

  await expect(roleSelector).toHaveAttribute("aria-expanded", "false");
  await expect(roleSelector).toContainText("EXPENSE_OPERATOR");
});
