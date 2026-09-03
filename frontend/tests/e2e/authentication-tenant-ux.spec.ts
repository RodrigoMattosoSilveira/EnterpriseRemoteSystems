import { expect, request as playwrightRequest, test, type APIRequestContext, type Page } from "@playwright/test";
import { applicationAdminHeaders, authzHeaders, e2eApiUrl } from "./support/authz";
import { applicationAdminStorageStatePath } from "./support/storage";
import { isLoopbackURL } from "./support/runtime";


test.use({
  storageState: applicationAdminStorageStatePath,
});
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:15173";
const login = process.env.E2E_ADMIN_EMAIL ?? (isLoopbackURL(baseURL) ? "admin@example.com" : "");
const password = process.env.E2E_ADMIN_PASSWORD ?? (isLoopbackURL(baseURL) ? "Local-E2E-Administrator-28D!" : "");

const DEFAULT_TENANT_ID = "default";
const PERSON_STATUS_ACTIVE_ID = "ref-person-status-active";

type ReactivationLifecycleFixtures = {
  cookieLessPage: Page;
  adminReviewPage: Page;
  reactivationAccount: PreparedRoleAccount;
};

// This scenario deliberately owns two independent browser sessions plus a
// disposable Authentication Account. Keep all resource teardown in fixtures so
// Playwright gives teardown its own timeout budget instead of charging browser
// and database cleanup against the 60-second lifecycle workflow itself.
//
// Neither browser fixture overrides Playwright's storageState option globally,
// so the standard `request` fixture remains the authenticated Application
// Administrator used by provisioning and domain cleanup.
const reactivationLifecycleTest = test.extend<ReactivationLifecycleFixtures>({
  cookieLessPage: async ({ browser }, use) => {
    const context = await browser.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();

    try {
      await use(page);
    } finally {
      await context.close();
    }
  },

  adminReviewPage: async ({ browser }, use) => {
    const context = await browser.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();

    try {
      await use(page);
    } finally {
      await context.close();
    }
  },

  reactivationAccount: async ({ request }, use) => {
    const suffix = `${Date.now()}${Math.floor(Math.random() * 100_000)}`;
    const account = await provisionRoleAccount(
      request,
      `deactivation-${suffix}`,
      "EXPENSE_OPERATOR",
    );

    try {
      await use(account);
    } finally {
      await setAuthenticationAccountActive(request, account.accountId, true);
      await deactivateActor(request, account.actorId);
    }
  },
});

test("authenticated user can see identity, tenant, sign out, and sign back in", async ({ browser }) => {
  const context = await browser.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();
  try {
    await page.goto("/login");
    await page.getByLabel("Login").fill(login);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/admin\/tenants$/);
    await expect(page.getByText(login, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Administration context" })).toHaveAttribute(
      "data-selected-tenant-id",
      "*",
    );

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

    await page.getByLabel("Login").fill(login);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/admin\/tenants$/);
    await expect(page.getByText(login, { exact: true })).toBeVisible();
  } finally {
    await context.close();
  }
});

test("missing browser session redirects protected routes to login and restores the route", async ({ page, context }) => {
  await page.goto("/admin/tenants");
  await context.clearCookies();
  await page.reload();

  await expect(page).toHaveURL(/\/login\?returnTo=/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  await page.getByLabel("Login").fill(login);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/admin\/tenants$/);
  await expect(page.getByRole("heading", { name: "Tenants", exact: true })).toBeVisible();
});

test("a fresh cookie-less browser context does not inherit the administrator session", async ({ browser, page }) => {
  // The default Playwright page carries the globally authenticated
  // Application Administrator storage state. A separate browser context with
  // no cookies models a genuinely fresh private/incognito browsing session.
  await page.goto("/");
  await expect(page).toHaveURL(/\/admin\/tenants$/);
  await expect(page.getByText(login, { exact: true })).toBeVisible();

  const privateContext = await browser.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
  });
  const privatePage = await privateContext.newPage();

  try {
    expect(await privateContext.cookies()).toEqual([]);

    const sessionResponsePromise = privatePage.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === "GET" &&
        url.pathname === "/api/v1/auth/session"
      );
    });

    await privatePage.goto("/");

    const sessionResponse = await sessionResponsePromise;
    expect(sessionResponse.status()).toBe(204);
    await expect(privatePage).toHaveURL(/\/login\?returnTo=/);
    await expect(privatePage.getByRole("heading", { name: "Sign in" })).toBeVisible();

    // The authenticated administrator context remains independently signed in.
    await expect(page).toHaveURL(/\/admin\/tenants$/);
    await expect(page.getByText(login, { exact: true })).toBeVisible();
  } finally {
    await privateContext.close();
  }
});

