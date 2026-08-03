import { request, type APIResponse, type FullConfig } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

type CurrentActorEnvelope = {
  data?: {
    actorKey?: string;
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

  const storageStatePath = project.use.storageState;
  if (typeof storageStatePath !== "string" || storageStatePath.trim() === "") {
    throw new Error("Authenticated deployed E2E requires a storage-state file path");
  }

  const login = process.env.E2E_ADMIN_EMAIL?.trim();
  const password = process.env.E2E_ADMIN_PASSWORD;
  const expectedActorKey = process.env.PLAYWRIGHT_AUTHZ_ACTOR_ID?.trim();
  const tenantId = process.env.PLAYWRIGHT_AUTHZ_TENANT_ID?.trim() || "default";

  if (!login || !password) {
    throw new Error(
      "E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD are required for deployed Playwright session authentication",
    );
  }

  const api = await request.newContext({
    baseURL,
    extraHTTPHeaders: { "X-Tenant-ID": tenantId },
  });

  try {
    const loginResponse = await api.post("/api/v1/auth/login", {
      data: { login, password },
    });
    await requireSuccessfulResponse(loginResponse, `Authenticate deployed E2E administrator ${login}`);

    const actorResponse = await api.get("/api/v1/authz/current-actor");
    await requireSuccessfulResponse(actorResponse, "Resolve deployed E2E administrator authorization");

    const actorPayload = (await actorResponse.json()) as CurrentActorEnvelope;
    const permissions = actorPayload.data?.permissions ?? [];
    if (
      actorPayload.data?.scope !== "APPLICATION" ||
      (!permissions.includes("authz.manage") && !permissions.includes("*"))
    ) {
      throw new Error(
        "The deployed E2E account must resolve to an application-scoped authorization administrator",
      );
    }
    if (expectedActorKey && actorPayload.data?.actorKey !== expectedActorKey) {
      throw new Error(
        `The deployed E2E account resolved to actor ${actorPayload.data?.actorKey ?? "<missing>"}; expected ${expectedActorKey}`,
      );
    }

    const state = await api.storageState();
    const origin = new URL(baseURL).origin;
    state.origins = [
      ...state.origins.filter((entry) => entry.origin !== origin),
      {
        origin,
        localStorage: [
          {
            name: "ers.auth.selectedTenantId",
            value: tenantId,
          },
        ],
      },
    ];

    await mkdir(dirname(storageStatePath), { recursive: true });
    await writeFile(storageStatePath, `${JSON.stringify(state, null, 2)}\n`, {
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
