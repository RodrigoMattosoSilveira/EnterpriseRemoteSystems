import { expect, test } from "@playwright/test";
import { seedBrowserAuthz } from "./support/authz";

test.beforeEach(async ({ page }) => {
  await seedBrowserAuthz(page);
});

test("admin can create an authorization actor, grant a role, and revoke it", async ({
  page,
}) => {
  const suffix = uniqueSuffix();
  const actorKey = `authz-e2e-${suffix}`;
  const displayName = `Authz E2E ${suffix}`;
  const grantedRole = "EXPENSE_OPERATOR";
  const grantTenant = "default";

  await page.goto("/admin/authorization");

  await expect(
    page.getByRole("heading", { name: "Authorization", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Admin request actor" }),
  ).toBeVisible();
  await expect(page.getByLabel("Actor ID / key")).toHaveValue(
    "bootstrap-admin",
  );
  await expect(page.getByLabel("Tenant ID")).toHaveValue("default");

  await expect(
    page.getByRole("heading", { name: "Actors", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Roles" })).toBeVisible();
  await expect(page.getByText("APPLICATION_ADMIN").first()).toBeVisible();
  await expect(page.getByText("authz.manage").first()).toBeVisible();

  await page.getByLabel("Actor key").fill(actorKey);
  await page.getByLabel("Display name").fill(displayName);
  await page.getByRole("button", { name: "Create Actor" }).click();

  await expect(page.getByRole("status")).toContainText(`${actorKey} created.`);

  const actorCard = page
    .getByTestId("authz-actor-card")
    .filter({
      has: page.getByRole("heading", { name: actorKey, exact: true }),
    });

  await expect(actorCard).toBeVisible();
  await expect(actorCard).toContainText(displayName);
  await expect(actorCard).toContainText("No role grants.");

  await actorCard.getByLabel("Role").selectOption(grantedRole);
  await actorCard.getByLabel("Grant tenant").fill(grantTenant);
  await actorCard.getByRole("button", { name: "Grant Role" }).click();

  await expect(page.getByRole("status")).toContainText(
    `${grantedRole} granted.`,
  );
  await expect(actorCard).toContainText(`${grantedRole} · ${grantTenant}`);

  await actorCard.getByRole("button", { name: "Revoke" }).click();

  await expect(page.getByRole("status")).toContainText(
    `${grantedRole} revoked.`,
  );
  await expect(
    actorCard.getByText(`${grantedRole} · ${grantTenant}`),
  ).toHaveCount(0);
  await expect(actorCard).toContainText("No role grants.");
});

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}
