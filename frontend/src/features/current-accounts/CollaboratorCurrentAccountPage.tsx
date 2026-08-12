import { Link, useParams, useSearchParams } from "react-router-dom";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import { useAuthorizationContext } from "../../components/layout/AuthorizationContext";
import type {
  CurrentAccountBalance,
  CurrentAccountFilter,
  LedgerEntry,
} from "../../types/currentAccounts";
import { receiptStatusLabel, receiptStatusTone } from "../receipts/receiptLifecycle";
import { useCollaboratorCurrentAccount } from "./useCurrentAccount";

type LedgerFilterOption = {
  value: string;
  label: string;
  apiFilter: CurrentAccountFilter;
};

const ledgerFilters: LedgerFilterOption[] = [
  { value: "all", label: "All entries", apiFilter: {} },
  { value: "credits", label: "Credits", apiFilter: { direction: "CREDIT" } },
  { value: "debits", label: "Debits", apiFilter: { direction: "DEBIT" } },
  {
    value: "earnings",
    label: "Earnings",
    apiFilter: { sourceType: "WORK_PERIOD_ASSIGNMENT" },
  },
  { value: "expenses", label: "Expenses", apiFilter: { sourceType: "EXPENSE" } },
  {
    value: "outstanding-receipts",
    label: "Outstanding receipts",
    apiFilter: { outstandingReceipts: true },
  },
];

const PAGE_SIZE = 25;

