export type E2EAuthMode = "headers" | "session";

export function resolveE2EAuthMode(
  baseURL: string,
  configuredMode = process.env.PLAYWRIGHT_AUTH_MODE,
): E2EAuthMode {
  const normalized = configuredMode?.trim().toLowerCase();
  if (normalized === "headers" || normalized === "session") {
    return normalized;
  }
  if (normalized) {
    throw new Error(
      `PLAYWRIGHT_AUTH_MODE must be \"headers\" or \"session\", got ${configuredMode}`,
    );
  }

  return "session";
}

export function isLoopbackURL(value: string): boolean {
  try {
    const hostname = new URL(value).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  } catch {
    return false;
  }
}
