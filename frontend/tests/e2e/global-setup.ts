import { request, type APIResponse, type FullConfig } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { isLoopbackURL } from "./support/runtime";
import {
  applicationAdminStorageStatePath,
  tenantAdminStorageStatePath,
} from "./support/storage";

type CurrentActorEnvelope = {
  data?: {
    actorKey?: string;
    tenantId?: string;
    scope?: string;
    permissions?: string[];
  };
};

export default async function globalSetup(config: FullConfig): Promise<void> {
  const project = config.projects[0];
  if (!project) {
    throw new Error("Playwright session setup requires at least one configured project");
  }

  const baseURL = project.use.baseURL;
  if (typeof baseURL !== "string" || baseURL.trim() === "") {
    throw new Error("PLAYWRIGHT_BASE_URL is required for authenticated deployed E2E");
  }

  const isLocal = isLoopbackURL(baseURL);
  const applicationAdminLogin =
    process.env.E2E_ADMIN_EMAIL?.trim() || (isLocal ? "admin@example.com" : "");
  const applicationAdminPassword =
    process.env.E2E_ADMIN_PASSWORD || (isLocal ? "Local-E2E-Administrator-28D!" : "");
  const applicationAdminActorKey =
    process.env.E2E_APPLICATION_ADMIN_ACTOR_KEY?.trim() ||
    (isLocal ? "e2e-application-admin" : "");

  const tenantAdminLogin =
    process.env.E2E_TENANT_ADMIN_EMAIL?.trim() || (isLocal ? "tenant-admin@example.com" : "");
  const tenantAdminPassword =
    process.env.E2E_TENANT_ADMIN_PASSWORD || applicationAdminPassword;
  const tenantAdminActorKey =
    process.env.E2E_TENANT_ADMIN_ACTOR_KEY?.trim() ||
    (isLocal ? "e2e-default-tenant-admin" : "");

  if (!applicationAdminLogin || !applicationAdminPassword) {
    throw new Error(
      "E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD are required for deployed Playwright session authentication",
    );
  }
  if (!tenantAdminLogin || !tenantAdminPassword) {
    throw new Error(
      "E2E_TENANT_ADMIN_EMAIL and E2E_TENANT_ADMIN_PASSWORD are required for deployed Tenant-domain Playwright authentication",
    );
  }

  await authenticateAndPersist({
    baseURL,
    login: applicationAdminLogin,
    password: applicationAdminPassword,
    selectedTenantId: "*",
    expectedActorKey: applicationAdminActorKey,
    expectedScope: "APPLICATION",
    requiredPermission: "authz.manage",
    forbiddenPermission: "*",
    storageStatePath: applicationAdminStorageStatePath,
  });

  await authenticateAndPersist({
    baseURL,
    login: tenantAdminLogin,
    password: tenantAdminPassword,
    selectedTenantId: "default",
    expectedActorKey: tenantAdminActorKey,
    expectedScope: "TENANT",
    requiredPermission: "people.read",
    storageStatePath: tenantAdminStorageStatePath,
  });
}

async function authenticateAndPersist(input: {
  baseURL: string;
  login: string;
  password: string;
  selectedTenantId: string;
  expectedActorKey?: string;
  expectedScope: "APPLICATION" | "TENANT";
  requiredPermission: string;
  forbiddenPermission?: string;
  storageStatePath: string;
}): Promise<void> {
  const api = await request.newContext({
    baseURL: input.baseURL,
    extraHTTPHeaders: { "X-Tenant-ID": input.selectedTenantId },
  });

  try {
    const loginResponse = await api.post("/api/v1/auth/login", {
      data: { login: input.login, password: input.password },
    });
    await requireSuccessfulResponse(loginResponse, `Authenticate deployed E2E account ${input.login}`);

    const actorResponse = await api.get("/api/v1/authz/current-actor");
    await requireSuccessfulResponse(actorResponse, `Resolve deployed E2E authorization for ${input.login}`);

    const actorPayload = (await actorResponse.json()) as CurrentActorEnvelope;
    const permissions = actorPayload.data?.permissions ?? [];
    if (
      actorPayload.data?.scope !== input.expectedScope ||
      actorPayload.data?.tenantId !== input.selectedTenantId ||
      !permissions.includes(input.requiredPermission) ||
      (input.forbiddenPermission && permissions.includes(input.forbiddenPermission))
    ) {
      throw new Error(
        `The deployed E2E account ${input.login} did not resolve to the expected ${input.expectedScope} authorization context`,
      );
    }
    if (input.expectedActorKey && actorPayload.data?.actorKey !== input.expectedActorKey) {
      throw new Error(
        `The deployed E2E account ${input.login} resolved to actor ${actorPayload.data?.actorKey ?? "<missing>"}; expected ${input.expectedActorKey}`,
      );
    }

    const state = await api.storageState();
    const origin = new URL(input.baseURL).origin;
    state.origins = [
      ...state.origins.filter((entry) => entry.origin !== origin),
      {
        origin,
        localStorage: [
          {
            name: "ers.auth.selectedTenantId",
            value: input.selectedTenantId,
          },
        ],
      },
    ];

    await mkdir(dirname(input.storageStatePath), { recursive: true });
    await writeFile(input.storageStatePath, `${JSON.stringify(state, null, 2)}\n`, {
      encoding: "utf8",
      mode: 0o600,
    });
  } finally {
    await api.dispose();
  }
}

async function requireSuccessfulResponse(
  response: APIResponse,
  operation: string,
): Promise<void> {
  if (response.ok()) return;
  throw new Error(
    `${operation} failed at ${response.url()}: ${response.status()} ${await response.text()}`,
  );
}