export function CollaboratorCurrentAccountPage() {
  const { id = "" } = useParams();
  const actor = useAuthorizationContext();
  const wildcard = actor.permissions.includes("*");
  const canBrowseExpenses = wildcard || actor.permissions.includes("expenses.read");
  const canBrowseOutstandingReceipts = wildcard || actor.permissions.includes("ledger.receipts.read");
  const canOpenOperationalSources =
    wildcard || actor.permissions.includes("expenses.read") || actor.permissions.includes("planning.read");
  const canOpenReceipt = wildcard || actor.permissions.includes("ledger.receipts.read");
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = searchParams.get("filter") ?? "all";
  const page = Number(searchParams.get("page") ?? "1") || 1;
  const selectedFilter =
    ledgerFilters.find((candidate) => candidate.value === filter) ?? ledgerFilters[0];

  const currentAccount = useCollaboratorCurrentAccount(id, {
    ...selectedFilter.apiFilter,
    page,
    pageSize: PAGE_SIZE,
  });
  const data = currentAccount.data;
  const ledgerEntries = data?.ledgerEntries;
  const totalPages = ledgerEntries
    ? Math.max(1, Math.ceil(ledgerEntries.total / ledgerEntries.pageSize))
    : 1;

  function changeFilter(nextFilter: string) {
    const params = new URLSearchParams();
    if (nextFilter !== "all") params.set("filter", nextFilter);
    setSearchParams(params);
  }

  function changePage(nextPage: number) {
    const params = new URLSearchParams(searchParams);
    if (nextPage <= 1) params.delete("page");
    else params.set("page", String(nextPage));
    setSearchParams(params);
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-10 border-b bg-white/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto max-w-6xl">
          <Link
            className="text-sm font-semibold text-gray-600 underline"
            to={`/collaborators/${id}`}
          >
            Back to Collaborator
          </Link>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Collaborator Current Account
              </p>
              <h1 className="text-2xl font-bold text-gray-950">
                {data?.collaboratorLabel || "Current Account"}
              </h1>
              <p className="mt-1 text-sm text-gray-600">
                Balances and ledger entries for this collaborator journey.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 sm:justify-end">
              {canBrowseOutstandingReceipts ? (
                <Link
                  className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm"
                  to="/receipts/outstanding"
                >
                  Outstanding Receipts
                </Link>
              ) : null}
              {canBrowseExpenses ? (
                <Link
                  className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm"
                  to="/expenses"
                >
                  Expenses
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl space-y-4 p-4">
        <ApiErrorPanel error={currentAccount.error} />

        {currentAccount.isLoading ? (
          <section className="rounded-2xl border bg-white p-5 shadow-sm">
            Loading current account...
          </section>
        ) : data ? (
          <>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.balances.length > 0 ? (
                data.balances.map((balance) => (
                  <BalanceCard key={balance.valueUnitId} balance={balance} />
                ))
              ) : (
                <div className="rounded-2xl border bg-white p-5 shadow-sm sm:col-span-2 lg:col-span-3">
                  <p className="text-sm font-semibold text-gray-700">
                    No active current-account balance yet.
                  </p>
                </div>
              )}
            </section>

            <section className="rounded-2xl border bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-950">
                    Ledger Entries
                  </h2>
                  <p className="mt-1 text-sm text-gray-600">
                    Inspect credits, debits, expense deductions, and receipt obligations.
                  </p>
                </div>
                <label className="grid gap-1 text-sm font-medium text-gray-700 md:min-w-64">
                  <span>Filter ledger entries</span>
                  <select
                    className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm"
                    value={selectedFilter.value}
                    onChange={(event) => changeFilter(event.target.value)}
                  >
                    {ledgerFilters.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-5 overflow-hidden rounded-2xl border">
                {ledgerEntries && ledgerEntries.items.length > 0 ? (
                  <div className="divide-y">
                    {ledgerEntries.items.map((entry) => (
                      <LedgerEntryRow
                        key={entry.id}
                        entry={entry}
                        canOpenOperationalSources={canOpenOperationalSources}
                        canOpenReceipt={canOpenReceipt}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center">
                    <h3 className="text-base font-bold text-gray-900">
                      No ledger entries in this filter
                    </h3>
                    <p className="mt-2 text-sm text-gray-600">
                      Change the filter or create an earning, expense, payout, or correction.
                    </p>
                  </div>
                )}
              </div>

              {ledgerEntries ? (
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-gray-600">
                    Showing page {ledgerEntries.page} of {totalPages} · {ledgerEntries.total} ledger entr{ledgerEntries.total === 1 ? "y" : "ies"}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
                      disabled={ledgerEntries.page <= 1}
                      onClick={() => changePage(ledgerEntries.page - 1)}
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
                      disabled={ledgerEntries.page >= totalPages}
                      onClick={() => changePage(ledgerEntries.page + 1)}
                    >
                      Next
                    </button>
                  </div>
                </div>
              ) : null}
            </section>
          </>
        ) : null}
      </section>
    </main>
  );
}

function BalanceCard({ balance }: { balance: CurrentAccountBalance }) {
  const code = balance.valueUnitCode || balance.valueUnitLabel || "Balance";
  return (
    <article className="rounded-2xl border bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        {balance.valueUnitLabel || code}
      </p>
      <p className="mt-2 text-2xl font-bold text-gray-950">
        {formatAmount(balance.balance, code)}
      </p>
      <p className="mt-1 text-xs text-gray-500">{code}</p>
    </article>
  );
}

function LedgerEntryRow({
  entry,
  canOpenOperationalSources,
  canOpenReceipt,
}: {
  entry: LedgerEntry;
  canOpenOperationalSources: boolean;
  canOpenReceipt: boolean;
}) {
  const receipt = entry.receipt;
  return (
    <article className="grid gap-3 p-4 md:grid-cols-[1fr_auto] md:items-center">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-bold text-gray-950">{humanize(entry.entryType)}</h3>
          <span className={`rounded-full px-2 py-1 text-xs font-semibold ${entry.direction === "DEBIT" ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
            {entry.direction}
          </span>
          {receipt ? (
            <span className={`rounded-full px-2 py-1 text-xs font-semibold ${receiptStatusTone(receipt.status)}`}>
              Receipt: {receiptStatusLabel(receipt.status)}
            </span>
          ) : entry.direction === "DEBIT" ? (
            <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
              Receipt: missing
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-gray-700">
          {formatAmount(entry.signedAmount, entry.valueUnitCode || entry.valueUnitLabel)} · Effective {entry.effectiveDate}
        </p>
        <p className="mt-1 text-xs text-gray-500">
          Source: {sourceLabel(entry)}
        </p>
        {entry.description ? (
          <p className="mt-1 text-sm text-gray-600">{entry.description}</p>
        ) : null}
        {receipt?.outstanding ? (
          <p className="mt-2 rounded-xl bg-amber-50 p-2 text-xs font-semibold text-amber-900">
            Outstanding receipt: print, collect signature, and record the signed return.
          </p>
        ) : receipt && !receipt.outstanding ? (
          <p className="mt-2 rounded-xl bg-green-50 p-2 text-xs font-semibold text-green-900">
            Receipt returned or closed.
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2 md:justify-end">
        {canOpenOperationalSources && sourceLink(entry) ? (
          <Link className="rounded-xl border px-4 py-2 text-sm font-semibold" to={sourceLink(entry)!}>
            {sourceActionLabel(entry)}
          </Link>
        ) : null}
        {canOpenReceipt && (receipt || entry.direction === "DEBIT") ? (
          <Link className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white" to={`/ledger-entries/${entry.id}/receipt`}>
            Print or return receipt
          </Link>
        ) : null}
      </div>
    </article>
  );
}

function sourceLink(entry: LedgerEntry) {
  if (entry.sourceType === "EXPENSE" && entry.sourceId) {
    return `/expenses/${entry.sourceId}`;
  }
  if (entry.sourceType === "WORK_PERIOD_ASSIGNMENT" && entry.sourceWorkPeriodId) {
    return `/work-periods/${entry.sourceWorkPeriodId}`;
  }
  return "";
}

function sourceActionLabel(entry: LedgerEntry) {
  if (entry.sourceType === "WORK_PERIOD_ASSIGNMENT") {
    return "Open Work Period";
  }
  return "Open source";
}

function sourceLabel(entry: LedgerEntry) {
  if (entry.sourceLabel) {
    return `${entry.sourceLabel} · Assignment ${shortId(entry.sourceId)}`;
  }
  return `${entry.sourceType} · ${entry.sourceId}`;
}

function shortId(value: string) {
  if (!value) return "—";
  return value.length <= 12 ? value : `${value.slice(0, 8)}…`;
}

function formatAmount(value: number, unit?: string) {
  const normalized = (unit || "").toUpperCase();
  if (normalized.includes("GOLD")) {
    return `${formatNumber(value, 8)} g gold`;
  }
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatNumber(value: number, maximumFractionDigits = 2) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(value);
}

function humanize(value: string) {
  return value.toLowerCase().replaceAll("_", " ");
}