test("password reset page accepts administrator-issued tokens", async ({ page }) => {
  await page.goto("/password/reset?token=sample-token");
  await expect(page.getByRole("heading", { name: "Reset password" })).toBeVisible();
  await expect(page.getByLabel("Reset token")).toHaveValue("sample-token");
});


test("active Account with no active tenant Actor retains Person self-service and recovers without re-login", async ({ browser, request }) => {
  test.setTimeout(60_000);
  const suffix = `${Date.now()}${Math.floor(Math.random() * 100_000)}`;
  const account = await provisionRoleAccount(
    request,
    `actor-lifecycle-${suffix}`,
    "EXPENSE_OPERATOR",
  );
  await setActorActive(request, account.actorId, false);

  const context = await browser.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();

  try {
    await signIn(page, account.login, account.password);
    await expect(page.getByRole("heading", { name: "Signed in" })).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Your personal information is still available",
      }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "You currently do not have access to work or administrative features. You can still view your personal information and read-only Current Account history below.",
      ),
    ).toBeVisible();
    const authenticatedAccount = page.locator("[data-authenticated-account-id]");
    await expect(authenticatedAccount).toHaveAttribute(
      "data-authenticated-account-id",
      account.accountId,
    );
    await expect(
      authenticatedAccount.locator("header").getByText(account.login, { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "My Person" })).toBeVisible();
    await expect(page.getByText(`Person ID: ${account.globalPersonId}`, { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "My Current Account" })).toBeVisible();
    await expect(
      page.getByText("No Current Account ledger entries are recorded for this Person."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Change password" })).toBeVisible();

    const selfServiceResponse = await context.request.get(
      e2eApiUrl("/api/v1/auth/self-service"),
    );
    expect(selfServiceResponse.status()).toBe(200);
    const selfServiceEnvelope = (await selfServiceResponse.json()) as {
      data?: {
        accountId?: string;
        person?: { id?: string; email?: string };
        balances?: unknown[];
        entries?: unknown[];
      };
    };
    expect(selfServiceEnvelope.data?.accountId).toBe(account.accountId);
    expect(selfServiceEnvelope.data?.person?.id).toBe(account.globalPersonId);
    expect(selfServiceEnvelope.data?.person?.email).toBe(account.login);
    expect(selfServiceEnvelope.data?.balances).toEqual([]);
    expect(selfServiceEnvelope.data?.entries).toEqual([]);

    const sessionResponse = await context.request.get(
      e2eApiUrl("/api/v1/auth/session"),
    );
    expect(sessionResponse.status()).toBe(200);
    const sessionEnvelope = (await sessionResponse.json()) as {
      data?: Record<string, unknown>;
    };
    expect(sessionEnvelope.data?.accountId).toBe(account.accountId);
    expect(sessionEnvelope.data).not.toHaveProperty("actorId");
    expect(sessionEnvelope.data).not.toHaveProperty("actorKey");

    await setActorActive(request, account.actorId, true);
    await page.reload();

    await expectPersonSelfServiceHome(page, account.personId);
    await expect(page.locator("[data-effective-actor-id]")).toHaveAttribute(
      "data-effective-actor-id",
      account.actorId,
    );
    await expect(page.locator("[data-effective-actor-id]")).toHaveAttribute(
      "data-effective-actor-scope",
      "TENANT",
    );
  } finally {
    await context.close();
    await setActorActive(request, account.actorId, false);
  }
});

test("application administrator remains in the global control plane when a Tenant is created", async ({ page, request }) => {
  test.setTimeout(60_000);
  const suffix = `${Date.now()}${Math.floor(Math.random() * 10_000)}`;

  const createResponse = await request.post(e2eApiUrl("/api/v1/tenants"), {
    headers: applicationAdminHeaders(),
    data: {
      code: `UX${suffix}`.slice(0, 20),
      name: `Tenant UX ${suffix}`,
      description: "Created by the Bite 30I.1 global-control-plane E2E test",
      active: true,
    },
  });
  if (createResponse.status() !== 201) {
    throw new Error(
      `Create tenant failed: HTTP ${createResponse.status()} ${await createResponse.text()}`,
    );
  }
  const created = (await createResponse.json()) as { data?: { id?: string; name?: string } };
  const tenantId = created.data?.id;
  expect(tenantId).toBeTruthy();

  await page.goto("/admin/tenants");
  await expect(page.getByRole("heading", { name: "Tenants", exact: true })).toBeVisible();
  await expect(page.getByText(`Tenant UX ${suffix}`, { exact: true })).toBeVisible();

  const selector = page.getByRole("button", { name: "Administration context" });
  await expect(selector).toHaveAttribute("data-selected-tenant-id", "*");
  await selector.click();
  await expect(page.locator(`[role="option"][data-tenant-id="${tenantId}"]`)).toHaveCount(0);

  const tenantPeopleResponse = await request.get(e2eApiUrl("/api/v1/people"), {
    headers: {
      "X-Actor-ID": "e2e-application-admin",
      "X-Tenant-ID": tenantId!,
    },
  });
  expect(tenantPeopleResponse.status()).toBe(403);
  const denied = (await tenantPeopleResponse.json()) as { error?: { code?: string } };
  expect(denied.error?.code).toBe("tenant_actor_unavailable");
});

