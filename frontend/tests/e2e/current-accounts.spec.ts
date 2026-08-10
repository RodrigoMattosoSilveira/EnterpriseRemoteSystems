import { expect, test } from "@playwright/test";
import { authzHeaders, e2eApiUrl, seedBrowserAuthz } from "./support/authz";

test.beforeEach(async ({ page }) => {
	await seedBrowserAuthz(page);
});

test("current-account page localizes UI and backend validation in Portuguese", async ({ page, request }) => {
	const collaboratorsResponse = await request.get(
		e2eApiUrl("/api/v1/collaborators?page=1&pageSize=1"),
		{ headers: authzHeaders() },
	);
	expect(collaboratorsResponse.ok()).toBeTruthy();
	const collaboratorsPayload = await collaboratorsResponse.json();
	const collaboratorId = collaboratorsPayload?.data?.items?.[0]?.id as string | undefined;

	test.skip(!collaboratorId, "No collaborator available for current-account e2e i18n validation.");

	await page.goto(`/collaborators/${collaboratorId}/current-account?page=-1`);

	await page.getByLabel("Language").selectOption("pt-BR");

	await expect(page.getByText("Conta Corrente do Colaborador")).toBeVisible();
	await expect(page.getByText("Os dados enviados são inválidos.")).toBeVisible();
	await expect(page.getByText("page:")).toBeVisible();
	await expect(page.getByText("A página deve ser maior que zero")).toBeVisible();
});
