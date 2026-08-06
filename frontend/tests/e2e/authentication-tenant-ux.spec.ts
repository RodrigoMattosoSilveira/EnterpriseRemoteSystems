import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { authzHeaders, e2eApiUrl } from "./support/authz";
import { isLoopbackURL } from "./support/runtime";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:15173";
const login = process.env.E2E_ADMIN_EMAIL ?? (isLoopbackURL(baseURL) ? "admin@example.com" : "");
const password = process.env.E2E_ADMIN_PASSWORD ?? (isLoopbackURL(baseURL) ? "Local-E2E-Administrator-28D!" : "");

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

    await expect(page).toHaveURL(/\/people$/);
    await expect(page.getByText(login, { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Current tenant" })).toHaveAttribute(
      "data-selected-tenant-id",
      "default",
    );

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

    await page.getByLabel("Login").fill(login);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page).toHaveURL(/\/people$/);
    await expect(page.getByText(login, { exact: true })).toBeVisible();
  } finally {
    await context.close();
  }
});

test("missing browser session redirects protected routes to login and restores the route", async ({ page, context }) => {
  await page.goto("/people");
  await context.clearCookies();
  await page.reload();

  await expect(page).toHaveURL(/\/login\?returnTo=/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();

  await page.getByLabel("Login").fill(login);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page).toHaveURL(/\/people$/);
  await expect(page.getByRole("heading", { name: "People", exact: true })).toBeVisible();
});

test("password reset page accepts administrator-issued tokens", async ({ page }) => {
  await page.goto("/password/reset?token=sample-token");
  await expect(page.getByRole("heading", { name: "Reset password" })).toBeVisible();
  await expect(page.getByLabel("Reset token")).toHaveValue("sample-token");
});


