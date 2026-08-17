import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listAccountReactivationRequestsForAlert } from "../../api/auth.api";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";

export function ReactivationRequestsAlert() {
  const requests = useQuery({
    queryKey: ["auth", "reactivation-requests"],
    queryFn: listAccountReactivationRequestsForAlert,
    refetchOnWindowFocus: false,
  });

  if (requests.error) {
    return <ApiErrorPanel error={requests.error} />;
  }

  const pendingCount = (requests.data ?? []).filter(
    (request) => request.status === "PENDING",
  ).length;

  if (requests.isLoading || pendingCount === 0) {
    return null;
  }

  const noun = pendingCount === 1 ? "account is" : "accounts are";

  return (
    <section
      aria-label="Pending account reactivation requests"
      className="rounded-2xl border-2 border-red-500 bg-white p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="text-lg font-bold text-red-700">
              !
            </span>
            <h2 className="text-lg font-semibold text-red-800">
              Account Reactivation Requests
            </h2>
            <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-800">
              {pendingCount} pending
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-700">
            {pendingCount} authentication {noun} awaiting Application Administrator review.
          </p>
        </div>

        <Link
          to="/admin/authentication#account-reactivation-requests"
          className="rounded-xl border border-red-600 bg-white px-4 py-2 text-sm font-semibold text-red-700 shadow-sm hover:bg-red-50"
        >
          Review requests
        </Link>
      </div>
    </section>
  );
}
