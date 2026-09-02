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

test("application administrator can create a global authorization actor, grant a global role, and revoke it", async ({
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
  await expect(actorCard).toContainText("No role grants.");
  await expect(actorCard).toContainText("Tenant Role Grants: INELIGIBLE");

  await actorCard.getByLabel("Role").selectOption("APPLICATION_ADMIN");
  await expect(actorCard.getByLabel("Grant tenant")).toHaveValue("*");
  await expect(actorCard.getByLabel("Grant tenant")).toBeDisabled();
  await actorCard.getByRole("button", { name: "Grant Role" }).click();

  await expect(page.getByRole("status")).toContainText(
    "APPLICATION_ADMIN granted.",
  );
  await expect(actorCard).toContainText("APPLICATION_ADMIN · *");

  await page.reload();
  await expect(actorCard).toContainText("APPLICATION_ADMIN · *");

  await actorCard.getByRole("button", { name: "Revoke" }).click();
  await expect(page.getByRole("status")).toContainText(
    "APPLICATION_ADMIN revoked.",
  );
  await expect(actorCard.getByText("APPLICATION_ADMIN · *")).toHaveCount(0);
  await expect(actorCard).toContainText("No role grants.");
});
