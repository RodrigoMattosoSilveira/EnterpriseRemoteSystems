import { expect, test } from "@playwright/test";

const ADMIN_ACTOR_ID = process.env.PLAYWRIGHT_AUTHZ_ADMIN_ACTOR_ID ?? "bootstrap-admin";
const ADMIN_TENANT_ID = process.env.PLAYWRIGHT_AUTHZ_ADMIN_TENANT_ID ?? "default";
const ROLE_TO_GRANT = "EXPENSE_OPERATOR";

test("admin can create an authorization actor and manage role grants", async ({ page }) => {

  const actorKey = `authz-e2e-${uniqueSuffix()}`;
  const displayName = `Authz E2E ${actorKey}`;

  await page.goto("/admin/authorization");

  await expect(page.getByRole("heading", { name: "Authorization" })).toBeVisible();
  await page.getByLabel("Actor ID / key").fill(ADMIN_ACTOR_ID);
  await page.getByLabel("Tenant ID").fill(ADMIN_TENANT_ID);

  await expect(page.locator("article").filter({ hasText: ADMIN_ACTOR_ID }).first()).toBeVisible();
  await expect(page.getByLabel("Role").first()).toContainText(ROLE_TO_GRANT);

  await page.getByLabel("Actor key", { exact: true }).fill(actorKey);
  await page.getByLabel("Display name").fill(displayName);
  await page.getByRole("button", { name: "Create Actor" }).click();

  await expect(page.getByRole("status")).toContainText(`${actorKey} created.`);

  const actorCard = page.locator("article").filter({ hasText: actorKey }).first();
  await expect(actorCard).toBeVisible();
  await expect(actorCard).toContainText(displayName);
  await expect(actorCard.getByText("No role grants.")).toBeVisible();
  await expect(actorCard.getByLabel("Role")).toContainText(ROLE_TO_GRANT);

  await actorCard.getByLabel("Role").selectOption(ROLE_TO_GRANT);
  await actorCard.getByLabel("Grant tenant").fill(ADMIN_TENANT_ID);
  await actorCard.getByRole("button", { name: "Grant Role" }).click();

  await expect(page.getByRole("status")).toContainText(`${ROLE_TO_GRANT} granted.`);
  await expect(actorCard.locator("div").filter({ hasText: `${ROLE_TO_GRANT} · ${ADMIN_TENANT_ID}` }).first()).toBeVisible();

  await actorCard.getByRole("button", { name: "Revoke" }).click();

  await expect(page.getByRole("status")).toContainText(`${ROLE_TO_GRANT} revoked.`);
});

test("authorization admin page shows backend authorization errors", async ({ page }) => {
  await page.goto("/admin/authorization");

  await expect(page.getByRole("heading", { name: "Authorization" })).toBeVisible();
  await page.getByLabel("Actor ID / key").fill(`missing-${uniqueSuffix()}`);
  await page.getByLabel("Tenant ID").fill(ADMIN_TENANT_ID);

  await page.getByLabel("Actor key", { exact: true }).fill(`unauthorized-e2e-${uniqueSuffix()}`);
  await page.getByRole("button", { name: "Create Actor" }).click();

  await expect(page.getByText("Authorization actor is required", { exact: true })).toBeVisible();
  await expect(page.getByText(/Status: 401 · Code: missing_actor/i)).toBeVisible();
});

function uniqueSuffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
