import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { applicationAdminHeaders, authzHeaders, e2eApiUrl } from "./support/authz";
import { applicationAdminStorageStatePath } from "./support/storage";
import { isLoopbackURL } from "./support/runtime";


test.use({
  storageState: applicationAdminStorageStatePath,
  extraHTTPHeaders: applicationAdminHeaders(),
});
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:15173";
const login = process.env.E2E_ADMIN_EMAIL ?? (isLoopbackURL(baseURL) ? "admin@example.com" : "");
const password = process.env.E2E_ADMIN_PASSWORD ?? (isLoopbackURL(baseURL) ? "Local-E2E-Administrator-28D!" : "");

const PERSON_STATUS_ACTIVE_ID = "ref-person-status-active";
const COLLABORATOR_STATUS_ACTIVE_ID = "ref-collaborator-status-active";
const PAYMENT_METHOD_DAILY_ID = "ref-method-daily";
const SECTOR_MINING_ID = "ref-sector-mining";
const LOCATION_MAIN_MINE_ID = "ref-location-main-mine";
const TASK_MINER_ID = "ref-task-miner";

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

test("authentication account form preserves its Person selection across window focus", async ({ page, request }) => {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 100_000)}`;
  const candidate = await provisionAuthenticationActorCandidate(
    request,
    `form-stability-${suffix}`,
  );
  const accountLogin = candidate.email;
  const temporaryPassword = `Auth-Form-${suffix}-Password!`;
  // This fixture intentionally remains active after the test. The Person and
  // Collaborator created for this progressive-search regression are already
  // persistent test data, and every run uses a unique suffix. Performing a
  // final actor-deactivation write here masks the actual browser assertion
  // whenever the test fails: Playwright tears down the request context at the
  // timeout boundary and the cleanup PATCH replaces the original error.
  // Keeping this fixture avoids teardown deadlocks and preserves the first
  // actionable failure from the regression itself.
  // The default Playwright page fixture already carries the Application
  // Administrator session produced by global setup. Do not call signIn()
  // here: navigating an already-authenticated page to /login immediately
  // redirects away from LoginPage, so the helper can never find its Login
  // field. This regression starts directly from the authenticated admin
  // context used by the rest of the suite.
  await page.goto("/admin/authentication");
  await expect(
    page.getByRole("heading", { name: "Authentication Accounts", exact: true }),
  ).toBeVisible();

  const personSearch = page.getByLabel(
    "Find Person by name, nickname, or email",
  );
  const searchResponsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === "GET" &&
      url.pathname === "/api/v1/people" &&
      url.searchParams.get("search") === candidate.nickname
    );
  });
  await personSearch.fill(candidate.nickname);
  expect((await searchResponsePromise).ok()).toBeTruthy();

  const matchingPeople = page.getByRole("listbox", {
    name: "Matching People for authentication account",
  });
  await expect(matchingPeople).toBeVisible();
  await matchingPeople
    .getByRole("option", { name: new RegExp(candidate.nickname) })
    .click();

  await page.getByLabel("Login").fill(accountLogin);
  await page.getByLabel("Temporary password").fill(temporaryPassword);
  await expect(page.getByText("Selected Person", { exact: true })).toBeVisible();
  await expect(page.getByText(candidate.nickname, { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create account" })).toBeEnabled();

  // Trigger the same window-focus event that RequireAuth listens for. Do not
  // use bringToFront() here: headless Chromium does not provide a real OS
  // window manager, so foreground-window control can block until the entire
  // Playwright test times out. The RequireAuth unit test separately proves
  // that this event starts authoritative session revalidation. This browser
  // regression is responsible for proving that the mounted form state is
  // preserved while that focus revalidation runs.
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

  const sessionResponse = await sessionResponsePromise;
  expect(sessionResponse.ok()).toBeTruthy();

  // RequireAuth explicitly listens to window focus and owns the authoritative
  // session check. TanStack Query v5 uses visibilitychange, not the window
  // focus event, for refetchOnWindowFocus, so this test must not require an
  // unrelated current-actor request from a synthetic focus event.
  // The focus-driven security check has completed. Authentication-page
  // datasets themselves deliberately do not refetch on focus, so moving to
  // another window cannot replace the candidate data under a partially
  // completed form.
  await expect(page).toHaveURL(/\/admin\/authentication$/);
  await expect(page.getByText("Selected Person", { exact: true })).toBeVisible();
  await expect(page.getByText(candidate.nickname, { exact: false })).toBeVisible();
  await expect(page.getByLabel("Login")).toHaveValue(accountLogin);
  await expect(page.getByLabel("Temporary password")).toHaveValue(temporaryPassword);
  await expect(page.getByRole("button", { name: "Create account" })).toBeEnabled();
});

test("authentication administration finds an existing collaborator actor and linked account by nickname", async ({ page, request }) => {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 100_000)}`;
  const candidate = await provisionAuthenticationActorCandidate(
    request,
    `actor-lookup-${suffix}`,
  );
  const accountLogin = `auth-lookup-${suffix}@example.com`;
  const accountPassword = `Auth-Lookup-${suffix}-Password!`;

  const accountResponse = await request.post(e2eApiUrl("/api/v1/auth/accounts"), {
    headers: applicationAdminHeaders(),
    data: {
      actorId: candidate.actorId,
      login: accountLogin,
      temporaryPassword: accountPassword,
      mustChangePassword: false,
    },
  });
  expect(accountResponse.status()).toBe(201);
  const accountEnvelope = (await accountResponse.json()) as {
    data?: { id?: string };
  };
  const accountId = accountEnvelope.data?.id;
  expect(accountId).toBeTruthy();

  const grantResponse = await request.post(
    e2eApiUrl(
      `/api/v1/authz/actors/${encodeURIComponent(candidate.actorId)}/role-grants`,
    ),
    {
      headers: applicationAdminHeaders(),
      data: { roleCode: "EXPENSE_OPERATOR", tenantId: "default" },
    },
  );
  expect(grantResponse.status()).toBe(201);

  await page.goto("/admin/authentication");
  await expect(
    page.getByRole("heading", { name: "Authentication Accounts", exact: true }),
  ).toBeVisible();

  const createSearchResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === "GET" &&
      url.pathname === "/api/v1/people" &&
      url.searchParams.get("search") === candidate.nickname
    );
  });
  await page
    .getByLabel("Find Person by name, nickname, or email")
    .fill(candidate.nickname);
  expect((await createSearchResponse).ok()).toBeTruthy();

  const createResult = page
    .getByRole("listbox", {
      name: "Matching People for authentication account",
    })
    .getByRole("option")
    .filter({ hasText: candidate.nickname });
  await expect(createResult).toBeVisible();
  await expect(createResult).toContainText(
    `Already has authentication account ${accountLogin} (active)`,
  );
  await expect(createResult).toHaveAttribute("aria-disabled", "true");

  const actorLookupResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === "GET" &&
      url.pathname === "/api/v1/people" &&
      url.searchParams.get("search") === candidate.nickname
    );
  });
  await page
    .getByLabel("Filter by Person name, nickname, or email, Tenant display name, Actor, or account")
    .fill(candidate.nickname);
  expect((await actorLookupResponse).ok()).toBeTruthy();

  const actorLookupResult = page
    .getByRole("list", { name: "Actor lookup results" })
    .getByRole("listitem")
    .filter({ hasText: candidate.nickname });
  await expect(actorLookupResult).toBeVisible();
  await expect(actorLookupResult).toContainText(
    `Actor: ${candidate.nickname} (${candidate.actorKey}) · Active`,
  );
  await expect(actorLookupResult).toContainText("EXPENSE_OPERATOR @ default");
  await expect(actorLookupResult).toContainText(
    `Authentication account: ${accountLogin} · Active`,
  );

  const filteredAccountCard = page.getByTestId(
    `authentication-account-${accountId}`,
  );
  await expect(filteredAccountCard).toBeVisible();
  await expect(
    filteredAccountCard.getByRole("button", { name: "Deactivate" }),
  ).toBeEnabled();

  const selectedTenantName = await page
    .getByLabel("Current tenant")
    .locator(":scope > span > span")
    .first()
    .innerText();
  expect(selectedTenantName.trim()).not.toBe("");

  await page
    .getByLabel("Filter by Person name, nickname, or email, Tenant display name, Actor, or account")
    .fill(selectedTenantName);
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
      notes: "Authentication Person lookup E2E candidate without Collaborator journey",
    },
  });
  expect(personResponse.status()).toBe(201);

  await page.goto("/admin/authentication");
  await expect(
    page.getByRole("heading", { name: "Authentication Accounts", exact: true }),
  ).toBeVisible();

  const createPersonLookupResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === "GET" &&
      url.pathname === "/api/v1/people" &&
      url.searchParams.get("search") === fullName
    );
  });
  await page
    .getByLabel("Find Person by name, nickname, or email")
    .fill(fullName);
  expect((await createPersonLookupResponse).ok()).toBeTruthy();

  const createPersonResult = page
    .getByRole("listbox", { name: "Matching People for authentication account" })
    .getByRole("option")
    .filter({ hasText: fullName });
  await expect(createPersonResult).toBeVisible();
  await expect(createPersonResult).toContainText(
    "Eligible; a tenant Actor will be created",
  );
  await createPersonResult.click();
  await expect(page.getByText("Selected Person", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Login")).toHaveValue(email);

  const temporaryPassword = `Dirceu-${suffix}-Password!`;
  await page.getByLabel("Temporary password").fill(temporaryPassword);
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
    data?: { id?: string; login?: string; actorId?: string };
  };
  expect(accountEnvelope.data?.id).toBeTruthy();
  expect(accountEnvelope.data?.actorId).toBeTruthy();
  expect(accountEnvelope.data?.login).toBe(email);
  await expect(
    page.getByTestId(`authentication-account-${accountEnvelope.data!.id!}`),
  ).toBeVisible();

  const personLookupResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === "GET" &&
      url.pathname === "/api/v1/people" &&
      url.searchParams.get("search") === fullName
    );
  });
  await page
    .getByLabel("Filter by Person name, nickname, or email, Tenant display name, Actor, or account")
    .fill(fullName);
  expect((await personLookupResponse).ok()).toBeTruthy();

  const result = page
    .getByRole("list", { name: "Actor lookup results" })
    .getByRole("listitem")
    .filter({ hasText: fullName });
  await expect(result).toBeVisible();
  await expect(result).toContainText(`Email: ${email}`);
  await expect(result).toContainText("Actor:");
  await expect(result).toContainText(`Authentication account: ${email} · Active`);
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

