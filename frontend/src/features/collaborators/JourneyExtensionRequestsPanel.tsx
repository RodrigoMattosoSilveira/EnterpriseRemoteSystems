import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import { useAuthorizationContext } from "../../components/layout/AuthorizationContext";
import { useI18n, type TranslationKey } from "../../i18n";
import {
  useAcceptJourneyExtensionRequest,
  useCancelJourneyExtensionRequest,
  useJourneyExtensionRequests,
  useRejectJourneyExtensionRequest,
} from "./useCollaborators";

export function JourneyExtensionRequestsPanel({ collaboratorId }: { collaboratorId: string }) {
  const { t, formatDate } = useI18n();
  const actor = useAuthorizationContext();
  const canBrowse = actor.permissions.includes("*") || actor.permissions.includes("collaborators.read");
  const requests = useJourneyExtensionRequests(collaboratorId, !canBrowse);
  const accept = useAcceptJourneyExtensionRequest(collaboratorId);
  const reject = useRejectJourneyExtensionRequest(collaboratorId);
  const cancel = useCancelJourneyExtensionRequest(collaboratorId);
  const wildcard = actor.permissions.includes("*");
  const canCancel = wildcard || actor.permissions.includes("collaborators.update");
  const canRespond = actor.collaboratorId === collaboratorId && actor.permissions.includes("journey.extensions.self.respond");

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm lg:col-span-2">
      <h2 className="text-lg font-semibold text-gray-950">{t("journeyExtension.title")}</h2>
      <p className="mt-1 text-sm text-gray-500">{t("journeyExtension.help")}</p>
      <ApiErrorPanel error={requests.error || accept.error || reject.error || cancel.error} translate={t} />
      {requests.isLoading ? <p className="mt-4 text-sm text-gray-600">{t("common.loading")}</p> : null}
      {!requests.isLoading && (requests.data?.length ?? 0) === 0 ? (
        <p className="mt-4 rounded-xl bg-gray-50 p-3 text-sm text-gray-600">{t("journeyExtension.none")}</p>
      ) : null}
      <div className="mt-4 space-y-3">
        {requests.data?.map((request) => (
          <article key={request.id} className="rounded-xl border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-gray-950">{t("journeyExtension.receipt", { number: request.receiptNumber })}</p>
                <p className="mt-1 text-sm text-gray-600">{request.reason}</p>
              </div>
              <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold">{t(`journeyExtension.status.${request.status}` as TranslationKey)}</span>
            </div>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
              <div><dt className="text-gray-500">{t("journeyExtension.currentEnd")}</dt><dd>{formatDate(request.previousEndDate)}</dd></div>
              <div><dt className="text-gray-500">{t("journeyExtension.proposedEnd")}</dt><dd>{formatDate(request.proposedEndDate)}</dd></div>
              <div><dt className="text-gray-500">{t("journeyExtension.additionalDays")}</dt><dd>{request.additionalDays}</dd></div>
            </dl>
            {request.status === "PENDING" ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {canRespond ? <>
                  <button type="button" className="rounded-xl bg-emerald-700 px-3 py-2 text-sm font-semibold text-white" onClick={() => accept.mutate(request.id)} disabled={accept.isPending || reject.isPending}>{t("journeyExtension.accept")}</button>
                  <button type="button" className="rounded-xl border border-red-300 px-3 py-2 text-sm font-semibold text-red-700" onClick={() => reject.mutate(request.id)} disabled={accept.isPending || reject.isPending}>{t("journeyExtension.reject")}</button>
                </> : null}
                {canCancel ? <button type="button" className="rounded-xl border px-3 py-2 text-sm font-semibold" onClick={() => cancel.mutate(request.id)} disabled={cancel.isPending}>{t("journeyExtension.cancel")}</button> : null}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