test("application administrator can switch between granted tenants", async ({ page, request }) => {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 10_000)}`;
  const defaultOnlyNickname = `DefaultTenantOnly${suffix}`;
  const defaultOnlyTaskCode = `TENANT_TASK_${suffix}`.slice(0, 40).toUpperCase();
  const defaultOnlyTaskLabel = `Default Tenant Task ${suffix}`;
  const defaultOnlyPriceListCode = `TENANT_PRICE_${suffix}`.slice(0, 40).toUpperCase();
  const defaultOnlyPriceListDescription = `Default Tenant Price Item ${suffix}`;
  const defaultOnlyGoldPriceDate = uniqueGoldPriceDate(suffix);
  const personResponse = await request.post(e2eApiUrl("/api/v1/people"), {
    headers: authzHeaders(),
    data: {
      firstName: "Default",
      lastName: `TenantOnly${suffix}`,
      nickname: defaultOnlyNickname,
      cpf: validCPF(Number(suffix.slice(-9))),
      rg: `RG-${suffix.slice(-8)}`,
      cellular: validBrazilianCellular(suffix),
      email: `tenant-isolation-${suffix}@example.com`,
      statusId: "ref-person-status-active",
    },
  });
  expect(personResponse.status()).toBe(201);

  const taskResponse = await request.post(
    e2eApiUrl("/api/v1/reference-data/task"),
    {
      headers: authzHeaders(),
      data: {
        code: defaultOnlyTaskCode,
        label: defaultOnlyTaskLabel,
        description: "Created in default to verify Reference Data tenant isolation",
        active: true,
        sortOrder: 9_999,
        metadataJson: "",
      },
    },
  );
  expect(taskResponse.status()).toBe(201);
  const taskEnvelope = (await taskResponse.json()) as { data?: { id?: string } };
  const defaultOnlyTaskId = taskEnvelope.data?.id;
  expect(defaultOnlyTaskId).toBeTruthy();

  const priceListItemResponse = await request.post(
    e2eApiUrl("/api/v1/price-list-items"),
    {
      headers: authzHeaders(),
      data: {
        itemType: "CANTEEN",
        code: defaultOnlyPriceListCode,
        description: defaultOnlyPriceListDescription,
        unitPriceBrl: 321.45,
        sortOrder: 9_999,
      },
    },
  );
  expect(priceListItemResponse.status()).toBe(201);
  const priceListItemEnvelope = (await priceListItemResponse.json()) as {
    data?: { id?: string };
  };
  const defaultOnlyPriceListItemId = priceListItemEnvelope.data?.id;
  expect(defaultOnlyPriceListItemId).toBeTruthy();

  const goldPriceResponse = await request.post(e2eApiUrl("/api/v1/gold-prices"), {
    headers: authzHeaders(),
    data: {
      priceDate: defaultOnlyGoldPriceDate,
      brlPerGram: 654.32,
      recordedBy: "bootstrap-admin",
      notes: `Default tenant gold price ${suffix}`,
    },
  });
  expect(goldPriceResponse.status()).toBe(201);
  const goldPriceEnvelope = (await goldPriceResponse.json()) as {
    data?: { id?: string };
  };
  const defaultOnlyGoldPriceId = goldPriceEnvelope.data?.id;
  expect(defaultOnlyGoldPriceId).toBeTruthy();

  await page.goto("/people");
  await page.getByLabel("Filter people").fill(defaultOnlyNickname);
  await expect(page.getByText(defaultOnlyNickname, { exact: false }).first()).toBeVisible();

  const createResponse = await request.post(e2eApiUrl("/api/v1/tenants"), {
    headers: authzHeaders(),
    data: {
      code: `UX${suffix}`.slice(0, 20),
      name: `Tenant UX ${suffix}`,
      description: "Created by the Bite 28D tenant-selection E2E test",
      active: true,
    },
  });
  expect(createResponse.status()).toBe(201);
  const created = (await createResponse.json()) as { data?: { id?: string } };
  const tenantId = created.data?.id;
  expect(tenantId).toBeTruthy();

  try {
    await page.goto("/");
    const selector = page.getByRole("button", { name: "Current tenant" });
    await selector.click();
    await page.getByLabel("Filter tenants").fill(`Tenant UX ${suffix}`);

    const tenantOption = page.locator(
      `[role="option"][data-tenant-id="${tenantId}"]`,
    );
    await expect(tenantOption).toBeVisible();
    await tenantOption.click();

    await expect(selector).toHaveAttribute("data-selected-tenant-id", tenantId!);
    await expect
      .poll(() =>
        page.evaluate(() =>
          window.localStorage.getItem("ers.auth.selectedTenantId"),
        ),
      )
      .toBe(tenantId);

    await page.goto("/people");
    await expect(
      page.getByRole("heading", { name: "People", exact: true }),
    ).toBeVisible();

    const filteredPeopleResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === "GET" &&
        url.pathname === "/api/v1/people" &&
        url.searchParams.get("search") === defaultOnlyNickname
      );
    });

    await page.getByLabel("Filter people").fill(defaultOnlyNickname);

    const filteredPeopleResponse = await filteredPeopleResponsePromise;
    expect(filteredPeopleResponse.ok()).toBeTruthy();
    expect(filteredPeopleResponse.request().headers()["x-tenant-id"]).toBe(
      tenantId,
    );

    const filteredPeopleEnvelope = (await filteredPeopleResponse.json()) as {
      data?: { items?: unknown[]; total?: number };
    };
    expect(filteredPeopleEnvelope.data?.items ?? []).toHaveLength(0);
    expect(filteredPeopleEnvelope.data?.total ?? 0).toBe(0);

    await expect(page.getByText(defaultOnlyNickname, { exact: false })).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "No people match these filters" }),
    ).toBeVisible();

    await page.goto("/admin/reference-data");
    await expect(
      page.getByRole("heading", { name: "Reference Data", exact: true }),
    ).toBeVisible();

    const taskListResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === "GET" &&
        url.pathname === "/api/v1/reference-data/task"
      );
    });

    await page.getByLabel("Reference data type").selectOption("task");
    const taskListResponse = await taskListResponsePromise;
    expect(taskListResponse.ok()).toBeTruthy();
    expect(taskListResponse.request().headers()["x-tenant-id"]).toBe(tenantId);

    const taskListEnvelope = (await taskListResponse.json()) as {
      data?: Array<{ id?: string; tenantId?: string; code?: string; label?: string }>;
    };
    const selectedTenantTasks = taskListEnvelope.data ?? [];
    expect(
      selectedTenantTasks.every((item) => item.tenantId === tenantId),
    ).toBeTruthy();
    expect(
      selectedTenantTasks.some((item) => item.code === defaultOnlyTaskCode),
    ).toBeFalsy();
    await expect(page.getByText(defaultOnlyTaskLabel, { exact: true })).toHaveCount(0);

    const priceListResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === "GET" &&
        url.pathname === "/api/v1/price-list-items"
      );
    });

    await page.goto("/admin/price-list-items");
    await expect(
      page.getByRole("heading", { name: "Price List Items", exact: true }),
    ).toBeVisible();
    const priceListResponse = await priceListResponsePromise;
    expect(priceListResponse.ok()).toBeTruthy();
    expect(priceListResponse.request().headers()["x-tenant-id"]).toBe(tenantId);

    const priceListEnvelope = (await priceListResponse.json()) as {
      data?: Array<{ id?: string; tenantId?: string; code?: string; description?: string }>;
    };
    const selectedTenantPriceListItems = priceListEnvelope.data ?? [];
    expect(
      selectedTenantPriceListItems.every((item) => item.tenantId === tenantId),
    ).toBeTruthy();
    expect(
      selectedTenantPriceListItems.some(
        (item) =>
          item.code === defaultOnlyPriceListCode ||
          item.description === defaultOnlyPriceListDescription,
      ),
    ).toBeFalsy();
    await expect(
      page.getByText(defaultOnlyPriceListDescription, { exact: true }),
    ).toHaveCount(0);

    const goldPriceListResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === "GET" &&
        url.pathname === "/api/v1/gold-prices"
      );
    });

    await page.goto("/admin/gold-prices");
    await expect(
      page.getByRole("heading", { name: "Gold Prices", exact: true }),
    ).toBeVisible();
    const goldPriceListResponse = await goldPriceListResponsePromise;
    expect(goldPriceListResponse.ok()).toBeTruthy();
    expect(goldPriceListResponse.request().headers()["x-tenant-id"]).toBe(tenantId);

    const goldPriceListEnvelope = (await goldPriceListResponse.json()) as {
      data?: Array<{ id?: string; tenantId?: string; priceDate?: string }>;
    };
    const selectedTenantGoldPrices = goldPriceListEnvelope.data ?? [];
    expect(
      selectedTenantGoldPrices.every((price) => price.tenantId === tenantId),
    ).toBeTruthy();
    expect(
      selectedTenantGoldPrices.some(
        (price) =>
          price.id === defaultOnlyGoldPriceId ||
          price.priceDate === defaultOnlyGoldPriceDate,
      ),
    ).toBeFalsy();
    await expect(
      page.getByText(defaultOnlyGoldPriceDate, { exact: true }),
    ).toHaveCount(0);
  } finally {

    if (defaultOnlyPriceListItemId) {
      const deactivatePriceListItemResponse = await request.patch(
        e2eApiUrl(
          `/api/v1/price-list-items/${encodeURIComponent(defaultOnlyPriceListItemId)}/deactivate`,
        ),
        { headers: authzHeaders(), data: {} },
      );
      expect(deactivatePriceListItemResponse.ok()).toBeTruthy();
    }
    if (defaultOnlyGoldPriceId) {
      const deactivateGoldPriceResponse = await request.patch(
        e2eApiUrl(
          `/api/v1/gold-prices/${encodeURIComponent(defaultOnlyGoldPriceId)}/deactivate`,
        ),
        { headers: authzHeaders(), data: {} },
      );
      expect(deactivateGoldPriceResponse.ok()).toBeTruthy();
    }
    if (defaultOnlyTaskId) {
      const deactivateTaskResponse = await request.patch(
        e2eApiUrl(
          `/api/v1/reference-data/task/${encodeURIComponent(defaultOnlyTaskId)}/deactivate`,
        ),
        { headers: authzHeaders() },
      );
      expect(deactivateTaskResponse.ok()).toBeTruthy();
    }
    if (tenantId) {
      const deactivateResponse = await request.patch(
        e2eApiUrl(`/api/v1/tenants/${encodeURIComponent(tenantId)}/active`),
        { headers: authzHeaders(), data: { active: false } },
      );
      expect(deactivateResponse.ok()).toBeTruthy();
    }
  }
});

function uniqueGoldPriceDate(suffix: string): string {
  const digits = suffix.replace(/\D/g, "").padStart(12, "0");
  const year = 3000 + (Number(digits.slice(-4)) % 6000);
  const month = 1 + (Number(digits.slice(-6, -4)) % 12);
  const day = 1 + (Number(digits.slice(-8, -6)) % 28);
  return `${year.toString().padStart(4, "0")}-${month
    .toString()
    .padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
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

function validBrazilianCellular(seed: string): string {
  const digits = seed.replace(/\D/g, "").padStart(8, "0").slice(-8);
  return `11${`9${digits}`.slice(0, 9)}`;
}

test("a temporary-password account can sign in after completing the required password change", async ({ page: adminPage, browser, request }) => {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 100_000)}`;
  const actorWithoutAccessLogin = `auth-no-access-${suffix}@example.com`;
  const actorWithoutAccessResponse = await request.post(
    e2eApiUrl("/api/v1/authz/actors"),
    {
      headers: authzHeaders(),
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
      headers: authzHeaders(),
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
    "active role grant",
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

    await expect(page).toHaveURL(/\/collaborators$/);
    await expect(
      page.getByRole("heading", { name: "Collaborators", exact: true }),
    ).toBeVisible();
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
    await expect(page).toHaveURL(/\/collaborators$/);
    await expect(
      page.getByRole("heading", { name: "Collaborators", exact: true }),
    ).toBeVisible();

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

    const accountRow = adminPage.getByRole("row").filter({
      has: adminPage.getByText(account.login, { exact: true }),
    });
    await expect(accountRow).toBeVisible();
    const resetTokenResponsePromise = adminPage.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === "POST" &&
        url.pathname ===
          `/api/v1/auth/accounts/${account.accountId}/password-reset-tokens`
      );
    });
    await accountRow
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
        "Your account is inactive. Contact an Application Administrator.",
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
    await expect(page).toHaveURL(/\/collaborators$/);
    await expect(
      page.getByRole("heading", { name: "Collaborators", exact: true }),
    ).toBeVisible();

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


test("deactivated authentication account loses its session and cannot sign in until reactivated", async ({ browser, request }) => {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 100_000)}`;
  const account = await provisionRoleAccount(
    request,
    `deactivation-${suffix}`,
    "EXPENSE_OPERATOR",
  );
  const context = await browser.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();

  try {
    await signIn(page, account.login, account.password);
    await expect(page).toHaveURL(/\/collaborators$/);
    await expect(
      page.getByRole("heading", { name: "Collaborators", exact: true }),
    ).toBeVisible();

    await setAuthenticationAccountActive(request, account.accountId, false);

    await page.getByRole("link", { name: "Expenses", exact: true }).click();
    await expect(page).toHaveURL(/\/login\?returnTo=/);
    await expect(
      page.getByText(
        "Your account is inactive. Contact an Application Administrator.",
      ),
    ).toBeVisible();

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
    expect((await rejectedLoginResponse).status()).toBe(401);
    await expect(page).toHaveURL(/\/login/);
    await expect(
      page.getByText("The login or password is incorrect."),
    ).toBeVisible();

    await setAuthenticationAccountActive(request, account.accountId, true);
    await signIn(page, account.login, account.password);
    await expect(page).toHaveURL(/\/collaborators$/);
    await expect(
      page.getByRole("heading", { name: "Collaborators", exact: true }),
    ).toBeVisible();
  } finally {
    await context.close();
    await setAuthenticationAccountActive(request, account.accountId, true);
    await deactivateActor(request, account.actorId);
  }
});

