export const REAUTH_STORAGE_KEY = "ers.reauthentication.current";
export const REAUTH_METHOD = "password";
export const REAUTH_FRESHNESS_WINDOW_MS = 15 * 60 * 1000;

type StoredReauthentication = {
  reauthenticatedAt?: string;
  method?: string;
};

export type RecentReauthentication = {
  reauthenticatedAt: string;
  method: string;
};

export function confirmRecentReauthentication(now = new Date()): RecentReauthentication {
  const reauthentication = {
    reauthenticatedAt: now.toISOString(),
    method: REAUTH_METHOD,
  };
  saveRecentReauthentication(reauthentication);
  return reauthentication;
}

export function saveRecentReauthentication(reauthentication: RecentReauthentication) {
  const storage = browserStorage();
  if (!storage) return;
  storage.setItem(REAUTH_STORAGE_KEY, JSON.stringify(reauthentication));
}

export function loadRecentReauthentication(now = new Date()): RecentReauthentication | null {
  const storage = browserStorage();
  if (!storage) return null;

  try {
    const stored = storage.getItem(REAUTH_STORAGE_KEY);
    if (!stored) return null;

    const parsed = JSON.parse(stored) as StoredReauthentication;
    const reauthenticatedAt = typeof parsed.reauthenticatedAt === "string" ? parsed.reauthenticatedAt.trim() : "";
    const method = typeof parsed.method === "string" ? parsed.method.trim() : "";
    if (!reauthenticatedAt || !method) return null;

    const authenticatedAt = new Date(reauthenticatedAt);
    if (Number.isNaN(authenticatedAt.getTime())) return null;
    if (!isRecentReauthentication(authenticatedAt, now)) return null;

    return { reauthenticatedAt, method };
  } catch {
    return null;
  }
}

export function clearRecentReauthentication() {
  const storage = browserStorage();
  storage?.removeItem(REAUTH_STORAGE_KEY);
}

export function isRecentReauthentication(authenticatedAt: Date, now = new Date()) {
  const ageMs = now.getTime() - authenticatedAt.getTime();
  return ageMs >= 0 && ageMs <= REAUTH_FRESHNESS_WINDOW_MS;
}

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  const storage = window.localStorage;
  if (typeof storage?.getItem !== "function") return null;
  if (typeof storage?.setItem !== "function") return null;
  return storage;
}
