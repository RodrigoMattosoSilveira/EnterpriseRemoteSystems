import { expect, test, type APIRequestContext } from "@playwright/test";
import { authzHeaders, e2eApiUrl, seedBrowserAuthz } from "./support/authz";

const ACTIVE_STATUS_ID = "ref-person-status-active";
const DISCONTINUED_STATUS_ID = "ref-person-status-discontinued";

test.beforeEach(async ({ page }) => {
  await seedBrowserAuthz(page);
});

function cpfCheckDigit(numbers: number[]): number {
  const weightStart = numbers.length + 1;

  const sum = numbers.reduce((acc, digit, index) => {
    return acc + digit * (weightStart - index);
  }, 0);

  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

function validCPF(seed: number): string {
  const base = String(seed).padStart(9, "0").slice(-9);
  const digits = base.split("").map(Number);

  const d1 = cpfCheckDigit(digits);
  const d2 = cpfCheckDigit([...digits, d1]);

  return `${base}${d1}${d2}`;
}

function uniqueSuffix(): number {
  const timestampDigits = Date.now() % 1_000_000;
  const randomDigits = Math.floor(Math.random() * 1000);

  return timestampDigits * 1000 + randomDigits;
}

function validRG(seed: number): string {
  return `RG-${String(seed).slice(-8)}`;
}

function formatBrazilianCellular(raw: string): string {
  const digits = raw.replace(/\D/g, "");

  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

test("user can create a Person from the React frontend", async ({ page }) => {
  const unique = Date.now().toString().slice(-8);
  const firstName = `E2E${unique}`;
  const lastName = "Pessoa";
  const nickname = `Nick${unique}`;
  const cpf = generateCPF(unique);
  const rg = `RG${unique}`;
  const cellular = `119${unique.padStart(8, "0").slice(0, 8)}`;
  const email = `person-${unique}@example.com`;

  await page.goto("/people/new");

  await expect(page.getByRole("heading", { name: "New Person" })).toBeVisible();

  await page.getByLabel("First Name *").fill(firstName);
  await page.getByLabel("Last Name *").fill(lastName);
  await page.getByLabel("Nickname *").fill(nickname);
  await page.getByLabel("CPF *").fill(cpf);
  await page.getByLabel("RG *").fill(rg);
  await page.getByLabel("Cellular *").fill(cellular);
  await page.getByLabel("Email *").fill(email);
  await page.getByLabel("Status *").selectOption(ACTIVE_STATUS_ID);

  await page.getByRole("button", { name: "Create Person" }).click();

  await expect(page).toHaveURL(/\/people$/);
  await expect(page.getByRole("heading", { name: "People" })).toBeVisible();
  await expect(page.getByRole("status")).toContainText(
    `Person record added: ${firstName} ${lastName}.`,
  );

  const firstPersonCard = page.locator('main section a[href^="/people/"]').first();
  await expect(firstPersonCard).toContainText(`${firstName} ${lastName}`);
  await expect(firstPersonCard).toContainText(nickname);
  await expect(firstPersonCard).toContainText("Just added");
  await expect(firstPersonCard).toContainText("Incomplete");
});



test("user can filter and paginate the People page", async ({ page, request }) => {
  const suffix = uniqueSuffix();
  const filterLastName = `PeopleFilter${suffix}`;

  for (let index = 0; index < 11; index += 1) {
    await createPersonViaApi(request, {
      seed: suffix + index,
      firstName: `Page${String(index).padStart(2, "0")}`,
      lastName: filterLastName,
    });
  }

  await page.goto("/people");

  await page.getByLabel("Filter people").fill(filterLastName);
  //await page.getByRole("button", { name: "Apply filter" }).click();

  await expect(page.getByText("Showing 1-10 of 11 people").first()).toBeVisible();
  await expect(page.getByText("Page 1 of 2").first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Page00/ })).toBeVisible();

  await page.getByRole("button", { name: "Next" }).last().click();

  await expect(page.getByText("Showing 11-11 of 11 people").first()).toBeVisible();
  await expect(page.getByText("Page 2 of 2").first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Page10/ })).toBeVisible();

  await page.getByRole("button", { name: "Previous" }).last().click();
  await expect(page.getByText("Page 1 of 2").first()).toBeVisible();
});

test("user can filter People by Discontinued status", async ({ page, request }) => {
  const suffix = uniqueSuffix();
  const filterLastName = `PeopleDiscontinued${suffix}`;

  await createPersonViaApi(request, {
    seed: suffix,
    firstName: `Active${suffix}`,
    lastName: filterLastName,
    statusId: ACTIVE_STATUS_ID,
  });

  await createPersonViaApi(request, {
    seed: suffix + 1,
    firstName: `Discontinued${suffix}`,
    lastName: filterLastName,
    statusId: DISCONTINUED_STATUS_ID,
  });

  await page.goto("/people");

  await page.getByLabel("Filter people").fill(filterLastName);
  await page.getByRole("combobox", { name: /^Status$/ }).selectOption("Discontinued");

  await expect(
    page.getByRole("link", {
      name: new RegExp(`^Discontinued${suffix}\\s+${filterLastName}\\b`),
    }),
  ).toBeVisible();
  await expect(page.getByText(filterLastName, { exact: false }).first()).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: new RegExp(`^Active${suffix}\\s+${filterLastName}\\b`),
    }),
  ).toHaveCount(0);
});

