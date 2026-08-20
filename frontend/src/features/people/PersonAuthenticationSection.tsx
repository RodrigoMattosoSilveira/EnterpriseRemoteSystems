import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  enablePersonAuthentication,
  getPersonAuthenticationStatus,
  requestPersonAuthenticationReactivation,
} from "../../api/people.api";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";

export function PersonAuthenticationSection({ personId }: { personId: string }) {
  const queryClient = useQueryClient();
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [confirmTemporaryPassword, setConfirmTemporaryPassword] = useState("");
  const [message, setMessage] = useState("");
  const status = useQuery({
    queryKey: ["people", personId, "authentication"],
    queryFn: () => getPersonAuthenticationStatus(personId),
    refetchOnWindowFocus: false,
  });
  const requiresTemporaryPassword = status.data?.requiresTemporaryPassword !== false;
  const enable = useMutation({
    mutationFn: () =>
      enablePersonAuthentication(
        personId,
        requiresTemporaryPassword ? temporaryPassword : undefined,
      ),
    onSuccess: (result) => {
      const usedTemporaryPassword = requiresTemporaryPassword;
      setTemporaryPassword("");
      setConfirmTemporaryPassword("");
      setMessage(
        usedTemporaryPassword
          ? `Authentication is enabled for this tenant. Account login: ${result.login}. ` +
              "Sign in with the temporary password entered here; ERS will require a password change on first sign-in."
          : `Authentication is enabled for this tenant. Account login: ${result.login}. ` +
              "Account credentials were not changed.",
      );
      void queryClient.invalidateQueries({ queryKey: ["people", personId, "authentication"] });
    },
  });
  const requestReactivation = useMutation({
    mutationFn: () => requestPersonAuthenticationReactivation(personId),
    onSuccess: () => {
      setMessage("Authentication reactivation requested. An Application Administrator will review it.");
    },
  });

  const current = status.data;
  const error = status.error ?? enable.error ?? requestReactivation.error;
  const passwordConfirmationMismatch =
    confirmTemporaryPassword.length > 0 && temporaryPassword !== confirmTemporaryPassword;

  return (
    <section className="mx-auto mt-6 max-w-4xl rounded-2xl border bg-white p-5" aria-label="Authentication">
      <h2 className="text-lg font-semibold">Authentication</h2>
      <p className="mt-1 text-sm text-slate-600">
        Tenant Administrators can enable authentication for a Person who already has an ACTIVE Membership in this tenant. ERS creates or reuses the global Authentication Account and creates the missing Account-bound Tenant Actor. Existing inactive Tenant Actors are reactivated from Tenant Authorization.
      </p>

      <ApiErrorPanel error={error} />
      {message && (
        <p role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
          {message}
        </p>
      )}

      {status.isLoading ? (
        <p className="mt-4 text-sm text-slate-500">Loading authentication status…</p>
      ) : current && !current.enabled ? (
        <div className="mt-4">
          <p className="font-medium text-slate-950">Status: Not enabled for this tenant</p>
          {requiresTemporaryPassword ? (
            <>
              <p className="mt-1 text-sm text-slate-700">
                Account login: <span className="font-mono">{current.login}</span>
              </p>
              <p className="mt-2 text-sm text-slate-600">
                Enter and confirm an initial temporary password. ERS will use it to create this Person&apos;s global Authentication Account.
              </p>
              <label className="mt-3 block text-sm font-medium">
                Initial temporary password
                <input
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                  type="password"
                  minLength={12}
                  autoComplete="new-password"
                  value={temporaryPassword}
                  onChange={(event) => setTemporaryPassword(event.target.value)}
                />
              </label>
              <label className="mt-3 block text-sm font-medium">
                Confirm temporary password
                <input
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                  type="password"
                  minLength={12}
                  autoComplete="new-password"
                  value={confirmTemporaryPassword}
                  onChange={(event) => setConfirmTemporaryPassword(event.target.value)}
                />
              </label>
              {passwordConfirmationMismatch && (
                <p role="alert" className="mt-2 text-sm text-red-700">
                  The temporary passwords do not match.
                </p>
              )}
            </>
          ) : (
            <p className="mt-2 text-sm text-slate-600">
              Enable authentication for this Person in the current tenant. No credential changes are required for this operation.
            </p>
          )}
          <button
            type="button"
            className="mt-3 rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white disabled:opacity-50"
            disabled={
              enable.isPending ||
              (requiresTemporaryPassword &&
                (temporaryPassword.length < 12 ||
                  confirmTemporaryPassword.length < 12 ||
                  temporaryPassword !== confirmTemporaryPassword))
            }
            onClick={() => {
              setMessage("");
              enable.mutate();
            }}
          >
            {enable.isPending ? "Enabling…" : "Enable Authentication"}
          </button>
        </div>
      ) : current?.accountActive ? (
        <div className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">
          <p className="font-semibold">Status: Enabled</p>
          <p className="mt-1">Authentication is enabled for this Person in the current tenant.</p>
          <p className="mt-1">
            Account login: <span className="font-mono">{current.login}</span>
          </p>
        </div>
      ) : current?.canRequestReactivation ? (
        <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
          <p className="font-semibold">Status: Enabled; Authentication Account inactive</p>
          <p className="mt-1">
            Account login: <span className="font-mono">{current.login}</span>
          </p>
          <p className="mt-1">
            A Tenant Administrator may request reactivation, but cannot reactivate the global Account directly.
          </p>
          <button
            type="button"
            className="mt-3 rounded-lg border border-amber-300 bg-white px-3 py-2 font-semibold text-amber-950 disabled:opacity-50"
            disabled={requestReactivation.isPending}
            onClick={() => {
              setMessage("");
              requestReactivation.mutate();
            }}
          >
            {requestReactivation.isPending ? "Requesting…" : "Request Authentication Reactivation"}
          </button>
        </div>
      ) : null}
    </section>
  );
}
