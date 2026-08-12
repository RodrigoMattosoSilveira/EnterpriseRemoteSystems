import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ApiError } from "../../api/client";
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
  const [submitting, setSubmitting] = useState(false);

  if (auth.status === "authenticated") {
    return <Navigate to={auth.session.mustChangePassword ? "/password/change" : safeReturnTo(params.get("returnTo"))} replace />;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const session = await authenticate({ login, password });
      navigate(session.mustChangePassword ? "/password/change" : safeReturnTo(params.get("returnTo")), { replace: true });
    } catch (cause) {
      setError(cause instanceof ApiError && cause.status === 401 ? "The login or password is incorrect." : cause instanceof Error ? cause.message : "Unable to sign in.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard title="Sign in" subtitle="Use your ERS account to continue.">
      {auth.status === "anonymous" && auth.reason === "expired" && <p role="alert" className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Your session expired. Sign in again to continue.</p>}
      {auth.status === "anonymous" && auth.reason === "inactive" && <p role="alert" className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Your account is inactive. Contact an Application Administrator.</p>}
      {location.state && typeof location.state === "object" && "message" in location.state && <p role="status" className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{String(location.state.message)}</p>}
      {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <form onSubmit={submit} className="space-y-4">
        <AuthField label="Login" type="email" autoComplete="username" value={login} onChange={(e) => setLogin(e.target.value)} required />
        <AuthField label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <button className={primaryButtonClass} disabled={submitting}>{submitting ? "Signing in…" : "Sign in"}</button>
      </form>
      <p className="mt-5 text-center text-sm text-slate-600"><Link className="underline" to="/password/reset">Reset a password</Link></p>
    </AuthCard>
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
