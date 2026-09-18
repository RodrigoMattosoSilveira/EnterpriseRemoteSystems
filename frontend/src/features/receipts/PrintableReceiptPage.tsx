import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import { useAuthorizationContext } from "../../components/layout/AuthorizationContext";
import type { PrintableReceipt } from "../../types/receipts";
import {
  canPrintReceipt,
  canReturnReceipt,
  isReceiptTerminal,
  receiptLifecycleSteps,
  receiptStatusLabel,
  receiptStatusTone,
} from "./receiptLifecycle";
import { useAcceptReceipt, usePrintableReceipt, usePrintReceipt, useReturnReceipt } from "./useReceipt";
import { PageTitle } from "../../components/layout/PageHeading";
import { useI18n } from "../../i18n";
import {
  acceptanceMethodLabel,
  acceptingPartyCodeLabel,
  ledgerEntryTypeLabel,
  paymentDirectionCodeLabel,
  receiptPurposeLabel,
} from "../../i18n/financialLabels";

export function PrintableReceiptPage() {
  const { t, formatCurrency, formatDate, formatNumber, formatDateTime } = useI18n();
  const { entryId = "" } = useParams();
  const actor = useAuthorizationContext();
  const wildcard = actor.permissions.includes("*");
  const selfServiceReceipt =
    !wildcard &&
    !actor.permissions.includes("ledger.receipts.read") &&
    actor.permissions.includes("ledger.receipts.self.read");
  const receipt = usePrintableReceipt(entryId, selfServiceReceipt);
  const printReceipt = usePrintReceipt(entryId);
  const returnReceipt = useReturnReceipt(entryId);
  const acceptReceipt = useAcceptReceipt(entryId);
  const [signedDocumentRef, setSignedDocumentRef] = useState("");
  const [notes, setNotes] = useState("");

  async function print() {
    await printReceipt.mutateAsync();
    window.print();
  }

  async function recordReturned() {
    await returnReceipt.mutateAsync({ signedDocumentRef, notes });
  }

  async function acceptInApp() {
    await acceptReceipt.mutateAsync({ confirm: true, notes });
  }

  if (receipt.isLoading) return <main className="p-6">{t("receipt.loading")}</main>;
  if (receipt.error) return <main className="p-6"><ApiErrorPanel error={receipt.error} translate={t} /></main>;
  if (!receipt.data) return <main className="p-6">{t("receipt.notFound")}</main>;

  const data = receipt.data;
  const finalSettlementReceipt = data.receiptPurpose === "FINAL_SETTLEMENT_TENANT_PAYMENT" || data.receiptPurpose === "FINAL_SETTLEMENT_COLLABORATOR_PAYMENT";
  const canPrint = canPrintReceipt(data) && (wildcard || actor.permissions.includes("ledger.receipts.print"));
  const canReturn = canReturnReceipt(data) && !finalSettlementReceipt && (wildcard || actor.permissions.includes("ledger.receipts.return"));
  const canAcceptAsCollaborator =
    data.acceptingParty === "COLLABORATOR" &&
    actor.collaboratorId === data.collaboratorId &&
    actor.permissions.includes("ledger.receipts.self.accept");
  const canAcceptAsTenant =
    data.acceptingParty === "TENANT" &&
    actor.scope === "TENANT" &&
    actor.permissions.includes("ledger.receipts.tenant.accept");
  const canAccept = finalSettlementReceipt && !isReceiptTerminal(data.status) && (canAcceptAsCollaborator || canAcceptAsTenant);
  const terminal = isReceiptTerminal(data.status);
  const cancelledReceipt = data.status === "CANCELLED";
  const signedDocumentReady = signedDocumentRef.trim().length > 0;

  return (
    <main className="min-h-screen bg-gray-100 p-4 print:bg-white print:p-0">
      <section className="mx-auto max-w-3xl rounded-2xl bg-white p-8 shadow-sm print:rounded-none print:shadow-none">
        <div className="print:hidden">
          <Link className="text-sm font-semibold underline" to={`/collaborators/${data.collaboratorId}`}>{t("receipt.backCollaborator")}</Link>

          {finalSettlementReceipt ? (
            <SettlementReceiptLifecyclePanel receipt={data} />
          ) : cancelledReceipt ? (
            <CancelledReceiptPanel />
          ) : (
            <ReceiptLifecyclePanel receipt={data} />
          )}

          {!finalSettlementReceipt && !cancelledReceipt ? (
          <div className="mt-4 grid gap-4 rounded-2xl border p-4">
            <div>
              <h2 className="text-lg font-bold">{t("receipt.printStep")}</h2>
              <p className="mt-1 text-sm text-gray-600">
                {t("receipt.printHelp")}
              </p>
            </div>
            {terminal ? (
              <p className="rounded-xl bg-gray-100 p-3 text-sm font-medium text-gray-700">
                {t("receipt.terminalPrint", { status: receiptStatusLabel(data.status, t) })}
              </p>
            ) : null}
            <button type="button" disabled={!canPrint || printReceipt.isPending} onClick={print} className="rounded-xl bg-gray-900 px-4 py-2 font-semibold text-white disabled:opacity-50">
              {printReceipt.isPending ? t("receipt.preparing") : canPrint ? t("receipt.print") : t("receipt.unavailablePrint", { status: receiptStatusLabel(data.status, t).toLowerCase() })}
            </button>
            {printReceipt.error ? <ApiErrorPanel error={printReceipt.error} translate={t} /> : null}
          </div>
          ) : null}

          {finalSettlementReceipt ? (
            <div className="mt-4 grid gap-4 rounded-2xl border border-green-200 bg-green-50 p-4">
              <div>
                <h2 className="text-lg font-bold">{t("receipt.acceptance")}</h2>
                <p className="mt-1 text-sm text-gray-700">
                  {data.acceptingParty === "COLLABORATOR"
                    ? t("receipt.acceptCollaboratorHelp")
                    : t("receipt.acceptTenantHelp")}
                </p>
              </div>
              {data.acceptedAt ? (
                <p className="rounded-xl bg-white p-3 text-sm font-medium text-green-800">
                  {t("receipt.acceptedFinal", { actor: data.acceptedBy || t("receipt.authorizedActor"), date: formatDateTime(data.acceptedAt) })}
                </p>
              ) : canAccept ? (
                <>
                  <label className="grid gap-1 text-sm font-medium">
                    <span>{t("receipt.acceptanceNotes")}</span>
                    <textarea className="min-h-20 rounded-xl border px-3 py-2" value={notes} onChange={(e) => setNotes(e.target.value)} />
                  </label>
                  <button type="button" disabled={acceptReceipt.isPending} onClick={acceptInApp} className="rounded-xl bg-green-700 px-4 py-2 font-semibold text-white disabled:opacity-50">
                    {acceptReceipt.isPending ? t("receipt.accepting") : t("receipt.acceptPayment")}
                  </button>
                  {acceptReceipt.error ? <ApiErrorPanel error={acceptReceipt.error} translate={t} /> : null}
                </>
              ) : (
                <p className="rounded-xl bg-white p-3 text-sm text-gray-700">{t("receipt.acceptOnlyDesignated", { party: data.acceptingParty === "TENANT" ? t("receipt.party.tenantAdmin") : t("receipt.party.collaborator") })}</p>
              )}
            </div>
          ) : null}

          {!finalSettlementReceipt && !cancelledReceipt ? (
          <div className="mt-4 grid gap-4 rounded-2xl border p-4">
            <div>
              <h2 className="text-lg font-bold">{t("receipt.signedReturn")}</h2>
              <p className="mt-1 text-sm text-gray-600">
                {t("receipt.returnHelp")}
              </p>
            </div>
            {terminal ? (
              <p className="rounded-xl bg-gray-100 p-3 text-sm font-medium text-gray-700">
                {t("receipt.terminalReturn", { status: receiptStatusLabel(data.status, t) })}
              </p>
            ) : null}
            <label className="grid gap-1 text-sm font-medium">
              <span>{t("receipt.signedDocument")} <span className="text-red-700">*</span></span>
              <input className="rounded-xl border px-3 py-2" placeholder={t("receipt.signedDocumentPlaceholder")} value={signedDocumentRef} onChange={(e) => setSignedDocumentRef(e.target.value)} disabled={!canReturn} required aria-describedby="signed-document-ref-help" />
              <span id="signed-document-ref-help" className="text-xs text-gray-500">{t("receipt.signedDocumentHelp")}</span>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              <span>{t("common.notes")}</span>
              <textarea className="min-h-20 rounded-xl border px-3 py-2" value={notes} onChange={(e) => setNotes(e.target.value)} disabled={!canReturn} />
            </label>
            <button type="button" disabled={!canReturn || !signedDocumentReady || returnReceipt.isPending} onClick={recordReturned} className="rounded-xl bg-green-700 px-4 py-2 font-semibold text-white disabled:opacity-50">
              {returnReceipt.isPending ? t("receipt.recording") : data.status === "RETURNED" ? t("receipt.returned") : !signedDocumentReady && canReturn ? t("receipt.enterDocumentFirst") : t("receipt.recordReturn")}
            </button>
            {returnReceipt.error ? <ApiErrorPanel error={returnReceipt.error} translate={t} /> : null}
          </div>
          ) : null}
        </div>

        <header className="mt-8 border-b pb-5 text-center print:mt-0">
          <p className="text-sm font-semibold uppercase tracking-widest">Enterprise Remote Systems</p>
          <PageTitle className="mt-2">{t("receipt.title")}</PageTitle>
          <p className="mt-2 font-mono text-sm">{data.receiptNumber}</p>
        </header>

        <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-2">
          <Item label={t("receipt.collaborator")} value={data.collaboratorLabel} />
          <Item label="Tenant" value={data.tenantId} />
          <Item label={t("receipt.personOwner")} value={data.personId} />
          <Item label={t("receipt.journeyProvenance")} value={data.collaboratorId} />
          <Item label={t("common.legalName")} value={data.collaboratorLegalName} />
          <Item label="CPF" value={data.collaboratorCpf} />
          <Item label={t("receipt.effectiveDate")} value={formatDate(data.effectiveDate)} />
          <Item label={t("receipt.transaction")} value={ledgerEntryTypeLabel(data.entryType, t)} />
          <Item label={t("receipt.purpose")} value={receiptPurposeLabel(data.receiptPurpose || data.receiptType, t)} />
          <Item label={t("receipt.paymentDirection")} value={paymentDirectionCodeLabel(data.paymentDirection || "ACCOUNT_DEBIT", t)} />
          <Item label={t("receipt.acceptingParty")} value={acceptingPartyCodeLabel(data.acceptingParty || "COLLABORATOR", t)} />
          <Item label={t("receipt.amount")} value={data.valueUnitCode === "BRL" ? formatCurrency(data.amount, "BRL") : `${formatNumber(data.amount, { maximumFractionDigits: 8 })} ${t("account.goldUnit")}`} />
          <Item label={t("common.status")} value={finalSettlementReceipt && data.acceptedAt ? t("receipt.accepted") : receiptStatusLabel(data.status, t)} />
          {finalSettlementReceipt ? (
            <>
              <Item label={t("receipt.acceptedAt")} value={formatDateTime(data.acceptedAt) || t("receipt.awaitingInApp")} />
              <Item label={t("receipt.acceptedBy")} value={data.acceptedBy || t("receipt.awaitingDesignated")} />
              <Item label={t("receipt.acceptanceMethod")} value={data.acceptanceMethod ? acceptanceMethodLabel(data.acceptanceMethod, t) : t("receipt.inApp")} />
            </>
          ) : (
            <>
              <Item label={t("receipt.issuedBy")} value={data.issuedBy || t("receipt.pendingPrint")} />
              <Item label={t("receipt.printedAt")} value={formatDateTime(data.printedAt) || t("receipt.notPrinted")} />
              <Item label={t("receipt.signedAt")} value={formatDateTime(data.signedAt) || t("receipt.notSigned")} />
              <Item label={t("receipt.returnedAt")} value={formatDateTime(data.returnedAt) || t("receipt.notReturned")} />
              <Item label={t("receipt.receivedBy")} value={data.receivedBy || t("receipt.notReturned")} />
              <Item label={t("receipt.signedDocumentLabel")} value={data.signedDocumentRef || t("receipt.notRecorded")} />
            </>
          )}
        </dl>

        <div className="mt-6 rounded-xl border p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t("receipt.description")}</p>
          <p className="mt-2">{data.description || t("receipt.accountDeduction")}</p>
        </div>

        {data.notes ? <div className="mt-4 rounded-xl border p-4 print:hidden"><p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t("receipt.receiptNotes")}</p><p className="mt-2 whitespace-pre-wrap">{data.notes}</p></div> : null}

        {finalSettlementReceipt ? (
          <div className="mt-10 rounded-xl border p-4 text-sm">
            <p className="font-semibold">{t("receipt.digitalAcceptance")}</p>
            <p className="mt-2">
              {data.acceptedAt
                ? t("receipt.acceptedSummary", { actor: data.acceptedBy || t("receipt.authorizedActor"), date: formatDateTime(data.acceptedAt) })
                : t("receipt.awaitingParty", { party: data.acceptingParty === "TENANT" ? t("receipt.party.tenantAdmin") : t("receipt.party.collaborator") })}
            </p>
          </div>
        ) : cancelledReceipt ? (
          <div className="mt-10 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">
            <p className="font-semibold">{t("receipt.cancelledTitle")}</p>
            <p className="mt-2">{t("receipt.cancelledHelp")}</p>
          </div>
        ) : (
          <div className="mt-16 grid gap-10 sm:grid-cols-2">
            <Signature label={t("receipt.collaboratorSignature")} />
            <Signature label={t("receipt.officeAdministrator")} />
          </div>
        )}
        <p className="mt-10 text-xs text-gray-500">{receiptAcknowledgement(data, t)}</p>
      </section>
    </main>
  );
}


