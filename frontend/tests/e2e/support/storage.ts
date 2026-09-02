import { join } from "node:path";
import { fileURLToPath } from "node:url";

const authDir = join(
  fileURLToPath(new URL("../..", import.meta.url)),
  "test-results",
  ".auth",
);

export const tenantAdminStorageStatePath = join(authDir, "tenant-admin.json");
export const applicationAdminStorageStatePath = join(authDir, "application-admin.json");