test("authentication account form preserves its target Tenant and Person login across window focus", async ({ page, request }) => {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 100_000)}`;
  const candidate = await provisionAuthenticationPersonCandidate(
    request,
    `form-stability-${suffix}`,
  );
  const temporaryPassword = `Auth-Form-${suffix}-Password!`;

  await page.goto("/admin/authentication");
  await expect(
    page.getByRole("heading", { name: "Authentication Accounts", exact: true }),
  ).toBeVisible();

  await page.getByLabel("Target Tenant *").selectOption(DEFAULT_TENANT_ID);
  await page.getByLabel("Person login email *").fill(candidate.email);
  await page.getByLabel("Temporary password *").fill(temporaryPassword);
  await expect(page.getByRole("button", { name: "Create account" })).toBeEnabled();

  // Trigger RequireAuth's authoritative focus revalidation. The form is global
  // control-plane state and must remain intact while that session check runs.
  const sessionResponsePromise = page.waitForResponse(
    (response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === "GET" &&
        url.pathname === "/api/v1/auth/session"
      );
    },
    { timeout: 5_000 },
  );
  await page.evaluate(() => {
    window.dispatchEvent(new Event("blur"));
    window.dispatchEvent(new Event("focus"));
  });
  expect((await sessionResponsePromise).ok()).toBeTruthy();

  await expect(page).toHaveURL(/\/admin\/authentication$/);
  await expect(page.getByLabel("Target Tenant *")).toHaveValue(DEFAULT_TENANT_ID);
  await expect(page.getByLabel("Person login email *")).toHaveValue(candidate.email);
  await expect(page.getByLabel("Temporary password *")).toHaveValue(temporaryPassword);
  await expect(page.getByRole("button", { name: "Create account" })).toBeEnabled();
});

test("authentication administration finds an existing tenant Actor and linked account by nickname", async ({ page, request }) => {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 100_000)}`;
  const account = await provisionRoleAccount(
    request,
    `actor-lookup-${suffix}`,
    "EXPENSE_OPERATOR",
  );

  await page.goto("/admin/authentication");
  await expect(
    page.getByRole("heading", { name: "Authentication Accounts", exact: true }),
  ).toBeVisible();

  const filter = page.getByLabel(
    "Filter by Person name, nickname, or email, Tenant display name, Actor, or account",
  );
  await filter.fill(account.nickname);

  const filteredAccountCard = page.getByTestId(
    `authentication-account-${account.accountId}`,
  );
  await expect(filteredAccountCard).toBeVisible();
  await expect(filteredAccountCard).toContainText(account.login);
  await expect(filteredAccountCard).toContainText(account.nickname);
  await expect(
    filteredAccountCard.getByRole("button", { name: "Deactivate" }),
  ).toBeEnabled();

  await filter.fill("Default Tenant");
  await expect(filteredAccountCard).toBeVisible();
});