type PreparedAuthenticationActorCandidate = {
  actorId: string;
  actorKey: string;
  collaboratorId: string;
  personId: string;
  nickname: string;
  email: string;
};

async function provisionAuthenticationActorCandidate(
  request: APIRequestContext,
  keyPrefix: string,
): Promise<PreparedAuthenticationActorCandidate> {
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
      street1: "Rua Authentication 123",
      city: "Sao Paulo",
      state: "SP",
      cep: "01001000",
      country: "Brasil",
      bankName: "Banco E2E",
      bankNumber: "001",
      checkingAccount: `12345-${suffix.slice(-1)}`,
      pixKey: `pix-auth-candidate-${suffix}@example.com`,
      emergencyName: "Authentication Emergency",
      emergencyCellular: validBrazilianCellular(`${suffix}7`),
      emergencyEmail: `auth-candidate-emergency-${suffix}@example.com`,
      statusId: PERSON_STATUS_ACTIVE_ID,
      notes: "Authentication account progressive-filter E2E candidate",
    },
  });
  expect(personResponse.status()).toBe(201);
  const personEnvelope = (await personResponse.json()) as {
    data?: { id?: string };
  };
  const personId = personEnvelope.data?.id;
  expect(personId).toBeTruthy();

  const collaboratorResponse = await request.post(
    e2eApiUrl("/api/v1/collaborators"),
    {
      headers: authzHeaders(),
      data: {
        personId,
        journeyStartDate: "2026-08-01",
        paymentMethodId: PAYMENT_METHOD_DAILY_ID,
        paymentValue: 150,
        dailyBrlAmount: 150,
        sectorId: SECTOR_MINING_ID,
        locationId: LOCATION_MAIN_MINE_ID,
        taskId: TASK_MINER_ID,
        statusId: COLLABORATOR_STATUS_ACTIVE_ID,
        notes: "Authentication account progressive-filter E2E candidate",
      },
    },
  );
  expect(collaboratorResponse.status()).toBe(201);
  const collaboratorEnvelope = (await collaboratorResponse.json()) as {
    data?: { id?: string };
  };
  const collaboratorId = collaboratorEnvelope.data?.id;
  expect(collaboratorId).toBeTruthy();

  const actorKey = `collaborator-${collaboratorId}`;
  const actorResponse = await request.post(e2eApiUrl("/api/v1/authz/actors"), {
    headers: applicationAdminHeaders(),
    data: {
      actorKey,
      displayName: nickname,
      personId,
      collaboratorId,
      active: true,
    },
  });
  expect(actorResponse.status()).toBe(201);
  const actorEnvelope = (await actorResponse.json()) as { data?: { id?: string } };
  const actorId = actorEnvelope.data?.id;
  expect(actorId).toBeTruthy();

  // This Actor is intentionally not granted a delegated role yet. Bite 30D
  // allows Authentication Account creation from the active Membership; tenant
  // delegated Roles may be added only after the Account/Actor binding exists.
  return {
    actorId: actorId!,
    actorKey,
    collaboratorId: collaboratorId!,
    personId: personId!,
    nickname,
    email,
  };
}

