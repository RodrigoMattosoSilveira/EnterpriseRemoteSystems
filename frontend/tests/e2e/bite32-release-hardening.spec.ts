import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import {
  authzHeaders,
  e2eApiUrl,
  newTenantAdminApi,
} from "./support/authz";
import { isLoopbackURL } from "./support/runtime";

declare const process: { env: Record<string, string | undefined> };

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:15173";
const journeyPerson = {
  id: "e2e-bite32-journey-person",
  accountId: "e2e-bite32-journey-account",
  login: "e2e-bite32-journey@example.com",
  currentJourneyId: "e2e-bite32-current-journey",
  closedJourneyId: "e2e-bite32-closed-journey",
};
const rolePerson = {
  name: "E2E Bite 32 Role Person",
  login: "e2e-bite32-role-person@example.com",
  defaultActorId: "e2e-bite32-role-person-actor-default",
  otherTenantActorId:
    "e2e-bite32-role-person-actor-e2e-authz-role-tenant",
};
const otherRoleTenant = {
  id: "e2e-authz-role-tenant",
  name: "E2E Authorization Role Boundary",
};

test.describe("Bite 32.5 release-hardening journeys and authorization", () => {
  test("Tenant Administrator sees current and closed Journey history for one Person", async ({
    page,
  }) => {
    await page.goto(`/people/${encodeURIComponent(journeyPerson.id)}`);

    await expect(
      page.getByRole("heading", { name: "Journey History", exact: true }),
    ).toBeVisible();
    await expect(page.getByText(journeyPerson.currentJourneyId, { exact: false })).toBeVisible();
    await expect(page.getByText(journeyPerson.closedJourneyId, { exact: false })).toBeVisible();
    await expect(page.getByText("Current", { exact: true })).toBeVisible();
    await expect(page.getByText("Closed", { exact: true })).toBeVisible();
  });

  test("Person self-service keeps closed Journey Work and Credit Evidence durable", async ({
    browser,
  }) => {
    const { context, page } = await signedInJourneyPersonPage(browser);
    try {
      await expect(
        page.getByRole("heading", { name: "Journey History", exact: true }),
      ).toBeVisible();
      await expect(page.getByText(journeyPerson.currentJourneyId, { exact: false })).toBeVisible();
      await expect(page.getByText(journeyPerson.closedJourneyId, { exact: false })).toBeVisible();

      const closedJourneyCard = page
        .getByRole("article")
        .filter({ hasText: journeyPerson.closedJourneyId });
      await expect(closedJourneyCard).toContainText("Closed");
      await closedJourneyCard
        .getByRole("link", { name: "Open Journey", exact: true })
        .click();

      await expect(page).toHaveURL(
        new RegExp(`/collaborators/${journeyPerson.closedJourneyId}$`),
      );
      await expect(
        page.getByRole("status").filter({ hasText: "Journey Closed" }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", {
          name: "Work and Credit Evidence",
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Compensation rule", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Work recognized", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Earnings calculated", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", {
          name: "Current Account postings",
          exact: true,
        }),
      ).toBeVisible();

      const assignmentId = "e2e-bite32-work-assignment";
      const workRecognizedSection = page
        .getByRole("heading", { name: "Work recognized", exact: true })
        .locator("..");
      const earningsCalculatedSection = page
        .getByRole("heading", { name: "Earnings calculated", exact: true })
        .locator("..");
      const accountPostingsSection = page
        .getByRole("heading", { name: "Current Account postings", exact: true })
        .locator("..");

      await expect(workRecognizedSection.getByText(assignmentId, { exact: true })).toBeVisible();
      await expect(earningsCalculatedSection.getByText(assignmentId, { exact: true })).toBeVisible();
      await expect(accountPostingsSection.getByText(assignmentId, { exact: true })).toBeVisible();
      await expect(page.getByText("Daily BRL", { exact: true })).toBeVisible();
      await expect(page.getByText(/280\.00/).first()).toBeVisible();
      await expect(page.getByRole("heading", { name: "earning credit", exact: true })).toBeVisible();
      await expect(page.getByText("Credit posted", { exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: "payout", exact: true })).toBeVisible();
      await expect(page.getByText("Debit posted", { exact: true })).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test("another Tenant stays blocked until every non-baseline Role is explicitly removed without disclosure", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const sourceAdminApi = await newTenantAdminApi(otherRoleTenant.id);
    const defaultAdminApi = await newTenantAdminApi("default");
    let sourceEarningsGrant = "";
    let sourceExpenseGrant = "";
    let defaultExpenseGrant = "";

    try {
      sourceEarningsGrant = await grantOperatorRole(
        sourceAdminApi,
        otherRoleTenant.id,
        rolePerson.otherTenantActorId,
        "EARNINGS_OPERATOR",
      );
      sourceExpenseGrant = await grantOperatorRole(
        sourceAdminApi,
        otherRoleTenant.id,
        rolePerson.otherTenantActorId,
        "EXPENSE_OPERATOR",
      );

      await page.goto("/admin/authorization");
      await page.getByLabel("Filter People / Actors").fill(rolePerson.name);
      const actorCard = page
        .getByTestId("tenant-role-actor-card")
        .filter({ hasText: rolePerson.login });
      await expect(actorCard).toBeVisible();
      await expect(actorCard.getByText("Role in another Tenant", { exact: true })).toBeVisible();
      await expect(actorCard).toContainText(
        "This Person has one or more Roles in another Tenant. They must work with that Tenant to have every Role other than Membership and Collaborator removed before a Role can be assigned here.",
      );
      await expect(
        actorCard.getByRole("button", { name: "Role selector", exact: true }),
      ).toBeDisabled();
      await expect(actorCard).not.toContainText(otherRoleTenant.name);
      await expect(actorCard).not.toContainText(otherRoleTenant.id);
      await expect(actorCard).not.toContainText("EARNINGS_OPERATOR");
      await expect(actorCard).not.toContainText("EXPENSE_OPERATOR");

      const blockedGrant = await defaultAdminApi.post(
        e2eApiUrl(
          `/api/v1/authz/tenant-role-actors/${encodeURIComponent(rolePerson.defaultActorId)}/role-grants`,
        ),
        {
          headers: authzHeaders("default"),
          data: { roleCode: "EXPENSE_OPERATOR" },
        },
      );
      expect(blockedGrant.status()).toBe(400);
      const blockedBody = await blockedGrant.text();
      expect(blockedBody).toContain("one or more Roles in another Tenant");
      expect(blockedBody).not.toContain(otherRoleTenant.name);
      expect(blockedBody).not.toContain(otherRoleTenant.id);

      await revokeOperatorRole(
        sourceAdminApi,
        otherRoleTenant.id,
        rolePerson.otherTenantActorId,
        sourceEarningsGrant,
      );
      sourceEarningsGrant = "";

      await page.reload();
      await page.getByLabel("Filter People / Actors").fill(rolePerson.name);
      const partiallyReleasedCard = page
        .getByTestId("tenant-role-actor-card")
        .filter({ hasText: rolePerson.login });
      await expect(
        partiallyReleasedCard.getByText("Role in another Tenant", { exact: true }),
      ).toBeVisible();
      await expect(
        partiallyReleasedCard.getByRole("button", { name: "Role selector", exact: true }),
      ).toBeDisabled();

      await revokeOperatorRole(
        sourceAdminApi,
        otherRoleTenant.id,
        rolePerson.otherTenantActorId,
        sourceExpenseGrant,
      );
      sourceExpenseGrant = "";

      await page.reload();
      await page.getByLabel("Filter People / Actors").fill(rolePerson.name);
      const releasedCard = page
        .getByTestId("tenant-role-actor-card")
        .filter({ hasText: rolePerson.login });
      await expect(releasedCard.getByText("Role in another Tenant", { exact: true })).toHaveCount(0);
      await expect(
        releasedCard.getByRole("button", { name: "Role selector", exact: true }),
      ).toBeEnabled();

      defaultExpenseGrant = await grantOperatorRole(
        defaultAdminApi,
        "default",
        rolePerson.defaultActorId,
        "EXPENSE_OPERATOR",
      );

      const sourceActors = await listTenantRoleActors(
        sourceAdminApi,
        otherRoleTenant.id,
      );
      const sourceActor = sourceActors.find(
        (actor) => actor.id === rolePerson.otherTenantActorId,
      );
      expect(sourceActor?.hasDelegatedAuthorityInOtherTenant).toBe(true);
      const sourceActorJSON = JSON.stringify(sourceActor ?? {});
      expect(sourceActorJSON).not.toContain("Default Tenant");
      expect(sourceActorJSON).not.toContain("EXPENSE_OPERATOR");
    } finally {
      if (defaultExpenseGrant) {
        await revokeOperatorRole(
          defaultAdminApi,
          "default",
          rolePerson.defaultActorId,
          defaultExpenseGrant,
        ).catch(() => undefined);
      }
      if (sourceExpenseGrant) {
        await revokeOperatorRole(
          sourceAdminApi,
          otherRoleTenant.id,
          rolePerson.otherTenantActorId,
          sourceExpenseGrant,
        ).catch(() => undefined);
      }
      if (sourceEarningsGrant) {
        await revokeOperatorRole(
          sourceAdminApi,
          otherRoleTenant.id,
          rolePerson.otherTenantActorId,
          sourceEarningsGrant,
        ).catch(() => undefined);
      }
      await defaultAdminApi.dispose();
      await sourceAdminApi.dispose();
    }
  });
});

type TenantRoleActor = {
  id: string;
  hasDelegatedAuthorityInOtherTenant?: boolean;
};

function fixturePassword(): string {
  const password =
    process.env.E2E_TENANT_ADMIN_PASSWORD ||
    process.env.E2E_ADMIN_PASSWORD ||
    (isLoopbackURL(baseURL) ? "Local-E2E-Administrator-28D!" : "");
  if (!password) {
    throw new Error(
      "E2E_TENANT_ADMIN_PASSWORD is required for Bite 32 deployed E2E fixtures",
    );
  }
  return password;
}

async function signedInJourneyPersonPage(
  browser: Browser,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    baseURL,
    storageState: {
      cookies: [],
      origins: [
        {
          origin: new URL(baseURL).origin,
          localStorage: [
            { name: "ers.auth.selectedTenantId", value: "default" },
            {
              name: "ers.auth.selectedTenantAccountId",
              value: journeyPerson.accountId,
            },
          ],
        },
      ],
    },
  });
  const page = await context.newPage();
  const returnTo = `/people/${encodeURIComponent(journeyPerson.id)}`;
  await page.goto(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  await page.getByLabel("Login").fill(journeyPerson.login);
  await page.getByLabel("Password").fill(fixturePassword());
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(new URL(returnTo, baseURL).toString(), {
    timeout: 15_000,
  });
  return { context, page };
}

async function grantOperatorRole(
  api: APIRequestContext,
  tenantId: string,
  actorId: string,
  roleCode: "EARNINGS_OPERATOR" | "EXPENSE_OPERATOR",
): Promise<string> {
  const response = await api.post(
    e2eApiUrl(
      `/api/v1/authz/tenant-role-actors/${encodeURIComponent(actorId)}/role-grants`,
    ),
    {
      headers: authzHeaders(tenantId),
      data: { roleCode },
    },
  );
  if (response.status() !== 201) {
    throw new Error(
      `Grant ${roleCode} to ${actorId}: HTTP ${response.status()} ${await response.text()}`,
    );
  }
  const envelope = (await response.json()) as { data?: { id?: string } };
  if (!envelope.data?.id) {
    throw new Error(`Grant ${roleCode} response did not include a Role Grant ID`);
  }
  return envelope.data.id;
}

async function revokeOperatorRole(
  api: APIRequestContext,
  tenantId: string,
  actorId: string,
  grantId: string,
): Promise<void> {
  const response = await api.delete(
    e2eApiUrl(
      `/api/v1/authz/tenant-role-actors/${encodeURIComponent(actorId)}/role-grants/${encodeURIComponent(grantId)}`,
    ),
    { headers: authzHeaders(tenantId) },
  );
  if (response.status() !== 200) {
    throw new Error(
      `Revoke Role Grant ${grantId}: HTTP ${response.status()} ${await response.text()}`,
    );
  }
}

async function listTenantRoleActors(
  api: APIRequestContext,
  tenantId: string,
): Promise<TenantRoleActor[]> {
  const response = await api.get(e2eApiUrl("/api/v1/authz/tenant-role-actors"), {
    headers: authzHeaders(tenantId),
  });
  if (response.status() !== 200) {
    throw new Error(
      `List Tenant Role Actors for ${tenantId}: HTTP ${response.status()} ${await response.text()}`,
    );
  }
  const envelope = (await response.json()) as { data?: TenantRoleActor[] };
  return envelope.data ?? [];
}
