import { useState } from "react";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import { useI18n } from "../../i18n";
import {
  useApproveJourneyBonusAward,
  useCreateJourneyBonusAward,
  useJourneyBonusAwards,
} from "./useCollaborators";

export function JourneyBonusAwardsPanel({
  collaboratorId,
  actorId,
  canManage,
}: {
  collaboratorId: string;
  actorId: string;
  canManage: boolean;
}) {
  const { t, formatCurrency, formatDate, formatDateTime } = useI18n();
  const awardsQuery = useJourneyBonusAwards(collaboratorId);
  const createMutation = useCreateJourneyBonusAward(collaboratorId);
  const approveMutation = useApproveJourneyBonusAward(collaboratorId);
  const [valueUnitCode, setValueUnitCode] = useState<"BRL" | "GOLD_GRAM">("BRL");
  const [amount, setAmount] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");

  const awards = awardsQuery.data ?? [];
  const submit = () => {
    const numericAmount = Number(amount);
    if (!(numericAmount > 0) || !effectiveDate) return;
    createMutation.mutate(
      { valueUnitCode, amount: numericAmount, effectiveDate, description: description.trim() || undefined },
      { onSuccess: () => { setAmount(""); setDescription(""); } },
    );
  };

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-950">{t("bonus.title")}</h2>
      <p className="mt-1 text-sm text-gray-500">{t("bonus.help")}</p>

      {canManage ? (
        <div className="mt-5 grid gap-3 border-t pt-4 md:grid-cols-2">
          <label className="text-sm font-medium text-gray-700">
            {t("bonus.valueUnit")}
            <select className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2" value={valueUnitCode} onChange={(e) => setValueUnitCode(e.target.value as "BRL" | "GOLD_GRAM")}>
              <option value="BRL">{t("bonus.brl")}</option>
              <option value="GOLD_GRAM">{t("bonus.goldGram")}</option>
            </select>
          </label>
          <label className="text-sm font-medium text-gray-700">
            {t("bonus.amount")}
            <input className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2" type="number" min="0.00000001" step={valueUnitCode === "BRL" ? "0.01" : "0.00000001"} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </label>
          <label className="text-sm font-medium text-gray-700">
            {t("bonus.effectiveDate")}
            <input className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2" type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
          </label>
          <label className="text-sm font-medium text-gray-700">
            {t("bonus.description")}
            <input className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2" value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <div className="md:col-span-2">
            <button type="button" disabled={createMutation.isPending || !(Number(amount) > 0) || !effectiveDate} onClick={submit} className="rounded-xl bg-gray-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {createMutation.isPending ? t("bonus.requesting") : t("bonus.request")}
            </button>
            <ApiErrorPanel error={createMutation.error} translate={t} />
          </div>
        </div>
      ) : null}

      <div className="mt-5 space-y-3">
        {awardsQuery.isLoading ? <p className="text-sm text-gray-500">{t("common.loading")}</p> : null}
        <ApiErrorPanel error={awardsQuery.error} translate={t} />
        {!awardsQuery.isLoading && awards.length === 0 ? <p className="text-sm text-gray-500">{t("bonus.none")}</p> : null}
        {awards.map((award) => {
          const canApprove = canManage && award.status === "PENDING_APPROVAL" && award.requestedByActorId !== actorId;
          const ownRequest = award.status === "PENDING_APPROVAL" && award.requestedByActorId === actorId;
          const amountLabel = award.valueUnitCode === "BRL" ? formatCurrency(award.amount, "BRL") : `${award.amount.toLocaleString(undefined, { maximumFractionDigits: 8 })} g`;
          return (
            <article key={award.id} className="rounded-xl border border-gray-200 p-4 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-gray-950">{t("bonus.receipt", { number: award.receiptNumber })}</p>
                  <p className="mt-1 text-gray-600">{amountLabel} · {formatDate(award.effectiveDate)}</p>
                  {award.description ? <p className="mt-1 text-gray-600">{award.description}</p> : null}
                </div>
                <span className="rounded-full bg-gray-100 px-3 py-1 font-medium text-gray-700">{award.status === "POSTED" ? t("bonus.posted") : t("bonus.pendingApproval")}</span>
              </div>
              <p className="mt-2 text-xs text-gray-500">{t("bonus.requestedAt")}: {formatDateTime(award.requestedAt)}</p>
              {award.approvedAt ? <p className="mt-1 text-xs text-gray-500">{t("bonus.approvedAt")}: {formatDateTime(award.approvedAt)}</p> : null}
              {ownRequest ? <p className="mt-3 text-sm font-medium text-amber-700">{t("bonus.awaitingSecondAdmin")}</p> : null}
              {canApprove ? (
                <button type="button" disabled={approveMutation.isPending} onClick={() => approveMutation.mutate(award.id)} className="mt-3 rounded-xl bg-gray-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
                  {approveMutation.isPending ? t("bonus.approving") : t("bonus.approve")}
                </button>
              ) : null}
            </article>
          );
        })}
        <ApiErrorPanel error={approveMutation.error} translate={t} />
      </div>
    </section>
  );
}