test("authentication administration creates an account for a Person who is not a Collaborator", async ({ page, request }) => {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 100_000)}`;
  const firstName = "Dirceu";
  const lastName = `Pereira${suffix}`;
  const fullName = `${firstName} ${lastName}`;
  const email = `dirceu-${suffix}@example.com`;

  const personResponse = await request.post(e2eApiUrl("/api/v1/people"), {
    headers: authzHeaders(),
    data: {
      firstName,
      lastName,
      nickname: `Dirceu${suffix}`,
      cpf: validCPF(Number(suffix.slice(-9))),
      rg: `RG-DIR-${suffix.slice(-8)}`,
      cellular: validBrazilianCellular(suffix),
      email,
      statusId: PERSON_STATUS_ACTIVE_ID,
      notes: "Authentication target-Tenant E2E candidate without Collaborator journey",
    },
  });
  expect(personResponse.status()).toBe(201);

  await page.goto("/admin/authentication");
  await expect(
    page.getByRole("heading", { name: "Authentication Accounts", exact: true }),
  ).toBeVisible();

  await page.getByLabel("Target Tenant *").selectOption(DEFAULT_TENANT_ID);
  await page.getByLabel("Person login email *").fill(email);
  const temporaryPassword = `Dirceu-${suffix}-Password!`;
  await page.getByLabel("Temporary password *").fill(temporaryPassword);
  await expect(page.getByRole("button", { name: "Create account" })).toBeEnabled();

  const createAccountResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === "POST" &&
      url.pathname === "/api/v1/auth/accounts"
    );
  });
  await page.getByRole("button", { name: "Create account" }).click();
  const accountResponse = await createAccountResponse;
  expect(accountResponse.status()).toBe(201);
  const accountEnvelope = (await accountResponse.json()) as {
    data?: {
      id?: string;
      login?: string;
      actors?: Array<{ actorId?: string; tenantId?: string }>;
    };
  };
  expect(accountEnvelope.data?.id).toBeTruthy();
  expect(accountEnvelope.data?.login).toBe(email);
  expect(
    accountEnvelope.data?.actors?.some(
      (actor) => actor.tenantId === DEFAULT_TENANT_ID && Boolean(actor.actorId),
    ),
  ).toBe(true);

  const accountCard = page.getByTestId(
    `authentication-account-${accountEnvelope.data!.id!}`,
  );
  await expect(accountCard).toBeVisible();
  await expect(accountCard).toContainText(fullName);
  await expect(accountCard).toContainText(email);

  await page
    .getByLabel("Filter by Person name, nickname, or email, Tenant display name, Actor, or account")
    .fill(fullName);
  await expect(accountCard).toBeVisible();
});

test("a temporary-password account can sign in after completing the required password change", async ({ page: adminPage, browser, request }) => {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 100_000)}`;
  const actorWithoutAccessLogin = `auth-no-access-${suffix}@example.com`;
  const actorWithoutAccessResponse = await request.post(
    e2eApiUrl("/api/v1/authz/actors"),
    {
      headers: applicationAdminHeaders(),
      data: {
        actorKey: actorWithoutAccessLogin,
        displayName: `Authentication UX no access ${suffix}`,
        active: true,
      },
    },
  );
  expect(actorWithoutAccessResponse.status()).toBe(201);
  const actorWithoutAccessEnvelope = (await actorWithoutAccessResponse.json()) as {
    data?: { id?: string };
  };
  const actorWithoutAccessId = actorWithoutAccessEnvelope.data?.id;
  expect(actorWithoutAccessId).toBeTruthy();

  const invalidAccountResponse = await request.post(
    e2eApiUrl("/api/v1/auth/accounts"),
    {
      headers: applicationAdminHeaders(),
      data: {
        actorId: actorWithoutAccessId,
        login: actorWithoutAccessLogin,
        temporaryPassword: `No-Access-${suffix}-Password!`,
        mustChangePassword: true,
      },
    },
  );
  expect(invalidAccountResponse.status()).toBe(400);
  const invalidAccountEnvelope = (await invalidAccountResponse.json()) as {
    error?: { fields?: Record<string, string> };
  };
  expect(invalidAccountEnvelope.error?.fields?.actorId).toContain(
    "active Person-Tenant Membership",
  );

  await adminPage.goto("/admin/authentication");
  await expect(
    adminPage.getByRole("option", {
      name: new RegExp(actorWithoutAccessLogin, "i"),
    }),
  ).toHaveCount(0);

  const account = await provisionRoleAccount(
    request,
    `password-change-${suffix}`,
    "EXPENSE_OPERATOR",
    true,
  );
  const newPassword = `Changed-${suffix}-Password!`;
  const context = await browser.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();

  try {
    await signIn(page, account.login, account.password);
    await expect(page).toHaveURL(/\/password\/change$/);
    await expect(
      page.getByRole("heading", { name: "Change password" }),
    ).toBeVisible();

    await page.getByLabel("Current password").fill(account.password);
    await page.getByLabel("New password", { exact: true }).fill(newPassword);
    await page.getByLabel("Confirm new password").fill(newPassword);
    await page.getByRole("button", { name: "Change password" }).click();

    await expect(page).toHaveURL(/\/login$/);
    await expect(
      page.getByText("Password changed. Sign in with your new password."),
    ).toBeVisible();

    const tenantOptionsResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === "GET" &&
        url.pathname === "/api/v1/auth/tenant-options"
      );
    });

    await signIn(page, account.login, newPassword);
    const tenantOptionsResponse = await tenantOptionsResponsePromise;
    expect(tenantOptionsResponse.ok()).toBeTruthy();
    const tenantOptionsEnvelope = (await tenantOptionsResponse.json()) as {
      data?: unknown;
    };
    expect(Array.isArray(tenantOptionsEnvelope.data)).toBeTruthy();

    await expectPersonSelfServiceHome(page, account.personId);
    await expect(
      page.getByRole("heading", { name: "Something went wrong" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Current tenant" }),
    ).toHaveAttribute("data-selected-tenant-id", "default");
  } finally {
    await context.close();
    await deactivateActor(request, account.actorId);
    if (actorWithoutAccessId) {
      await deactivateActor(request, actorWithoutAccessId);
    }
  }
});