test("signing in after a forbidden sign-out lands on the next account's first permitted page", async ({ browser, request }) => {
  const suffix = `${Date.now()}${Math.floor(Math.random() * 100_000)}`;
  const tenantAdmin = await provisionRoleAccount(request, `tenant-admin-${suffix}`, "TENANT_ADMIN");
  const expenseOperator = await provisionRoleAccount(request, `expense-operator-${suffix}`, "EXPENSE_OPERATOR");
  const context = await browser.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();

  try {
    await signIn(page, tenantAdmin.login, tenantAdmin.password);
    await expect(page).toHaveURL(/\/people$/);

    await page.goto("/admin/authentication");
    await expect(page).toHaveURL(/\/forbidden$/);
    await expect(page.getByRole("heading", { name: "Access forbidden" })).toBeVisible();

    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);

    await signIn(page, expenseOperator.login, expenseOperator.password);
    await expect(page).toHaveURL(/\/collaborators$/);
    await expect(
      page.getByRole("heading", { name: "Collaborators", exact: true }),
    ).toBeVisible();
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
    await deactivateActor(request, tenantAdmin.actorId);
    await deactivateActor(request, expenseOperator.actorId);
  }
});

type PreparedRoleAccount = {
  actorId: string;
  accountId: string;
  login: string;
  password: string;
};