function CancelledReceiptPanel() {
  const { t } = useI18n();
  return (
    <section className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-4" aria-label={t("receipt.cancelledPanelAria")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">{t("receipt.cancelledTitle")}</h2>
          <p className="mt-1 text-sm text-gray-700">
            {t("receipt.cancelledPanelHelp")}
          </p>
        </div>
        <span className="rounded-full bg-gray-200 px-3 py-1 text-sm font-semibold text-gray-700">{t("receipt.status.cancelled")}</span>
      </div>
    </section>
  );
}

function SettlementReceiptLifecyclePanel({ receipt }: { receipt: PrintableReceipt }) {
  const { t } = useI18n();
  const accepted = Boolean(receipt.acceptedAt);
  const cancelled = receipt.status === "CANCELLED";
  return (
    <section className="mt-4 rounded-2xl border p-4" aria-label={t("receipt.settlementAria")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">{t("receipt.settlement")}</h2>
          <p className="mt-1 text-sm text-gray-600">
            {t("receipt.settlementHelp")}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-sm font-semibold ${accepted ? "bg-green-100 text-green-800" : cancelled ? "bg-gray-200 text-gray-700" : "bg-amber-100 text-amber-800"}`}>
          {accepted ? t("receipt.accepted") : cancelled ? t("receipt.status.cancelled") : t("receipt.awaitingAcceptance")}
        </span>
      </div>
      <ol className="mt-4 grid gap-3 sm:grid-cols-2">
        <li className="rounded-xl border bg-green-50 p-3">
          <p className="text-sm font-bold">✓ {t("receipt.paymentRecorded")}</p>
          <p className="mt-1 text-xs text-gray-600">{t("receipt.paymentRecordedHelp")}</p>
        </li>
        <li className={`rounded-xl border p-3 ${accepted ? "bg-green-50" : "bg-gray-50"}`}>
          <p className="text-sm font-bold">{accepted ? "✓" : "○"} {t("receipt.paymentAccepted")}</p>
          <p className="mt-1 text-xs text-gray-600">
            {accepted
              ? t("receipt.acceptedBySummary", { actor: receipt.acceptedBy || t("receipt.authorizedActor") })
              : t("receipt.awaitingDesignatedShort", { party: receipt.acceptingParty === "TENANT" ? t("receipt.party.tenantAdmin") : t("receipt.party.collaborator") })}
          </p>
        </li>
      </ol>
    </section>
  );
}

function ReceiptLifecyclePanel({ receipt }: { receipt: PrintableReceipt }) {
  const { t, formatDateTime } = useI18n();
  const steps = receiptLifecycleSteps(receipt, t, (value) => formatDateTime(value));

  return (
    <section className="mt-4 rounded-2xl border p-4" aria-label={t("receipt.lifecycleAria")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">{t("receipt.lifecycle")}</h2>
          <p className="mt-1 text-sm text-gray-600">{t("receipt.lifecycleHelp")}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-sm font-semibold ${receiptStatusTone(receipt.status)}`}>
          {receiptStatusLabel(receipt.status, t)}
        </span>
      </div>
      <ol className="mt-4 grid gap-3 sm:grid-cols-4">
        {steps.map((step) => (
          <li key={step.key} className={`rounded-xl border p-3 ${step.completed ? "bg-green-50" : "bg-gray-50"}`}>
            <p className="text-sm font-bold">{step.completed ? "✓" : "○"} {step.label}</p>
            <p className="mt-1 text-xs text-gray-600">{step.detail}</p>
          </li>
        ))}
      </ol>
      {isReceiptTerminal(receipt.status) ? (
        <p className="mt-3 rounded-xl bg-gray-100 p-3 text-sm font-medium text-gray-700">{t("receipt.terminal")}</p>
      ) : null}
    </section>
  );
}

function Item({ label, value }: { label: string; value: string }) { return <div><dt className="text-gray-500">{label}</dt><dd className="mt-1 font-semibold">{value}</dd></div>; }
function Signature({ label }: { label: string }) { return <div className="border-t pt-2 text-center text-sm">{label}</div>; }
function receiptAcknowledgement(receipt: PrintableReceipt, t: ReturnType<typeof useI18n>["t"]) {
  if (receipt.status === "CANCELLED") {
    return t("receipt.ack.cancelled");
  }
  if (receipt.receiptPurpose === "FINAL_SETTLEMENT_TENANT_PAYMENT") {
    return t("receipt.ack.tenantPayment");
  }
  if (receipt.receiptPurpose === "FINAL_SETTLEMENT_COLLABORATOR_PAYMENT") {
    return t("receipt.ack.collaboratorPayment");
  }
  return t("receipt.ack.deduction");
}
