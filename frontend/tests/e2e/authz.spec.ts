import { expect, test, type Page } from "@playwright/test";

const ADMIN_ACTOR_ID = process.env.PLAYWRIGHT_AUTHZ_ADMIN_ACTOR_ID ?? "bootstrap-admin";
const ADMIN_TENANT_ID = process.env.PLAYWRIGHT_AUTHZ_ADMIN_TENANT_ID ?? "default";
const ROLE_TO_GRANT = "EXPENSE_OPERATOR";
const REQUEST_ACTOR_STORAGE_KEY = "ers.authzAdmin.requestActor";

test("admin can create an authorization actor and manage role grants", async ({ page }) => {

  const actorKey = `authz-e2e-${uniqueSuffix()}`;
  const displayName = `Authz E2E ${actorKey}`;

  await installAuthzAdminRequestActor(page);
  await page.goto("/admin/authorization");

  await expect(page.getByRole("heading", { name: "Authorization" })).toBeVisible();
  await expect(page.getByLabel("Actor ID / key", { exact: true })).toHaveValue(ADMIN_ACTOR_ID);
  await expect(page.getByLabel("Tenant ID", { exact: true })).toHaveValue(ADMIN_TENANT_ID);

  await page.getByLabel("Actor key", { exact: true }).fill(actorKey);
  await page.getByLabel("Display name").fill(displayName);

  const createResponsePromise = page.waitForResponse(
    (response) =>
      response.url().includes("/api/v1/authz/actors") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Create Actor" }).click();

  const createResponse = await createResponsePromise;
  const createResponseBody = await createResponse.text();
  expect(
    createResponse.ok(),
    `Create actor ${actorKey} failed: ${createResponse.status()} ${createResponseBody}`,
  ).toBeTruthy();

  const actorCard = await expectActorCard(page, actorKey);
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
  await installAuthzAdminRequestActor(page);
  await page.goto("/admin/authorization");

  await expect(page.getByRole("heading", { name: "Authorization" })).toBeVisible();
  await page.getByLabel("Actor ID / key", { exact: true }).fill(`missing-${uniqueSuffix()}`);
  await page.getByLabel("Tenant ID", { exact: true }).fill(ADMIN_TENANT_ID);

  await page.getByLabel("Actor key", { exact: true }).fill(`unauthorized-e2e-${uniqueSuffix()}`);
  await page.getByRole("button", { name: "Create Actor" }).click();

  await expect(page.getByText("Authorization actor is required", { exact: true })).toBeVisible();
  await expect(page.getByText(/Status: 401 · Code: missing_actor/i)).toBeVisible();
});

async function installAuthzAdminRequestActor(page: Page) {
  await page.addInitScript(
    ({ key, actorId, tenantId }) => {
      window.localStorage.setItem(key, JSON.stringify({ actorId, tenantId }));
    },
    {
      key: REQUEST_ACTOR_STORAGE_KEY,
      actorId: ADMIN_ACTOR_ID,
      tenantId: ADMIN_TENANT_ID,
    },
  );
}

async function expectActorCard(page: import("@playwright/test").Page, actorKey: string) {
  const actorCard = page.locator("article").filter({ hasText: actorKey }).first();

  try {
    await expect(actorCard).toBeVisible({ timeout: 10_000 });
    return actorCard;
  } catch {
    await page.reload();
    await expect(page.getByRole("heading", { name: "Authorization" })).toBeVisible();
    await page.getByLabel("Actor ID / key", { exact: true }).fill(ADMIN_ACTOR_ID);
    await page.getByLabel("Tenant ID", { exact: true }).fill(ADMIN_TENANT_ID);
    await expect(actorCard).toBeVisible({ timeout: 15_000 });
    return actorCard;
  }
}

function uniqueSuffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
