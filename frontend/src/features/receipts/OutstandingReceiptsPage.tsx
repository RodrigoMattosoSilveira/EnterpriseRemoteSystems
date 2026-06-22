import { Link, useSearchParams } from "react-router-dom";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import type { OutstandingReceipt } from "../../types/receipts";
import { nextReceiptAction, receiptStatusLabel, receiptStatusTone } from "./receiptLifecycle";
import { useOutstandingReceipts } from "./useReceipt";

const statuses = [
  { value: "", label: "All outstanding" },
  { value: "PENDING_ISSUE", label: "Pending issue" },
  { value: "ISSUED", label: "Issued" },
  { value: "PRINTED", label: "Printed" },
  { value: "SIGNED", label: "Signed" },
];

export function OutstandingReceiptsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const status = searchParams.get("status") ?? "";
  const page = Number(searchParams.get("page") ?? "1") || 1;
  const pageSize = 25;
  const receipts = useOutstandingReceipts({ status: status || undefined, page, pageSize });

  function updateStatus(nextStatus: string) {
    const next = new URLSearchParams();
    if (nextStatus) next.set("status", nextStatus);
    setSearchParams(next);
  }

  function updatePage(nextPage: number) {
    const next = new URLSearchParams(searchParams);
    if (nextPage <= 1) next.delete("page");
    else next.set("page", String(nextPage));
    setSearchParams(next);
  }

  const data = receipts.data;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <main className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <section className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-gray-500">Receipts</p>
            <h1 className="text-3xl font-bold text-gray-900">Outstanding receipts</h1>
            <p className="mt-2 max-w-2xl text-sm text-gray-600">
              Track debit receipt obligations that still need to be issued, printed, signed, or returned.
            </p>
          </div>
          <Link className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold shadow-sm" to="/people">
            Back to People
          </Link>
        </header>

        {receipts.error ? <ApiErrorPanel error={receipts.error} /> : null}

        <div className="grid gap-3 sm:grid-cols-5">
          <SummaryCard label="Total outstanding" value={data?.summary.total ?? 0} />
          <SummaryCard label="Pending issue" value={data?.summary.pendingIssue ?? 0} />
          <SummaryCard label="Issued" value={data?.summary.issued ?? 0} />
          <SummaryCard label="Printed" value={data?.summary.printed ?? 0} />
          <SummaryCard label="Signed" value={data?.summary.signed ?? 0} />
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <label className="grid gap-1 text-sm font-medium sm:max-w-xs">
            <span>Status</span>
            <select className="rounded-xl border px-3 py-2" value={status} onChange={(event) => updateStatus(event.target.value)}>
              {statuses.map((option) => (
                <option key={option.value || "all"} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">
          {receipts.isLoading ? (
            <p className="p-6 text-sm text-gray-600">Loading outstanding receipts...</p>
          ) : data && data.items.length > 0 ? (
            <div className="divide-y">
              {data.items.map((receipt) => <ReceiptRow key={receipt.id} receipt={receipt} />)}
            </div>
          ) : (
            <div className="p-8 text-center">
              <h2 className="text-lg font-bold">No outstanding receipts</h2>
              <p className="mt-2 text-sm text-gray-600">All receipt obligations in this filter are returned or cancelled.</p>
            </div>
          )}
        </div>

        {data ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-gray-600">
              Showing page {data.page} of {totalPages} · {data.total} receipt{data.total === 1 ? "" : "s"}
            </p>
            <div className="flex gap-2">
              <button type="button" className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50" disabled={data.page <= 1} onClick={() => updatePage(data.page - 1)}>
                Previous
              </button>
              <button type="button" className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50" disabled={data.page >= totalPages} onClick={() => updatePage(data.page + 1)}>
                Next
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

function ReceiptRow({ receipt }: { receipt: OutstandingReceipt }) {
  return (
    <article className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-bold text-gray-900">{receipt.receiptNumber}</h2>
          <span className={`rounded-full px-2 py-1 text-xs font-semibold ${receiptStatusTone(receipt.status)}`}>{receiptStatusLabel(receipt.status)}</span>
        </div>
        <p className="mt-1 text-sm text-gray-700">{receipt.collaboratorLabel} · {receipt.collaboratorLegalName}</p>
        <p className="mt-1 text-sm text-gray-600">
          {humanize(receipt.entryType)} · {formatAmount(receipt.amount, receipt.valueUnitCode)} · Effective {receipt.effectiveDate}
        </p>
        {receipt.printedAt ? <p className="mt-1 text-xs text-gray-500">Printed {formatDateTime(receipt.printedAt)}</p> : null}
        <p className="mt-1 text-xs font-semibold text-gray-600">Next action: {nextReceiptAction(receipt)}</p>
        {receipt.signedDocumentRef ? <p className="mt-1 text-xs text-gray-500">Signed document: {receipt.signedDocumentRef}</p> : null}
      </div>
      <div className="flex flex-wrap gap-2 sm:justify-end">
        <Link className="rounded-xl border px-4 py-2 text-sm font-semibold" to={`/collaborators/${receipt.collaboratorId}`}>Collaborator</Link>
        <Link className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white" to={`/ledger-entries/${receipt.ledgerEntryId}/receipt`}>Open receipt</Link>
      </div>
    </article>
  );
}

function humanize(value: string) { return value.toLowerCase().replaceAll("_", " "); }
function formatAmount(value: number, unit: string) { return unit === "BRL" ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value) : `${value.toFixed(2)} g`; }
function formatDateTime(value: string) { return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
