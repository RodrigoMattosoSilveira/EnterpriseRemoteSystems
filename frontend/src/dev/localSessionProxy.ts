export const LOCAL_SESSION_TOKEN_HEADER = "X-ERS-Local-Session";
export const DEFAULT_SESSION_COOKIE_NAME = "ers_session";

export function isPrivateLanHost(hostHeader: string): boolean {
  const hostname = hostHeader.trim().split(":", 1)[0] ?? "";
  const octets = hostname.split(".").map((value) => Number(value));
  if (
    octets.length !== 4 ||
    octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)
  ) {
    return false;
  }
  return (
    octets[0] === 10 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  );
}

export function firstHeaderValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0]?.trim() ?? "";
  return value?.trim() ?? "";
}

export function sessionTokenFromSetCookie(
  setCookie: string[] | string | undefined,
  cookieName = DEFAULT_SESSION_COOKIE_NAME,
): string {
  const values = Array.isArray(setCookie)
    ? setCookie
    : setCookie
      ? [setCookie]
      : [];

  for (const value of values) {
    const cookiePair = value.split(";", 1)[0]?.trim() ?? "";
    const separator = cookiePair.indexOf("=");
    if (separator <= 0) continue;
    const name = cookiePair.slice(0, separator).trim();
    if (name !== cookieName) continue;
    return cookiePair.slice(separator + 1).trim();
  }

  return "";
}

export function replaceSessionCookie(
  cookieHeader: string | undefined,
  token: string,
  cookieName = DEFAULT_SESSION_COOKIE_NAME,
): string {
  const preserved = (cookieHeader ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => {
      const separator = part.indexOf("=");
      const name = separator < 0 ? part : part.slice(0, separator);
      return name.trim() !== cookieName;
    });

  preserved.push(`${cookieName}=${token}`);
  return preserved.join("; ");
}
