export type AuthenticationInterruptionReason = "expired" | "inactive" | null;

type Listener = () => void;
type AuthenticationRequiredListener = (reason: AuthenticationInterruptionReason) => void;

const authenticationRequiredListeners = new Set<AuthenticationRequiredListener>();
const forbiddenListeners = new Set<Listener>();

export function subscribeAuthenticationRequired(listener: AuthenticationRequiredListener): () => void {
  authenticationRequiredListeners.add(listener);
  return () => { authenticationRequiredListeners.delete(listener); };
}

export function notifyAuthenticationRequired(
  reason: AuthenticationInterruptionReason = "expired",
): void {
  for (const listener of authenticationRequiredListeners) listener(reason);
}

export function subscribeForbidden(listener: Listener): () => void {
  forbiddenListeners.add(listener);
  return () => { forbiddenListeners.delete(listener); };
}

export function notifyForbidden(): void {
  for (const listener of forbiddenListeners) listener();
}