/*
test("user can switch the People landing page between card and list views", async ({ page }) => {
  const suffix = uniqueSuffix();
  const personName = `View${suffix} Toggle`;

  await page.goto("/people/new");

  await page.getByLabel("First Name *").fill(`View${suffix}`);
  await page.getByLabel("Last Name *").fill("Toggle");
  await page.getByLabel("Nickname *").fill(`ViewNick${suffix}`);
  await page.getByLabel("CPF *").fill(generateCPF(String(suffix)));
  await page.getByLabel("RG *").fill(validRG(suffix));
  await page.getByLabel("Cellular *").fill(validBrazilianCellular(suffix));
  await page.getByLabel("Email *").fill(`view-${suffix}@example.com`);
  await page.getByLabel("Status *").selectOption(ACTIVE_STATUS_ID);

  await page.getByRole("button", { name: "Create Person" }).click();

  // Stay on the navigation triggered by Create Person so the router keeps the
  // location.state that pins the newly created person to the top of the list.
  // A fresh page.goto("/people") would lose that state and the new person
  // might not be on the first unfiltered page.
  await expect(page).toHaveURL(/\/people$/);

  await expect(page.getByRole("button", { name: "Card view" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("link", { name: new RegExp(personName) })).toBeVisible();

  // Filter by the person's name before switching views. Switching view mode
  // calls setSearchParams which drops location.state in react-router v6, so
  // the pinning logic no longer works after the switch. Filtering keeps the
  // person visible on page 1 in both views regardless of state.
  await page.getByLabel("Filter people").fill(personName);
  
  await expect(page.getByRole("link", { name: new RegExp(personName) })).toBeVisible();

  await page.getByRole("button", { name: "List view" }).click();

  await expect(page.getByRole("button", { name: "List view" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("table")).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(personName) })).toBeVisible();

  await page.getByRole("button", { name: "Card view" }).click();

  await expect(page.getByRole("button", { name: "Card view" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("table")).toHaveCount(0);
  await expect(page.getByRole("link", { name: new RegExp(personName) })).toBeVisible();
}); */

