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
  const [message, setMessage] = useState("");
  const status = useQuery({
    queryKey: ["people", personId, "authentication"],
    queryFn: () => getPersonAuthenticationStatus(personId),
    refetchOnWindowFocus: false,
  });
  const enable = useMutation({
    mutationFn: () => enablePersonAuthentication(personId, temporaryPassword),
    onSuccess: () => {
      setTemporaryPassword("");
      setMessage("Authentication is enabled for this tenant.");
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

  return (
    <section className="mx-auto mt-6 max-w-4xl rounded-2xl border bg-white p-5" aria-label="Authentication">
      <h2 className="text-lg font-semibold">Authentication</h2>
      <p className="mt-1 text-sm text-slate-600">
        Tenant Administrators can enable authentication for a Person who already has an active Membership in this tenant. ERS owns the global Account create-or-reuse decision.
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
          <p className="mt-2 text-sm text-slate-600">
            Enter an initial temporary password. It is used only if ERS must create the global Authentication Account; an existing Account keeps its current credentials.
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
          <button
            type="button"
            className="mt-3 rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white disabled:opacity-50"
            disabled={enable.isPending || temporaryPassword.length < 12}
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
        </div>
      ) : current?.canRequestReactivation ? (
        <div className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
          <p className="font-semibold">Status: Enabled; Authentication Account inactive</p>
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
