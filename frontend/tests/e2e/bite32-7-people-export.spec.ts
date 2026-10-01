import { expect, test } from "@playwright/test";
import { authzHeaders, seedBrowserAuthz } from "./support/authz";
import { tenantAdminStorageStatePath } from "./support/storage";

test.use({
  storageState: tenantAdminStorageStatePath,
  extraHTTPHeaders: authzHeaders(),
});

test.beforeEach(async ({ page }) => {
  await seedBrowserAuthz(page);
});

test("Tenant Administrator exports importer-compatible Tenant People CSV", async ({ page }) => {
  await page.goto("/people");
  const exportButton = page.getByRole("button", { name: "Export CSV", exact: true });
  await expect(exportButton).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await exportButton.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("ers-people-export.csv");

  const stream = await download.createReadStream();
  let csv = "";
  for await (const chunk of stream) csv += chunk.toString();
  expect(csv.split(/\r?\n/, 1)[0]).toBe(
    "firstName,lastName,nickname,cpf,rg,cellular,email,statusId,notes,street1,street2,city,state,cep,country,bankName,bankNumber,checkingAccount,pixKey,emergencyName,emergencyCellular,emergencyEmail",
  );
  expect(csv).not.toContain("membershipId");
  expect(csv).not.toContain("tenantId");
  expect(csv).not.toContain("globalPersonId");

  await page.evaluate(() => localStorage.setItem("ers.i18n.locale", "pt-BR"));
  await page.goto("/people");
  await expect(page.getByRole("button", { name: "Exportar CSV", exact: true })).toBeVisible();
});