test("administrator-issued password reset replaces the password and clears the active browser session", async ({ browser, request }) => {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 100_000)}`;
  const account = await provisionRoleAccount(
    request,
    `password-reset-${suffix}`,
    "EXPENSE_OPERATOR",
  );
  const newPassword = `Reset-${suffix}-Password!`;
  const context = await browser.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();
  const adminContext = await browser.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
  });
  const adminPage = await adminContext.newPage();

  try {
    await signIn(page, account.login, account.password);
    await expectPersonSelfServiceHome(page, account.personId);

    await signIn(adminPage, login, password);
    const accountsResponsePromise = adminPage.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === "GET" &&
        url.pathname === "/api/v1/auth/accounts"
      );
    });
    await adminPage.goto("/admin/authentication");
    const accountsResponse = await accountsResponsePromise;
    expect(accountsResponse.ok()).toBeTruthy();
    const accountsEnvelope = (await accountsResponse.json()) as {
      data?: Array<{ id?: string; login?: string }>;
    };
    expect(accountsEnvelope.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: account.accountId,
          login: account.login,
        }),
      ]),
    );

    const accountCard = adminPage.getByTestId(
      `authentication-account-${account.accountId}`,
    );
    await expect(accountCard).toBeVisible();
    const resetTokenResponsePromise = adminPage.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === "POST" &&
        url.pathname ===
          `/api/v1/auth/accounts/${account.accountId}/password-reset-tokens`
      );
    });
    await accountCard
      .getByRole("button", { name: "Issue reset token" })
      .click();
    const resetTokenResponse = await resetTokenResponsePromise;
    expect(resetTokenResponse.status()).toBe(201);
    await expect(adminPage).toHaveURL(/\/admin\/authentication$/);
    await expect(
      adminPage.getByRole("heading", {
        name: "Authentication Accounts",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      adminPage.getByRole("heading", { name: "Sign in", exact: true }),
    ).toHaveCount(0);
    await expect(
      adminPage.getByText(
        "Your authentication account is inactive. Request reactivation to regain access.",
      ),
    ).toHaveCount(0);
    const resetTokenEnvelope = (await resetTokenResponse.json()) as {
      data?: { accountId?: string; login?: string; token?: string };
    };
    expect(resetTokenEnvelope.data?.accountId).toBe(account.accountId);
    expect(resetTokenEnvelope.data?.login).toBe(account.login);
    await expect(
      adminPage.getByRole("heading", {
        name: `One-time reset token for ${account.login}`,
      }),
    ).toBeVisible();
    const resetToken = await adminPage
      .getByLabel("Password reset token")
      .textContent();
    expect(resetToken?.trim()).toBe(resetTokenEnvelope.data?.token);

    await page.goto(
      `/password/reset?token=${encodeURIComponent(resetToken!.trim())}`,
    );
    await expect(
      page.getByRole("heading", { name: "Reset password" }),
    ).toBeVisible();
    await page.getByLabel("New password", { exact: true }).fill(newPassword);
    await page.getByLabel("Confirm new password").fill(newPassword);
    const resetResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === "POST" &&
        url.pathname === "/api/v1/auth/password/reset"
      );
    });
    await page.getByRole("button", { name: "Reset password" }).click();
    const resetResponse = await resetResponsePromise;
    expect(resetResponse.status()).toBe(200);
    const resetEnvelope = (await resetResponse.json()) as {
      data?: { accountId?: string; login?: string; passwordChangedAt?: string };
    };
    expect(resetEnvelope.data?.accountId).toBe(account.accountId);
    expect(resetEnvelope.data?.login).toBe(account.login);
    expect(resetEnvelope.data?.passwordChangedAt).toBeTruthy();

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByLabel("Login")).toHaveValue(account.login);
    await expect(
      page.getByText(
        `Password reset for ${account.login}. Sign in with your new password.`,
      ),
    ).toBeVisible();

    const newPasswordLoginResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === "POST" &&
        url.pathname === "/api/v1/auth/login"
      );
    });
    await page.getByLabel("Password").fill(newPassword);
    await page.getByRole("button", { name: "Sign in" }).click();
    expect((await newPasswordLoginResponse).status()).toBe(200);
    await expectPersonSelfServiceHome(page, account.personId);

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);

    const oldPasswordLoginResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === "POST" &&
        url.pathname === "/api/v1/auth/login"
      );
    });
    await page.getByLabel("Login").fill(account.login);
    await page.getByLabel("Password").fill(account.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    expect((await oldPasswordLoginResponse).status()).toBe(401);
    await expect(
      page.getByText("The login or password is incorrect."),
    ).toBeVisible();
  } finally {
    await context.close();
    await adminContext.close();
    await deactivateActor(request, account.actorId);
  }
});


reactivationLifecycleTest(
  "deactivated authentication account loses its session and cannot sign in until reactivated",
  async ({
    cookieLessPage: page,
    adminReviewPage: adminPage,
    reactivationAccount: account,
    request,
  }) => {
    test.setTimeout(60_000);

    await signIn(page, account.login, account.password);
    await expectPersonSelfServiceHome(page, account.personId);

    await setAuthenticationAccountActive(request, account.accountId, false);

    await page.getByRole("link", { name: "Expenses section", exact: true }).click();
    await expect(page).toHaveURL(/\/login\?returnTo=/);
    await expect(
      page.getByText(
        "Your authentication account is inactive. Request reactivation to regain access.",
      ),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Reset a password" })).toHaveCount(0);

    const rejectedLoginResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === "POST" &&
        url.pathname === "/api/v1/auth/login"
      );
    });
    await page.getByLabel("Login").fill(account.login);
    await page.getByLabel("Password").fill(account.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    const rejectedResponse = await rejectedLoginResponse;
    expect(rejectedResponse.status()).toBe(401);
    const rejectedEnvelope = (await rejectedResponse.json()) as {
      error?: { code?: string };
    };
    expect(rejectedEnvelope.error?.code).toBe("account_inactive");
    await expect(page).toHaveURL(/\/login/);
    await expect(
      page.getByText(
        "Your authentication account is inactive. Request reactivation to regain access.",
      ),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Reset a password" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Request reactivation" })).toBeVisible();

    const reactivationResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === "POST" &&
        url.pathname === "/api/v1/auth/reactivation-requests"
      );
    });
    await page.getByRole("button", { name: "Request reactivation" }).click();
    const reactivationResponse = await reactivationResponsePromise;
    expect(reactivationResponse.status()).toBe(201);

    await expect(
      page.getByRole("heading", { name: "Reactivation requested" }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "Reactivation requested. An Application Administrator will review your request.",
      ),
    ).toBeVisible();
    await expect(page.getByLabel("Login")).toHaveCount(0);
    await expect(page.getByLabel("Password")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Return to sign in", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(
        "ERS does not currently send an email or in-app notification when the request is approved or rejected.",
      ),
    ).toBeVisible();
    await expect(
      page.getByText(
        "The Application Administrator reviewing the request must communicate the decision through the normal support channel.",
      ),
    ).toBeVisible();

    await signIn(adminPage, login, password);
    await expect(adminPage).toHaveURL(/\/admin\/tenants$/);

    const reactivationAlert = adminPage.getByRole("region", {
      name: "Pending account reactivation requests",
    });
    await expect(reactivationAlert).toBeVisible();
    await expect(reactivationAlert).toHaveClass(/border-red-500/);
    await expect(
      reactivationAlert.getByRole("link", { name: "Review requests" }),
    ).toBeVisible();

    await reactivationAlert.getByRole("link", { name: "Review requests" }).click();
    await expect(adminPage).toHaveURL(
      /\/admin\/authentication#account-reactivation-requests$/,
    );
    await expect(
      adminPage.getByRole("heading", { name: "Account reactivation requests" }),
    ).toBeVisible();

    const requestCard = adminPage
      .locator('section[aria-label="Account reactivation requests"] article')
      .filter({ hasText: account.login });
    await expect(requestCard).toBeVisible();
    await expect(requestCard.getByText(account.login, { exact: true })).toBeVisible();
    await expect(requestCard.getByText("Pending", { exact: true })).toBeVisible();

    await requestCard
      .getByLabel("Review reason")
      .fill("E2E account reactivation UX verification");
    const decisionResponsePromise = adminPage.waitForResponse(
      (response) => {
        const url = new URL(response.url());
        return (
          response.request().method() === "POST" &&
          url.pathname.startsWith("/api/v1/auth/reactivation-requests/") &&
          url.pathname.endsWith("/decision")
        );
      },
      { timeout: 10_000 },
    );
    await requestCard
      .getByRole("button", { name: "Approve reactivation" })
      .click();
    const decisionResponse = await decisionResponsePromise;
    expect(decisionResponse.status()).toBe(200);

    await expect(requestCard).toHaveCount(0);
    await expect(adminPage.getByText("0 pending", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Return to sign in" }).click();
    await expect(page.getByLabel("Login")).toBeVisible();
    await expect(page.getByLabel("Password")).toBeVisible();

    await signIn(page, account.login, account.password);
    await expectPersonSelfServiceHome(page, account.personId);
  },
);

test("signing in after a forbidden sign-out lands on the next account's first permitted page", async ({ browser, request }) => {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 100_000)}`;
  const earningsOperator = await provisionRoleAccount(
    request,
    `earnings-operator-${suffix}`,
    "EARNINGS_OPERATOR",
  );
  const expenseOperator = await provisionRoleAccount(
    request,
    `expense-operator-${suffix}`,
    "EXPENSE_OPERATOR",
  );
  const context = await browser.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();

  try {
    await signIn(page, earningsOperator.login, earningsOperator.password);
    await expectPersonSelfServiceHome(page, earningsOperator.personId);

    await page.goto("/admin/authentication");
    await expect(page).toHaveURL(/\/forbidden$/);
    await expect(page.getByRole("heading", { name: "Access forbidden" })).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await signIn(page, expenseOperator.login, expenseOperator.password);
    await expectPersonSelfServiceHome(page, expenseOperator.personId);
    await expect(page.getByRole("heading", { name: "Access forbidden" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Reference data" })).toHaveCount(0);

    await page.goto("/admin/reference-data");
    await expect(page).toHaveURL(/\/forbidden$/);
    await expect(
      page.getByRole("heading", { name: "Access forbidden" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Reference Data", exact: true }),
    ).toHaveCount(0);
  } finally {
    await context.close();
    await deactivateActor(request, earningsOperator.actorId);
    await deactivateActor(request, expenseOperator.actorId);
  }
});

type PreparedAuthenticationPersonCandidate = {
  personId: string;
  nickname: string;
  email: string;
};

async function provisionAuthenticationPersonCandidate(
  request: APIRequestContext,
  keyPrefix: string,
): Promise<PreparedAuthenticationPersonCandidate> {
  const suffix = keyPrefix.replace(/\D/g, "").slice(-12) || String(Date.now());
  const nickname = `AuthCandidate${suffix}`;
  const email = `auth-candidate-${suffix}@example.com`;
  const personResponse = await request.post(e2eApiUrl("/api/v1/people"), {
    headers: authzHeaders(),
    data: {
      firstName: "Authentication",
      lastName: `Candidate${suffix}`,
      nickname,
      cpf: validCPF(Number(suffix.slice(-9))),
      rg: `RG-AUTH-${suffix.slice(-8)}`,
      cellular: validBrazilianCellular(suffix),
      email,
      statusId: PERSON_STATUS_ACTIVE_ID,
      notes: "Authentication target-Tenant form E2E candidate",
    },
  });
  expect(personResponse.status()).toBe(201);
  const personEnvelope = (await personResponse.json()) as {
    data?: { id?: string };
  };
  const personId = personEnvelope.data?.id;
  expect(personId).toBeTruthy();
  return { personId: personId!, nickname, email };
}

type PreparedRoleAccount = {
  actorId: string;
  accountId: string;
  personId: string;
  nickname: string;
  globalPersonId: string;
  login: string;
  password: string;
};

async function provisionRoleAccount(
  request: APIRequestContext,
  keyPrefix: string,
  roleCode: "EARNINGS_OPERATOR" | "EXPENSE_OPERATOR",
  mustChangePassword = false,
): Promise<PreparedRoleAccount> {
  const login = `auth-${keyPrefix}@example.com`;
  const password = `E2E-${keyPrefix}-Password!`;
  const temporaryPassword = mustChangePassword
    ? password
    : `Temporary-${keyPrefix}-Password!`;
  const numericSuffix = keyPrefix.replace(/\D/g, "").slice(-12) || String(Date.now());
  // Two role fixtures can intentionally share the same timestamp suffix. Keep
  // their Person-level unique fields distinct by carrying a role discriminator
  // into the final digits used for CPF/RG/cellular generation.
  const roleDiscriminator = roleCode === "EARNINGS_OPERATOR" ? "1" : "2";
  const identitySuffix = `${numericSuffix.slice(-11)}${roleDiscriminator}`;

  const personResponse = await request.post(e2eApiUrl("/api/v1/people"), {
    headers: authzHeaders(),
    data: {
      firstName: "Authentication",
      lastName: `Role${identitySuffix}`,
      nickname: `AuthRole${identitySuffix}`,
      cpf: validCPF(Number(identitySuffix.slice(-9))),
      rg: `AR-${identitySuffix.slice(-8)}`,
      cellular: validBrazilianCellular(identitySuffix),
      email: login,
      statusId: PERSON_STATUS_ACTIVE_ID,
    },
  });
  expect(personResponse.status()).toBe(201);
  const personEnvelope = (await personResponse.json()) as {
    data?: { id?: string; globalPersonId?: string };
  };
  const personId = personEnvelope.data?.id;
  const globalPersonId = personEnvelope.data?.globalPersonId;
  expect(personId).toBeTruthy();
  expect(globalPersonId).toBeTruthy();

  // Provision the Authentication Account through the canonical Person + Tenant
  // path. The target Tenant is operation data; the Application Administrator
  // remains authorized in the global "*" control-plane context. The backend
  // resolves the Person, Membership, and canonical Tenant Actor atomically.
  const accountResponse = await request.post(e2eApiUrl("/api/v1/auth/accounts"), {
    headers: applicationAdminHeaders(),
    data: {
      tenantId: DEFAULT_TENANT_ID,
      login,
      temporaryPassword,
      mustChangePassword,
    },
  });
  expect(accountResponse.status()).toBe(201);
  const accountEnvelope = (await accountResponse.json()) as {
    data?: {
      id?: string;
      actors?: Array<{ actorId?: string; tenantId?: string }>;
    };
  };
  const accountId = accountEnvelope.data?.id;
  const tenantActor = accountEnvelope.data?.actors?.find(
    (candidate) => candidate.tenantId === DEFAULT_TENANT_ID,
  );
  const actorId = tenantActor?.actorId;
  expect(accountId).toBeTruthy();
  expect(actorId).toBeTruthy();

  const grantResponse = await request.post(
    e2eApiUrl(`/api/v1/authz/actors/${encodeURIComponent(actorId!)}/role-grants`),
    {
      headers: applicationAdminHeaders(),
      data: { roleCode, tenantId: DEFAULT_TENANT_ID },
    },
  );
  expect(grantResponse.status()).toBe(201);

  if (!mustChangePassword) {
    // Account provisioning deliberately requires a first-login password change.
    // Complete that lifecycle in an isolated API context so the shared
    // Application Administrator request fixture keeps its own session intact.
    const accountSession = await playwrightRequest.newContext({ baseURL });
    try {
      const loginResponse = await accountSession.post(e2eApiUrl("/api/v1/auth/login"), {
        data: { login, password: temporaryPassword },
      });
      expect(loginResponse.status()).toBe(200);
      const changeResponse = await accountSession.post(
        e2eApiUrl("/api/v1/auth/password/change"),
        {
          data: {
            currentPassword: temporaryPassword,
            newPassword: password,
          },
        },
      );
      expect(changeResponse.status()).toBe(204);
    } finally {
      await accountSession.dispose();
    }
  }

  return {
    actorId: actorId!,
    accountId: accountId!,
    personId: personId!,
    nickname: `AuthRole${identitySuffix}`,
    globalPersonId: globalPersonId!,
    login,
    password,
  };
}

async function expectPersonSelfServiceHome(
  page: Page,
  personId: string,
): Promise<void> {
  await expect(page).toHaveURL(
    new RegExp(`/people/${escapeRegExp(personId)}$`),
  );
  await expect(page.getByRole("button", { name: "Save Changes" })).toBeVisible();
}

function validCPF(seed: number): string {
  const base = String(seed).padStart(9, "0").slice(-9);
  const digits = base.split("").map(Number);
  const first = cpfCheckDigit(digits);
  const second = cpfCheckDigit([...digits, first]);
  return `${base}${first}${second}`;
}

function cpfCheckDigit(numbers: number[]): number {
  const weightStart = numbers.length + 1;
  const sum = numbers.reduce(
    (total, digit, index) => total + digit * (weightStart - index),
    0,
  );
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

function validBrazilianCellular(seed: number | string): string {
  const digits = String(seed).replace(/\D/g, "").padStart(8, "0").slice(-8);
  return `11${`9${digits}`.slice(0, 9)}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function signIn(
  page: Page,
  accountLogin: string,
  accountPassword: string,
): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Login").fill(accountLogin);
  await page.getByLabel("Password").fill(accountPassword);

  const loginResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === "POST" &&
      url.pathname === "/api/v1/auth/login"
    );
  });
  await page.getByRole("button", { name: "Sign in" }).click();
  const loginResponse = await loginResponsePromise;
  expect(loginResponse.status()).toBe(200);
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
}

async function setAuthenticationAccountActive(
  request: APIRequestContext,
  accountId: string,
  active: boolean,
): Promise<void> {
  const response = await request.patch(
    e2eApiUrl(`/api/v1/auth/accounts/${encodeURIComponent(accountId)}/active`),
    {
      headers: applicationAdminHeaders(),
      data: { active },
    },
  );
  expect(response.ok()).toBeTruthy();
}

async function setActorActive(
  request: APIRequestContext,
  actorId: string,
  active: boolean,
): Promise<void> {
  const response = await request.patch(
    e2eApiUrl(`/api/v1/authz/actors/${encodeURIComponent(actorId)}/active`),
    {
      headers: applicationAdminHeaders(),
      data: { active },
    },
  );
  expect(response.ok()).toBeTruthy();
}

async function deactivateActor(
  request: APIRequestContext,
  actorId: string,
): Promise<void> {
  await setActorActive(request, actorId, false);
}
