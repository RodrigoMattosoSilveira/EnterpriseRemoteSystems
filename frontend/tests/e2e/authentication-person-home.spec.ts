import { expect, test, type Page } from "@playwright/test";
import { authzHeaders, e2eApiUrl } from "./support/authz";
import { uniquePersonSuffix } from "./support/test-data";

declare const process: { env: Record<string, string | undefined> };

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:15173";

test("an authenticated Person actor lands in People before operator workspaces", async ({ browser, request }, testInfo) => {
  const suffix = uniquePersonSuffix(testInfo.workerIndex);
  const email = `person-home-${suffix}@example.com`;
  const password = `Person-Home-${suffix}-Password!`;

  const personResponse = await request.post(e2eApiUrl("/api/v1/people"), {
    headers: authzHeaders(),
    data: {
      firstName: "Person",
      lastName: "Home",
      nickname: `PersonHome${suffix}`,
      cpf: validCPF(suffix),
      rg: `PH-${suffix}`,
      cellular: validBrazilianCellular(suffix),
      email,
      statusId: "ref-person-status-active",
    },
  });
  expect(personResponse.status()).toBe(201);
  const personEnvelope = (await personResponse.json()) as { data?: { id?: string } };
  const personId = personEnvelope.data?.id;
  expect(personId).toBeTruthy();

  const actorResponse = await request.post(e2eApiUrl("/api/v1/authz/actors"), {
    headers: authzHeaders(),
    data: {
      actorKey: email,
      displayName: `Person Home ${suffix}`,
      personId,
      active: true,
    },
  });
  expect(actorResponse.status()).toBe(201);
  const actorEnvelope = (await actorResponse.json()) as { data?: { id?: string } };
  const actorId = actorEnvelope.data?.id;
  expect(actorId).toBeTruthy();

  try {
    // Bite 30D self-service comes from Account -> tenant Actor -> ACTIVE
    // Membership. This fixture intentionally has no delegated Role Grant.
    const accountResponse = await request.post(e2eApiUrl("/api/v1/auth/accounts"), {
      headers: authzHeaders(),
      data: {
        actorId,
        login: email,
        temporaryPassword: password,
        mustChangePassword: false,
      },
    });
    expect(accountResponse.status()).toBe(201);

    const context = await browser.newContext({
      baseURL,
      storageState: { cookies: [], origins: [] },
    });
    const page = await context.newPage();

    try {
      await signIn(page, email, password);
      await expect(page).toHaveURL(
        new RegExp(`/people/${escapeRegExp(personId!)}$`),
      );
      // A Person-only identity has intrinsic Person self-service but no
      // Collaborator journey and therefore no Collaborator navigation.
      await expect(
        page.getByRole("link", { name: "My Collaborator record" }),
      ).toHaveCount(0);

      const saveButton = page.getByRole("button", { name: "Save Changes" });
      await expect(saveButton).toBeDisabled();

      await page.getByLabel("First Name").fill("Person Edited");
      await expect(saveButton).toBeEnabled();

      await page.getByLabel("Email").fill("not-an-email");
      await expect(saveButton).toBeDisabled();

      await page.getByLabel("Email").fill(email);
      await expect(saveButton).toBeEnabled();

      await saveButton.click();
      await expect(page.getByRole("status")).toContainText(
        "Person updated successfully.",
      );
      await expect(saveButton).toBeDisabled();
    } finally {
      await context.close();
    }
  } finally {
    const deactivateResponse = await request.patch(
      e2eApiUrl(`/api/v1/authz/actors/${encodeURIComponent(actorId!)}/active`),
      {
        headers: authzHeaders(),
        data: { active: false },
      },
    );
    expect(deactivateResponse.ok()).toBeTruthy();
  }
});

async function signIn(page: Page, login: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Login").fill(login);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/);
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

function validBrazilianCellular(seed: number): string {
  const digits = String(seed).padStart(8, "0").slice(-8);
  return `11${`9${digits}`.slice(0, 9)}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
