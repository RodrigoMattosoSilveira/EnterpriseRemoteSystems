import { expect, test } from "@playwright/test";
import { authzHeaders, e2eApiUrl, seedBrowserAuthz } from "./support/authz";

test.beforeEach(async ({ page }) => {
  await seedBrowserAuthz(page);
});

test("admin can view and update second-person approval policy", async ({ page, request }) => {
  const initialResponse = await request.get(
    e2eApiUrl("/api/v1/current-accounts/settings/second-person-approval"),
    { headers: authzHeaders() },
  );
  expect(initialResponse.ok()).toBeTruthy();
  const initialPayload = await initialResponse.json();
  const initialRequired = Boolean(initialPayload.data?.required);
  const targetRequired = !initialRequired;

  try {
    await page.goto("/admin/current-account-settings");

    await expect(
      page.getByRole("heading", { name: "Current Account Settings", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Operational warning")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Authenticated authorization context" }),
    ).toBeVisible();
    await expect(page.getByLabel("Selected Tenant ID")).toHaveValue("default");

    const policyToggle = page.getByLabel(
      "Require second-person approval for sensitive current-account operations",
    );
    if (initialRequired) {
      await expect(policyToggle).toBeChecked();
    } else {
      await expect(policyToggle).not.toBeChecked();
    }

    await policyToggle.setChecked(targetRequired);
    await page.getByRole("button", { name: "Save Policy" }).click();

    await expect(page.getByRole("status")).toContainText(
      targetRequired
        ? "Second-person approval is now required"
        : "Second-person approval is now optional",
    );
    if (targetRequired) {
      await expect(policyToggle).toBeChecked();
    } else {
      await expect(policyToggle).not.toBeChecked();
    }

    const updatedResponse = await request.get(
      e2eApiUrl("/api/v1/current-accounts/settings/second-person-approval"),
      { headers: authzHeaders() },
    );
    expect(updatedResponse.ok()).toBeTruthy();
    const updatedPayload = await updatedResponse.json();
    expect(Boolean(updatedPayload.data?.required)).toBe(targetRequired);
  } finally {
    await request.put(e2eApiUrl("/api/v1/current-accounts/settings/second-person-approval"), {
      headers: {
        ...authzHeaders(),
        "Content-Type": "application/json",
      },
      data: { required: initialRequired },
    });
  }
});
