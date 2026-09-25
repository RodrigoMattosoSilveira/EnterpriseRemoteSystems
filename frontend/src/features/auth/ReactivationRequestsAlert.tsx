import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listAccountReactivationRequestsForAlert } from "../../api/auth.api";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import { useI18n } from "../../i18n";

export function ReactivationRequestsAlert() {
  const { t } = useI18n();
  const requests = useQuery({
    queryKey: ["auth", "reactivation-requests", "alert"],
    queryFn: listAccountReactivationRequestsForAlert,
    refetchOnWindowFocus: false,
  });

  if (requests.error) {
    return <ApiErrorPanel error={requests.error} translate={t} />;
  }

  const requestList = Array.isArray(requests.data) ? requests.data : [];
  const pendingCount = requestList.filter(
    (request) => request?.status === "PENDING",
  ).length;

  if (requests.isLoading || pendingCount === 0) {
    return null;
  }

  return (
    <section
      aria-label={t("reactivation.alert.aria")}
      className="rounded-2xl border-2 border-red-500 bg-white p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="text-lg font-bold text-red-700">
              !
            </span>
            <h2 className="text-lg font-semibold text-red-800">
              {t("reactivation.alert.title")}
            </h2>
            <span className="rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-800">
              {t("reactivation.pendingCount", { count: pendingCount })}
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-700">
            {t(pendingCount === 1 ? "reactivation.alert.message.one" : "reactivation.alert.message.many", { count: pendingCount })}
          </p>
        </div>

        <Link
          to="/admin/authentication#account-reactivation-requests"
          className="rounded-xl border border-red-600 bg-white px-4 py-2 text-sm font-semibold text-red-700 shadow-sm hover:bg-red-50"
        >
          {t("reactivation.reviewRequests")}
        </Link>
      </div>
    </section>
  );
}
