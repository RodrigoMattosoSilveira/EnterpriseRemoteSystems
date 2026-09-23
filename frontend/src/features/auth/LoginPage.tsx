import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, Navigate, useLocation, useSearchParams } from "react-router-dom";
import { ApiError } from "../../api/client";
import { requestAccountReactivation } from "../../api/auth.api";
import { authenticate } from "../../app/authStore";
import { useAuthState } from "../../app/useAuth";
import { useI18n, translateEnglish, type Translate } from "../../i18n";
import { AuthCard, AuthField, primaryButtonClass } from "./AuthCard";

export default function LoginPage() {
  const auth = useAuthState();
  const queryClient = useQueryClient();
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
  const { t } = useI18n();

  // During an explicit login submission, authenticate() publishes the new
  // authenticated state before this handler can finish the browser handoff.
  // Do not let that state change trigger React Router's client-side <Navigate>
  // and mount protected queries in the old login document. The submit handler
  // below owns that transition and completes it with a full document navigation.
  if (
    auth.status === "authenticated" &&
    shouldAutoRedirectAuthenticatedLogin(submitting)
  ) {
    return (
      <Navigate
        to={authenticatedLoginTarget(
          auth.session.mustChangePassword,
          params.get("returnTo"),
        )}
        replace
      />
    );
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const request = loginRequestFromForm(event.currentTarget, { login, password });
    // Keep action state aligned with values supplied directly by a mobile
    // browser/password manager so subsequent error actions use the same
    // credentials that were actually submitted. The fields themselves remain
    // uncontrolled so React cannot overwrite a credential-manager DOM update
    // before FormData reads it.
    setLogin(request.login);
    setPassword(request.password);
    setSubmitting(true);
    setError("");
    setLoginErrorCode(null);
    setReactivationMessage("");
    setReactivationError("");
    let navigationStarted = false;
    try {
      const session = await authenticate(request);
      // A new Account/session can resolve a completely different tenant Actor.
      // Drop every query from the prior authenticated context before crossing
      // into the workspace so tenant-neutral query keys cannot briefly render
      // another Account's cached tenant data.
      queryClient.clear();

      // authenticate() publishes authenticated state before returning. While
      // submitting remains true, the render guard above deliberately suppresses
      // React Router's <Navigate>. Complete the login boundary with a real
      // same-origin document navigation so the newly issued HttpOnly cookie is
      // committed before the fresh application document starts its protected
      // /auth/session, tenant-options, and authorization requests.
      navigationStarted = true;
      window.location.replace(
        authenticatedLoginTarget(
          session.mustChangePassword,
          params.get("returnTo"),
        ),
      );
    } catch (cause) {
      navigationStarted = false;
      const presentation = loginFailurePresentation(cause, t);
      setError(presentation.message);
      setLoginErrorCode(presentation.code);
    } finally {
      // On success keep the form in its submitting state until the browser
      // unloads this document. Flipping it back to false would reopen the
      // authenticated-state <Navigate> race before location.replace commits.
      if (!navigationStarted) setSubmitting(false);
    }
  }

  async function requestReactivation() {
    setReactivationPending(true);
    setReactivationMessage("");
    setReactivationError("");
    try {
      await requestAccountReactivation({ login, password });
      setReactivationMessage(t("auth.reactivationRequested.message"));
      setPassword("");
    } catch (cause) {
      setReactivationError(
        cause instanceof Error ? cause.message : t("auth.unableRequestReactivation"),
      );
    } finally {
      setReactivationPending(false);
    }
  }

  if (reactivationMessage) {
    return (
      <AuthCard title={t("auth.reactivationRequested.title")} subtitle={t("auth.reactivationRequested.subtitle")}>
        <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">
          {reactivationMessage}
        </p>
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
          <p>
            {t("auth.reactivationRequested.noNotification")}
          </p>
          <p className="mt-2">
            {t("auth.reactivationRequested.communicate")}
          </p>
          <p className="mt-2">
            {t("auth.reactivationRequested.nextSteps")}
          </p>
        </div>
        <button
          type="button"
          className={`${primaryButtonClass} mt-4`}
          onClick={() => {
            setReactivationMessage("");
            setLoginErrorCode(null);
            setError("");
            setReactivationError("");
          }}
        >
          {t("auth.returnToSignIn")}
        </button>
      </AuthCard>
    );
  }

  return (
    <AuthCard title={t("auth.signIn.title")} subtitle={t("auth.signIn.subtitle")}>
      {auth.status === "anonymous" && auth.reason === "expired" && <p role="alert" className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{t("auth.sessionExpired")}</p>}
      {auth.status === "anonymous" && auth.reason === "inactive" && <p role="alert" className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{t("auth.accessInactive")}</p>}
      {location.state && typeof location.state === "object" && "message" in location.state && <p role="status" className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{String(location.state.message)}</p>}
      {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {reactivationError && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{reactivationError}</p>}
      <form onSubmit={submit} className="space-y-4">
        <AuthField
          label={t("auth.login")}
          name="login"
          type="email"
          autoComplete="username"
          defaultValue={login}
          onChange={(e) => setLogin(e.target.value)}
          required
        />
        <AuthField
          label={t("auth.password")}
          name="password"
          type="password"
          autoComplete="current-password"
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button className={primaryButtonClass} disabled={submitting}>{submitting ? t("auth.signingIn") : t("auth.signIn.title")}</button>
      </form>
      {(loginErrorCode === "account_security_suspended" || loginErrorCode === "account_inactive") && (
        <button
          type="button"
          className={`${primaryButtonClass} mt-3`}
          disabled={reactivationPending || !login.trim() || !password}
          onClick={() => void requestReactivation()}
        >
          {reactivationPending ? t("auth.requesting") : t("auth.requestReactivation")}
        </button>
      )}
      {!isInactiveLoginState(auth, loginErrorCode) && (
        <p className="mt-5 text-center text-sm text-slate-600"><Link className="underline" to="/password/reset">{t("auth.resetPasswordLink")}</Link></p>
      )}
    </AuthCard>
  );
}

export function shouldAutoRedirectAuthenticatedLogin(submitting: boolean): boolean {
  return !submitting;
}

export function authenticatedLoginTarget(
  mustChangePassword: boolean,
  returnTo: string | null,
): string {
  return mustChangePassword ? "/password/change" : safeReturnTo(returnTo);
}

export function loginRequestFromForm(
  form: HTMLFormElement,
  fallback: { login: string; password: string },
): { login: string; password: string } {
  const data = new FormData(form);
  const submittedLogin = data.get("login");
  const submittedPassword = data.get("password");

  return {
    // Mobile credential managers can update the DOM value without delivering
    // React's change event before submit. Prefer the browser's submitted form
    // value, while retaining state as a compatibility fallback.
    login: typeof submittedLogin === "string" ? submittedLogin : fallback.login,
    password:
      typeof submittedPassword === "string"
        ? submittedPassword
        : fallback.password,
  };
}

export function loginFailurePresentation(cause: unknown, t: Translate = translateEnglish): {
  code: string | null;
  message: string;
} {
  if (cause instanceof ApiError) {
    if (cause.code === "account_security_suspended") {
      return {
        code: cause.code,
        message: t("auth.error.securitySuspended"),
      };
    }
    if (cause.code === "account_operationally_inactive") {
      return {
        code: cause.code,
        message: t("auth.error.operationallyInactive"),
      };
    }
    if (cause.code === "account_inactive") {
      return {
        code: cause.code,
        message: t("auth.error.accountInactive"),
      };
    }
    if (cause.code === "actor_inactive") {
      return {
        code: cause.code,
        message: t("auth.error.actorInactive"),
      };
    }
    if (cause.status === 401) {
      return { code: cause.code ?? null, message: t("auth.error.invalidCredentials") };
    }
  }

  return {
    code: null,
    message: cause instanceof Error ? cause.message : t("auth.error.unableSignIn"),
  };
}

export function isInactiveLoginState(
  auth: ReturnType<typeof useAuthState>,
  loginErrorCode: string | null,
): boolean {
  return (
    (auth.status === "anonymous" && auth.reason === "inactive") ||
    loginErrorCode === "account_inactive" ||
    loginErrorCode === "account_security_suspended" ||
    loginErrorCode === "account_operationally_inactive" ||
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
