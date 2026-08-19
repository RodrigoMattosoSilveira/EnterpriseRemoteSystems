import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  listAccountReactivationRequests,
  reviewAccountReactivationRequest,
} from "../../api/auth.api";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";

type ReactivationRequestsPanelProps = {
  defaultOpen?: boolean;
};

export function ReactivationRequestsPanel({
  defaultOpen = false,
}: ReactivationRequestsPanelProps = {}) {
  const queryClient = useQueryClient();
  const [reasonById, setReasonById] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(defaultOpen);
  const requests = useQuery({
    queryKey: ["auth", "reactivation-requests"],
    queryFn: listAccountReactivationRequests,
    enabled: open,
    refetchOnWindowFocus: false,
  });
  const review = useMutation({
    mutationFn: (input: { id: string; approve: boolean; reason: string }) =>
      reviewAccountReactivationRequest(input.id, input.approve, input.reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["auth", "reactivation-requests"] });
      void queryClient.invalidateQueries({ queryKey: ["auth", "accounts"] });
    },
  });

  const pending = (requests.data ?? []).filter((request) => request.status === "PENDING");

  return (
    <section
      id="account-reactivation-requests"
      className="mt-6 rounded-2xl border bg-white p-5"
      aria-label="Account reactivation requests"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Account reactivation requests</h2>
          <p className="mt-1 text-sm text-slate-600">
            Review requests for inactive global Authentication Accounts. Approval preserves all Actor bindings and starts a clean session boundary.
          </p>
          <p className="mt-1 text-sm text-slate-600">
            ERS does not currently notify the account holder of approval or rejection. After recording a decision, communicate the outcome through the normal support channel.
          </p>
        </div>
        {open ? (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">
            {pending.length} pending
          </span>
        ) : (
          <button
            type="button"
            className="rounded-lg border px-3 py-2 text-sm font-semibold"
            onClick={() => setOpen(true)}
          >
            Review requests
          </button>
        )}
      </div>

      {open && <ApiErrorPanel error={requests.error ?? review.error} />}

      {!open ? null : requests.isLoading ? (
        <p className="mt-4 text-sm text-slate-500">Loading reactivation requests…</p>
      ) : pending.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No pending reactivation requests.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {pending.map((request) => {
            const pendingThis = review.isPending && review.variables?.id === request.id;
            return (
              <article key={request.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-950">
                      {request.globalPersonName?.trim() || request.login}
                    </p>
                    <p className="mt-1 text-sm text-slate-600">{request.login}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Requested {new Date(request.lastRequestedAt).toLocaleString()} · {request.requestedByType === "TENANT_ADMIN" ? "Tenant Administrator" : "Account holder"}
                      {request.requestCount > 1 ? ` · ${request.requestCount} requests` : ""}
                      {request.requestedTenantId ? ` · Tenant ${request.requestedTenantId}` : ""}
                    </p>
                  </div>
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">Pending</span>
                </div>

                <label className="mt-3 block text-sm font-medium">
                  Review reason
                  <input
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                    value={reasonById[request.id] ?? ""}
                    onChange={(event) =>
                      setReasonById((current) => ({ ...current, [request.id]: event.target.value }))
                    }
                    placeholder="Required review reason"
                  />
                </label>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    disabled={pendingThis || review.isPending || !(reasonById[request.id] ?? "").trim()}
                    onClick={() =>
                      review.mutate({
                        id: request.id,
                        approve: true,
                        reason: reasonById[request.id] ?? "",
                      })
                    }
                  >
                    {pendingThis ? "Saving…" : "Approve reactivation"}
                  </button>
                  <button
                    className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50"
                    disabled={pendingThis || review.isPending || !(reasonById[request.id] ?? "").trim()}
                    onClick={() =>
                      review.mutate({
                        id: request.id,
                        approve: false,
                        reason: reasonById[request.id] ?? "",
                      })
                    }
                  >
                    Reject
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