type PreparedRoleAccount = {
  actorId: string;
  accountId: string;
  personId: string;
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

  const actorResponse = await request.post(e2eApiUrl("/api/v1/authz/actors"), {
    headers: applicationAdminHeaders(),
    data: {
      actorKey: login,
      displayName: `Authentication UX ${keyPrefix}`,
      personId,
      active: true,
    },
  });
  expect(actorResponse.status()).toBe(201);
  const actorEnvelope = (await actorResponse.json()) as { data?: { id?: string } };
  const actorId = actorEnvelope.data?.id;
  expect(actorId).toBeTruthy();

  // 30D identity comes first: Account -> tenant Actor -> ACTIVE Membership.
  // Delegated authority is additive and is granted only after that binding
  // exists.
  const accountResponse = await request.post(e2eApiUrl("/api/v1/auth/accounts"), {
    headers: applicationAdminHeaders(),
    data: {
      actorId,
      login,
      temporaryPassword: password,
      mustChangePassword,
    },
  });
  expect(accountResponse.status()).toBe(201);
  const accountEnvelope = (await accountResponse.json()) as {
    data?: { id?: string };
  };
  const accountId = accountEnvelope.data?.id;
  expect(accountId).toBeTruthy();

  const grantResponse = await request.post(
    e2eApiUrl(`/api/v1/authz/actors/${encodeURIComponent(actorId!)}/role-grants`),
    {
      headers: applicationAdminHeaders(),
      data: { roleCode, tenantId: "default" },
    },
  );
  expect(grantResponse.status()).toBe(201);

  return {
    actorId: actorId!,
    accountId: accountId!,
    personId: personId!,
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
