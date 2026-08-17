import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import {
  initializeAuthSession,
  revalidateAuthSession,
} from "../../app/authStore";
import { useAuthState } from "../../app/useAuth";

export function RequireAuth({ children }: { children: ReactNode }) {
  const auth = useAuthState();
  const location = useLocation();
  const accountId = auth.status === "authenticated" ? auth.session.accountId : "";
  // Revalidate when the authenticated account or protected route changes.
  // Query-string and hash changes are page-local UI state (for example,
  // switching People between card and list views) and must not unmount the
  // protected application shell.
  const validationKey = `${accountId}:${location.pathname}`;
  const [validatedKey, setValidatedKey] = useState("");
  const [backgroundValidation, setBackgroundValidation] = useState(false);
  const validatedAccountRef = useRef("");
  const lastValidationKeyRef = useRef("");

  const validateCurrentSession = useCallback(async (suspendPage: boolean) => {
    if (!accountId) return;
    const expectedAccountId = accountId;
    if (suspendPage) {
      setValidatedKey("");
    } else {
      setBackgroundValidation(true);
    }
    try {
      const next = await revalidateAuthSession();
      if (
        next.status === "authenticated" &&
        next.session.accountId === expectedAccountId
      ) {
        setValidatedKey(validationKey);
      }
    } finally {
      if (!suspendPage) {
        setBackgroundValidation(false);
      }
    }
  }, [accountId, validationKey]);

  useEffect(() => {
    if (!accountId) {
      validatedAccountRef.current = "";
      lastValidationKeyRef.current = "";
      setValidatedKey("");
      return;
    }

    if (validatedAccountRef.current !== accountId) {
      // Reaching an authenticated AuthState already required a successful
      // /auth/session load or login response. Treat that fresh server result as
      // the first protected-route validation instead of immediately issuing a
      // redundant second /auth/session request. Later pathname changes still
      // revalidate below, and focus/visibility checks remain unchanged.
      validatedAccountRef.current = accountId;
      lastValidationKeyRef.current = validationKey;
      setValidatedKey(validationKey);
      return;
    }

    // React StrictMode intentionally re-runs mount effects in development. Do
    // not turn that diagnostic replay into a second server-side session check.
    if (lastValidationKeyRef.current === validationKey) return;

    lastValidationKeyRef.current = validationKey;
    void validateCurrentSession(true);
  }, [accountId, validateCurrentSession, validationKey]);

  useEffect(() => {
    const validate = () => {
      if (document.visibilityState === "visible") {
        // Focus/visibility checks preserve the mounted page so partially
        // completed forms are not discarded merely because the user copied
        // information from another window. A blocking overlay prevents use of
        // the protected page until the server confirms the session. If the
        // session is no longer valid, revalidateAuthSession updates the auth
        // store and this guard immediately redirects to login.
        void validateCurrentSession(false);
      }
    };
    window.addEventListener("focus", validate);
    document.addEventListener("visibilitychange", validate);
    return () => {
      window.removeEventListener("focus", validate);
      document.removeEventListener("visibilitychange", validate);
    };
  }, [validateCurrentSession]);

  if (auth.status === "unknown" || auth.status === "loading") {
    return (
      <main className="grid min-h-screen place-items-center text-slate-600">
        Loading your session…
      </main>
    );
  }
  if (auth.status === "error") {
    return (
      <main className="grid min-h-screen place-items-center p-6">
        <section className="max-w-md rounded-2xl border bg-white p-6">
          <h1 className="text-xl font-bold">Unable to verify your session</h1>
          <p className="mt-2 text-sm text-slate-600">{auth.error.message}</p>
          <button
            className="mt-4 rounded-lg bg-slate-900 px-4 py-2 text-white"
            onClick={() => void initializeAuthSession()}
          >
            Try again
          </button>
        </section>
      </main>
    );
  }
  if (auth.status === "anonymous") {
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    return (
      <Navigate
        to={`/login?returnTo=${encodeURIComponent(returnTo)}`}
        replace
      />
    );
  }
  if (validatedKey !== validationKey) {
    return (
      <main className="grid min-h-screen place-items-center text-slate-600">
        Verifying your session…
      </main>
    );
  }
  if (
    auth.session.mustChangePassword &&
    location.pathname !== "/password/change"
  ) {
    return <Navigate to="/password/change" replace />;
  }
  return (
    <>
      {children}
      {backgroundValidation && (
        <div
          role="status"
          className="fixed inset-0 z-[100] grid place-items-center bg-white/70 text-slate-700 backdrop-blur-sm"
        >
          Verifying your session…
        </div>
      )}
    </>
  );
}
