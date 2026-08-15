import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ApiError } from "../../api/client";
import { requestAccountReactivation } from "../../api/auth.api";
import { authenticate } from "../../app/authStore";
import { useAuthState } from "../../app/useAuth";
import { AuthCard, AuthField, primaryButtonClass } from "./AuthCard";

export default function LoginPage() {
  const auth = useAuthState();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const [login, setLogin] = useState(() => loginFromLocationState(location.state));
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loginErrorCode, setLoginErrorCode] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [reactivationPending, setReactivationPending] = useState(false);
  const [reactivationMessage, setReactivationMessage] = useState("");
  const [reactivationError, setReactivationError] = useState("");

  if (auth.status === "authenticated") {
    return <Navigate to={auth.session.mustChangePassword ? "/password/change" : safeReturnTo(params.get("returnTo"))} replace />;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    setLoginErrorCode(null);
    setReactivationMessage("");
    setReactivationError("");
    try {
      const session = await authenticate({ login, password });
      navigate(session.mustChangePassword ? "/password/change" : safeReturnTo(params.get("returnTo")), { replace: true });
    } catch (cause) {
      const presentation = loginFailurePresentation(cause);
      setError(presentation.message);
      setLoginErrorCode(presentation.code);
    } finally {
      setSubmitting(false);
    }
  }

  async function requestReactivation() {
    setReactivationPending(true);
    setReactivationMessage("");
    setReactivationError("");
    try {
      await requestAccountReactivation({ login, password });
      setReactivationMessage("Reactivation requested. An Application Administrator will review your request.");
      setPassword("");
    } catch (cause) {
      setReactivationError(
        cause instanceof Error ? cause.message : "Unable to request account reactivation.",
      );
    } finally {
      setReactivationPending(false);
    }
  }

  return (
    <AuthCard title="Sign in" subtitle="Use your ERS account to continue.">
      {auth.status === "anonymous" && auth.reason === "expired" && <p role="alert" className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Your session expired. Sign in again to continue.</p>}
      {auth.status === "anonymous" && auth.reason === "inactive" && <p role="alert" className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Your authentication account is inactive. Request reactivation to regain access.</p>}
      {location.state && typeof location.state === "object" && "message" in location.state && <p role="status" className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{String(location.state.message)}</p>}
      {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {reactivationError && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{reactivationError}</p>}
      {reactivationMessage && <p role="status" className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{reactivationMessage}</p>}
      <form onSubmit={submit} className="space-y-4">
        <AuthField label="Login" type="email" autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} required />
        <AuthField label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button className={primaryButtonClass} disabled={submitting}>{submitting ? "Signing in…" : "Sign in"}</button>
      </form>
      {loginErrorCode === "account_inactive" && !reactivationMessage && (
        <button
          type="button"
          className={`${primaryButtonClass} mt-3`}
          disabled={reactivationPending || !login.trim() || !password}
          onClick={() => void requestReactivation()}
        >
          {reactivationPending ? "Requesting…" : "Request reactivation"}
        </button>
      )}
      {!isInactiveLoginState(auth, loginErrorCode) && (
        <p className="mt-5 text-center text-sm text-slate-600"><Link className="underline" to="/password/reset">Reset a password</Link></p>
      )}
    </AuthCard>
  );
}

export function loginFailurePresentation(cause: unknown): {
  code: string | null;
  message: string;
} {
  if (cause instanceof ApiError) {
    if (cause.code === "account_inactive") {
      return {
        code: cause.code,
        message: "Your authentication account is inactive. Request reactivation to regain access.",
      };
    }
    if (cause.code === "actor_inactive") {
      return {
        code: cause.code,
        message: "Your authorization access is inactive. Contact a Tenant Administrator.",
      };
    }
    if (cause.status === 401) {
      return { code: cause.code ?? null, message: "The login or password is incorrect." };
    }
  }

  return {
    code: null,
    message: cause instanceof Error ? cause.message : "Unable to sign in.",
  };
}

export function isInactiveLoginState(
  auth: ReturnType<typeof useAuthState>,
  loginErrorCode: string | null,
): boolean {
  return (
    (auth.status === "anonymous" && auth.reason === "inactive") ||
    loginErrorCode === "account_inactive" ||
    loginErrorCode === "actor_inactive"
  );
}

export function loginFromLocationState(value: unknown): string {
  if (typeof value !== "object" || value === null || !("login" in value)) {
    return "";
  }
  const login = (value as { login?: unknown }).login;
  return typeof login === "string" ? login.trim().toLowerCase() : "";
}

export function safeReturnTo(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/";

  const pathname = value.split(/[?#]/, 1)[0];
  if (
    pathname === "/login" ||
    pathname === "/forbidden" ||
    pathname === "/password/reset"
  ) {
    return "/";
  }

  return value;
}