async function provisionRoleAccount(
  request: APIRequestContext,
  keyPrefix: string,
  roleCode: "TENANT_ADMIN" | "EXPENSE_OPERATOR",
  mustChangePassword = false,
): Promise<PreparedRoleAccount> {
  const login = `auth-${keyPrefix}@example.com`;
  const password = `E2E-${keyPrefix}-Password!`;
  const actorResponse = await request.post(e2eApiUrl("/api/v1/authz/actors"), {
    headers: authzHeaders(),
    data: {
      actorKey: login,
      displayName: `Authentication UX ${keyPrefix}`,
      active: true,
    },
  });
  expect(actorResponse.status()).toBe(201);
  const actorEnvelope = (await actorResponse.json()) as { data?: { id?: string } };
  const actorId = actorEnvelope.data?.id;
  expect(actorId).toBeTruthy();

  const grantResponse = await request.post(
    e2eApiUrl(`/api/v1/authz/actors/${encodeURIComponent(actorId!)}/role-grants`),
    {
      headers: authzHeaders(),
      data: { roleCode, tenantId: "default" },
    },
  );
  expect(grantResponse.status()).toBe(201);

  const accountResponse = await request.post(e2eApiUrl("/api/v1/auth/accounts"), {
    headers: authzHeaders(),
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

  return { actorId: actorId!, accountId: accountId!, login, password };
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
      headers: authzHeaders(),
      data: { active },
    },
  );
  expect(response.ok()).toBeTruthy();
}

async function deactivateActor(
  request: APIRequestContext,
  actorId: string,
): Promise<void> {
  const response = await request.patch(
    e2eApiUrl(`/api/v1/authz/actors/${encodeURIComponent(actorId)}/active`),
    {
      headers: authzHeaders(),
      data: { active: false },
    },
  );
  expect(response.ok()).toBeTruthy();
}