test("user can switch the People landing page between card and list views", async ({ page }) => {
  const suffix = uniqueSuffix();
  const personName = `View${suffix} Toggle`;

  await page.goto("/people/new");

  await page.getByLabel("First Name *").fill(`View${suffix}`);
  await page.getByLabel("Last Name *").fill("Toggle");
  await page.getByLabel("Nickname *").fill(`ViewNick${suffix}`);
  await page.getByLabel("CPF *").fill(generateCPF(String(suffix)));
  await page.getByLabel("RG *").fill(validRG(suffix));
  await page.getByLabel("Cellular *").fill(validBrazilianCellular(suffix));
  await page.getByLabel("Email *").fill(`view-${suffix}@example.com`);
  await page.getByLabel("Status *").selectOption(ACTIVE_STATUS_ID);

  await page.getByRole("button", { name: "Create Person" }).click();
  await expect(page).toHaveURL(/\/people$/);

  // Card view should be active by default
  await expect(page.getByRole("button", { name: "Card view" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("link", { name: new RegExp(`^${personName}`) })).toBeVisible();

  // Filter by the unique first name only — the API cannot search by a combined
  // "firstName lastName" string, so using just the unique first-name part
  // ensures the API actually returns this person and keeps them visible in both
  // views after location.state is dropped on the view-mode switch.
  await page.getByLabel("Filter people").fill(`View${suffix}`);

  // Wait for debounce + API response
  await page.waitForTimeout(500);
  await expect(page.getByRole("link", { name: new RegExp(`^${personName}`) })).toBeVisible();

  // Switch to list view
  await page.getByRole("button", { name: "List view" }).click();
  await expect(page.getByRole("button", { name: "List view" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("table")).toBeVisible();

  // Debug: dump table contents
  console.log("TABLE CONTENTS:\n", await page.locator("table").innerText());

  // Match link starting with the person’s name, ignoring suffixes
  await expect(page.getByRole("link", { name: new RegExp(`^${personName}`) })).toBeVisible();

  // Switch back to card view
  await page.getByRole("button", { name: "Card view" }).click();
  await expect(page.getByRole("button", { name: "Card view" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("table")).toHaveCount(0);

  // In card view, links should be present again
  await expect(page.getByRole("link", { name: new RegExp(`^${personName}`) })).toBeVisible();
});





test("user sees required field validation on the create Person form", async ({ page }) => {
  await page.goto("/people/new");

  await page.getByRole("button", { name: "Create Person" }).click();

  await expect(page).toHaveURL(/\/people\/new$/);

  await expect(page.getByLabel("First name")).toBeVisible();
  await expect(page.getByLabel("Last name")).toBeVisible();
  await expect(page.getByLabel("CPF")).toBeVisible();
  await expect(page.getByLabel("RG")).toBeVisible();
  await expect(page.getByLabel("Cellular")).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
});

test("user sees an error when creating a Person with a duplicate CPF", async ({ page }) => {
  const suffix = uniqueSuffix();

  const cpf = validCPF(suffix);
  const firstCellular = validBrazilianCellular(suffix);
  const secondCellular = validBrazilianCellular(suffix + 1);

  await page.goto("/people/new");

  await page.getByLabel("First name").fill(`Duplicate${suffix}`);
  await page.getByLabel("Last name").fill("CPF");
  await page.getByLabel("Nickname").fill(`Dup${suffix}`);
  await page.getByLabel("CPF").fill(cpf);
  await page.getByLabel("RG").fill(validRG(suffix));
  await page.getByLabel("Cellular").fill(validBrazilianCellular(suffix));
  await page.getByLabel("Email").fill(`duplicate-${suffix}@example.com`);
  await page.getByLabel("Status *").selectOption(ACTIVE_STATUS_ID);

  await page.getByRole("button", { name: "Create Person" }).click();

  await expect(page).toHaveURL(/\/people$/);

  await page.goto("/people/new");

  await page.getByLabel("First name").fill(`DuplicateAgain${suffix}`);
  await page.getByLabel("Last name").fill("CPF");
  await page.getByLabel("Nickname").fill(`DupAgain${suffix}`);
  await page.getByLabel("CPF").fill(cpf);
  await page.getByLabel("RG").fill(`RG-DUP-${suffix}`);
  await page.getByLabel("Cellular").fill(secondCellular);
  await page.getByLabel("Email").fill(`duplicate-again-${suffix}@example.com`);
  await page.getByLabel("Status *").selectOption(ACTIVE_STATUS_ID);

  await page.getByRole("button", { name: "Create Person" }).click();

  await expect(page).toHaveURL(/\/people\/new$/);
  await expect(page.locator("body")).toContainText(/cpf/i);
  await expect(page.locator("body")).toContainText(
    /already exists|unique|duplicate|registered|taken|validation/i,
  );
});

test("user can create a Person with a valid Brazilian cellular", async ({ page }) => {
  const suffix = uniqueSuffix();
  const cellular = validBrazilianCellular(suffix + 10);

  await page.goto("/people/new");

  await page.getByLabel("First name").fill(`Formatted${suffix}`);
  await page.getByLabel("Last name").fill("Phone");
  await page.getByLabel("Nickname").fill(`Phone${suffix}`);
  await page.getByLabel("CPF").fill(validCPF(suffix + 10));
  await page.getByLabel("RG").fill(validRG(suffix + 10));
  await page.getByLabel("Cellular").fill(cellular);
  await page.getByLabel("Email").fill(`formatted-phone-${suffix}@example.com`);

  await page.getByRole("button", { name: "Create Person" }).click();

  await expect(page).toHaveURL(/\/people$/);
  const firstPersonCard = page.locator('main section a[href^="/people/"]').first();
  await expect(firstPersonCard).toContainText(/Formatted.*Phone/);
  await expect(firstPersonCard).toContainText("Just added");
});


async function createPersonViaApi(
  request: APIRequestContext,
  input: {
    seed: number;
    firstName: string;
    lastName: string;
    statusId?: string;
  },
) {
  const attempts = 3;
  let lastStatus = 0;
  let lastBody = "";

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const seed = input.seed + attempt * 100_000;
    const response = await request.post(e2eApiUrl("/api/v1/people"), {
      headers: authzHeaders(),
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        nickname: `${input.firstName}-${seed}`,
        cpf: validCPF(seed),
        rg: validRG(seed),
        cellular: validBrazilianCellular(seed),
        email: `people-filter-${seed}@example.com`,
        statusId: input.statusId ?? ACTIVE_STATUS_ID,
      },
    });

    if (response.ok()) {
      return;
    }

    lastStatus = response.status();
    lastBody = await response.text();
  }

  expect(
    false,
    `Failed to create E2E Person ${input.firstName} ${input.lastName}. Last API status: ${lastStatus}. Last body: ${lastBody}`,
  ).toBeTruthy();
}

function validBrazilianCellular(seed: number | string): string {
  const uniqueDigits = String(seed)
    .replace(/\D/g, "")
    .padStart(8, "0")
    .slice(-8);

  return `11${`9${uniqueDigits}`.slice(0, 9)}`;
}

function generateCPF(seed: string): string {
  const digits = seed.replace(/\D/g, "").padStart(9, "1").slice(0, 9);
  const firstCheckDigit = calculateCPFCheckDigit(digits, 10);
  const secondCheckDigit = calculateCPFCheckDigit(`${digits}${firstCheckDigit}`, 11);

  return `${digits}${firstCheckDigit}${secondCheckDigit}`;
}

function calculateCPFCheckDigit(digits: string, weightStart: number): number {
  const sum = [...digits].reduce((total, digit, index) => {
    return total + Number(digit) * (weightStart - index);
  }, 0);

  const digit = 11 - (sum % 11);
  return digit >= 10 ? 0 : digit;
}

