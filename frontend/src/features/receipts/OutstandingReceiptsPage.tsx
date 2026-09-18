import { FormEvent, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import { useAuthorizationContext } from "../../components/layout/AuthorizationContext";
import type { OutstandingReceipt } from "../../types/receipts";
import { nextReceiptAction, receiptStatusLabel, receiptStatusTone } from "./receiptLifecycle";
import { useOutstandingReceipts } from "./useReceipt";
import { PageTitle } from "../../components/layout/PageHeading";
import { useI18n } from "../../i18n";
import { ledgerEntryTypeLabel, ledgerSourceTypeLabel } from "../../i18n/financialLabels";

const pageSizeOptions = [10, 25, 50];

export function OutstandingReceiptsPage() {
  const { t } = useI18n();
  const statuses = [
    { value: "", label: t("receipts.allOutstanding") },
    { value: "PENDING_ISSUE", label: t("receipt.status.pendingIssue") },
    { value: "ISSUED", label: t("receipt.status.issued") },
    { value: "PRINTED", label: t("receipt.status.printed") },
    { value: "SIGNED", label: t("receipt.status.signed") },
  ];
  const sourceTypes = [
    { value: "", label: t("receipts.allSources") },
    { value: "EXPENSE", label: t("receipts.source.expenses") },
    { value: "EXPENSE_REPLACEMENT", label: t("receipts.source.expenseCorrections") },
    { value: "JOURNEY_SETTLEMENT", label: t("receipts.source.journeySettlements") },
    { value: "LEDGER_CORRECTION", label: t("receipts.source.ledgerCorrections") },
    { value: "ACCRUAL_ITEM", label: t("receipts.source.accrualItems") },
  ];
  const actor = useAuthorizationContext();
  const wildcard = actor.permissions.includes("*");
  const tenantReceiptAccess = wildcard || actor.permissions.includes("ledger.receipts.read");
  const selfServiceReceiptAccess =
    !tenantReceiptAccess && actor.permissions.includes("ledger.receipts.self.read");
  const peopleHref =
    wildcard || actor.permissions.includes("people.read")
      ? "/people"
      : actor.personId && actor.permissions.includes("people.self.read")
        ? `/people/${encodeURIComponent(actor.personId)}`
        : "";
  const canBrowseExpenses = wildcard || actor.permissions.includes("expenses.read");

  const [searchParams, setSearchParams] = useSearchParams();
  const status = searchParams.get("status") ?? "";
  const collaborator = searchParams.get("collaborator") ?? "";
  const sourceType = searchParams.get("sourceType") ?? "";
  const page = Number(searchParams.get("page") ?? "1") || 1;
  const pageSize = Number(searchParams.get("pageSize") ?? "25") || 25;
  const [collaboratorDraft, setCollaboratorDraft] = useState(collaborator);

  const receipts = useOutstandingReceipts({
    status: status || undefined,
    collaborator: collaborator || undefined,
    sourceType: sourceType || undefined,
    page,
    pageSize,
  });

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    setSearchParams(next);
  }

  function applyCollaboratorFilter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    updateParam("collaborator", collaboratorDraft.trim());
  }

  function clearFilters() {
    setCollaboratorDraft("");
    setSearchParams(new URLSearchParams());
  }

  function updatePage(nextPage: number) {
    const next = new URLSearchParams(searchParams);
    if (nextPage <= 1) next.delete("page");
    else next.set("page", String(nextPage));
    setSearchParams(next);
  }

  const data = receipts.data;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const filtered = Boolean(status || collaborator || sourceType || pageSize !== 25);

  return (
    <main className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <section className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-gray-500">{t("common.receipt")}</p>
            <PageTitle>{t("receipts.title")}</PageTitle>
            <p className="mt-2 max-w-2xl text-sm text-gray-600">
              {selfServiceReceiptAccess
                ? t("receipts.selfSubtitle")
                : t("receipts.subtitle")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {peopleHref ? (
              <Link className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold shadow-sm" to={peopleHref}>
                {tenantReceiptAccess ? t("people.title") : t("receipts.myPerson")}
              </Link>
            ) : null}
            {canBrowseExpenses ? (
              <Link className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold shadow-sm" to="/expenses">
                {t("expenses.title")}
              </Link>
            ) : null}
          </div>
        </header>

        {receipts.error ? <ApiErrorPanel error={receipts.error} translate={t} /> : null}

        <div className="grid gap-3 sm:grid-cols-5">
          <SummaryCard label={t("receipts.totalOutstanding")} value={data?.summary.total ?? 0} />
          <SummaryCard label={t("receipts.pendingIssue")} value={data?.summary.pendingIssue ?? 0} />
          <SummaryCard label={t("receipts.issued")} value={data?.summary.issued ?? 0} />
          <SummaryCard label={t("receipts.printed")} value={data?.summary.printed ?? 0} />
          <SummaryCard label={t("receipts.signed")} value={data?.summary.signed ?? 0} />
        </div>

        <form className="rounded-2xl border bg-white p-4 shadow-sm" onSubmit={applyCollaboratorFilter} aria-label={t("receipts.filtersAria")}>
          <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end">
            <label className="grid gap-1 text-sm font-medium">
              <span>{t("common.status")}</span>
              <select className="rounded-xl border px-3 py-2" value={status} onChange={(event) => updateParam("status", event.target.value)}>
                {statuses.map((option) => (
                  <option key={option.value || "all"} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium">
              <span>{t("receipts.sourceType")}</span>
              <select className="rounded-xl border px-3 py-2" value={sourceType} onChange={(event) => updateParam("sourceType", event.target.value)}>
                {sourceTypes.map((option) => (
                  <option key={option.value || "all"} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            {tenantReceiptAccess ? (
              <label className="grid gap-1 text-sm font-medium">
                <span>{t("receipts.collaborator")}</span>
                <input
                  className="rounded-xl border px-3 py-2"
                  placeholder={t("receipts.collaboratorPlaceholder")}
                  value={collaboratorDraft}
                  onChange={(event) => setCollaboratorDraft(event.target.value)}
                />
              </label>
            ) : (
              <div className="rounded-xl border bg-gray-50 px-3 py-2 text-sm text-gray-600">
                {t("receipts.selfOnly")}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="submit" className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white">
                {t("receipts.applyFilters")}
              </button>
              <button type="button" className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold" onClick={clearFilters} disabled={!filtered}>
                {t("common.clear")}
              </button>
            </div>
          </div>
          <label className="mt-4 grid max-w-xs gap-1 text-sm font-medium">
            <span>{t("receipts.pageSize")}</span>
            <select className="rounded-xl border px-3 py-2" value={pageSize} onChange={(event) => updateParam("pageSize", event.target.value)}>
              {pageSizeOptions.map((option) => (
                <option key={option} value={option}> {t("receipts.perPage", { count: option })} </option>
              ))}
            </select>
          </label>
        </form>

        <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          {receipts.isLoading ? (
            <p className="p-6 text-sm text-gray-600">{t("receipts.loading")}</p>
          ) : data && data.items.length > 0 ? (
            <div className="divide-y">
              {data.items.map((receipt) => (
                <ReceiptRow
                  key={receipt.id}
                  receipt={receipt}
                  canBrowseExpenses={canBrowseExpenses}
                />
              ))}
            </div>
          ) : (
            <div className="p-8 text-center">
              <h2 className="text-lg font-bold">{t("receipts.empty")}</h2>
              <p className="mt-2 text-sm text-gray-600">{t("receipts.emptyHelp")}</p>
            </div>
          )}
        </div>

        {data ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-gray-600">
              {t(data.total === 1 ? "receipts.showingPageOne" : "receipts.showingPage", {
                page: data.page,
                pages: totalPages,
                total: data.total,
              })}
            </p>
            <div className="flex gap-2">
              <button type="button" className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50" disabled={data.page <= 1} onClick={() => updatePage(data.page - 1)}>
                {t("common.previous")}
              </button>
              <button type="button" className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50" disabled={data.page >= totalPages} onClick={() => updatePage(data.page + 1)}>
                {t("common.next")}
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return <div className="rounded-2xl border bg-white p-4 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</p><p className="mt-2 text-2xl font-bold">{value}</p></div>;
}

function ReceiptRow({ receipt, canBrowseExpenses }: { receipt: OutstandingReceipt; canBrowseExpenses: boolean }) {
  const { t, formatCurrency, formatDate, formatNumber, formatDateTime } = useI18n();
  const sourceLink = sourceHref(receipt);

  return (
    <article className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-bold text-gray-900">{receipt.receiptNumber}</h2>
          <span className={`rounded-full px-2 py-1 text-xs font-semibold ${receiptStatusTone(receipt.status)}`}>{receiptStatusLabel(receipt.status, t)}</span>
        </div>
        <p className="mt-1 text-sm text-gray-700">{receipt.collaboratorLabel} · {receipt.collaboratorLegalName}</p>
        <p className="mt-1 text-xs text-gray-500">
          {t("receipts.personOwner")} <span className="font-mono">{receipt.personId}</span> · {t("receipts.journeyProvenance")} <span className="font-mono">{receipt.collaboratorId}</span> · {t("receipts.tenant")} <span className="font-mono">{receipt.tenantId}</span>
        </p>
        <p className="mt-1 text-sm text-gray-600">
          {ledgerEntryTypeLabel(receipt.entryType, t)} · {receipt.valueUnitCode === "BRL" ? formatCurrency(receipt.amount, "BRL") : `${formatNumber(receipt.amount, { maximumFractionDigits: 8 })} ${t("account.goldUnit")}`} · {t("receipts.effective", { date: formatDate(receipt.effectiveDate) })}
        </p>
        <p className="mt-1 text-sm text-gray-600">
          {t("receipts.source")} {ledgerSourceTypeLabel(receipt.sourceType, t)}{receipt.description ? ` · ${receipt.description}` : ""}
        </p>
        {receipt.printedAt ? <p className="mt-1 text-xs text-gray-500">{t("receipts.printedAt", { date: formatDateTime(receipt.printedAt) })}</p> : null}
        <p className="mt-1 text-xs font-semibold text-gray-600">{t("receipts.nextAction", { action: nextReceiptAction(receipt, t) })}</p>
        {receipt.signedDocumentRef ? <p className="mt-1 text-xs text-gray-500">{t("receipts.signedDocument", { reference: receipt.signedDocumentRef })}</p> : null}
      </div>
      <div className="flex flex-wrap gap-2 sm:justify-end">
        <Link className="rounded-xl border px-4 py-2 text-sm font-semibold" to={`/collaborators/${receipt.collaboratorId}`}>{t("receipts.collaborator")}</Link>
        <Link className="rounded-xl border px-4 py-2 text-sm font-semibold" to={`/collaborators/${receipt.collaboratorId}/current-account`}>{t("receipts.currentAccount")}</Link>
        {sourceLink && canBrowseExpenses ? <Link className="rounded-xl border px-4 py-2 text-sm font-semibold" to={sourceLink}>{t("receipts.openSource")}</Link> : null}
        <Link className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white" to={`/ledger-entries/${receipt.ledgerEntryId}/receipt`}>{t("receipts.openReceipt")}</Link>
      </div>
    </article>
  );
}

function sourceHref(receipt: OutstandingReceipt) {
  if (receipt.sourceType === "EXPENSE" || receipt.sourceType === "EXPENSE_REPLACEMENT") return `/expenses/${receipt.sourceId}`;
  return "";
}
