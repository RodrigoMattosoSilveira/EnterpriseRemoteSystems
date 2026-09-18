import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import { useAuthorizationContext } from "../../components/layout/AuthorizationContext";
import type {
  CurrentAccountBalance,
  CurrentAccountFilter,
  LedgerEntry,
} from "../../types/currentAccounts";
import { CurrentAndFutureEarningsModal } from "../expenses/CurrentAndFutureEarningsModal";
import { receiptStatusLabel, receiptStatusTone } from "../receipts/receiptLifecycle";
import { useCollaboratorCurrentAccount } from "./useCurrentAccount";
import { PageContextHeading, PageTitle } from "../../components/layout/PageHeading";
import { useI18n } from "../../i18n";
import {
  acceptingPartyCodeLabel,
  ledgerDirectionLabel,
  ledgerEntryTypeLabel,
  ledgerSourceTypeLabel,
  paymentDirectionCodeLabel,
} from "../../i18n/financialLabels";

type LedgerFilterOption = {
  value: string;
  label: string;
  apiFilter: CurrentAccountFilter;
};


const PAGE_SIZE = 25;

export function CollaboratorCurrentAccountPage() {
  const { t, formatCurrency, formatDate, formatNumber } = useI18n();
  const ledgerFilters: LedgerFilterOption[] = [
    { value: "all", label: t("account.filter.all"), apiFilter: {} },
    { value: "credits", label: t("account.filter.credits"), apiFilter: { direction: "CREDIT" } },
    { value: "debits", label: t("account.filter.debits"), apiFilter: { direction: "DEBIT" } },
    { value: "earnings", label: t("account.filter.earnings"), apiFilter: { sourceType: "WORK_PERIOD_ASSIGNMENT" } },
    { value: "expenses", label: t("account.filter.expenses"), apiFilter: { sourceType: "EXPENSE" } },
    { value: "outstanding-receipts", label: t("account.filter.outstanding"), apiFilter: { outstandingReceipts: true } },
  ];
  const { id = "" } = useParams();
  const actor = useAuthorizationContext();
  const wildcard = actor.permissions.includes("*");
  const canViewFinancialProjection =
    wildcard || actor.permissions.includes("current_accounts.summary.read");
  const canBrowseExpenses = wildcard || actor.permissions.includes("expenses.read");
  const canBrowseOutstandingReceipts =
    wildcard ||
    actor.permissions.includes("ledger.receipts.read") ||
    actor.permissions.includes("ledger.receipts.self.read");
  const canOpenOperationalSources =
    wildcard || actor.permissions.includes("expenses.read") || actor.permissions.includes("planning.read");
  const canOpenJourneyProvenance =
    wildcard ||
    actor.permissions.includes("collaborators.read") ||
    actor.permissions.includes("collaborators.self.read");
  const canOpenReceipt = wildcard || actor.permissions.includes("ledger.receipts.read") || actor.permissions.includes("ledger.receipts.self.read");
  const [showFinancialProjection, setShowFinancialProjection] = useState(false);
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
            {t("receipt.backCollaborator")}
          </Link>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <PageTitle>
                {t("account.title")}
              </PageTitle>
              <PageContextHeading>
                {data?.personLabel || data?.collaboratorLabel || t("account.defaultContext")}
              </PageContextHeading>
              <p className="mt-1 text-sm text-gray-600">
                <span className="font-semibold">{t("common.journeyId")}:</span>{" "}
                <span className="break-all font-mono">
                  {data?.collaboratorId || id}
                </span>
              </p>
              <p className="mt-1 text-sm text-gray-600">
                {t("account.subtitle")}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 sm:justify-end">
              {canViewFinancialProjection ? (
                <button
                  className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm"
                  type="button"
                  onClick={() => setShowFinancialProjection(true)}
                >
                  {t("account.futureEarnings")}
                </button>
              ) : null}
              {canBrowseOutstandingReceipts ? (
                <Link
                  className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm"
                  to="/receipts/outstanding"
                >
                  {t("account.outstandingReceipts")}
                </Link>
              ) : null}
              {canBrowseExpenses ? (
                <Link
                  className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm"
                  to="/expenses"
                >
                  {t("nav.expenses")}
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl space-y-4 p-4">
        <ApiErrorPanel error={currentAccount.error} translate={t} />

        {currentAccount.isLoading ? (
          <section className="rounded-2xl border bg-white p-5 shadow-sm">
            {t("account.loading")}
          </section>
        ) : data ? (
          <>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {balancesForDisplay(data.balances).map((balance) => (
                <BalanceCard
                  key={balance.valueUnitCode || balance.valueUnitLabel}
                  balance={balance}
                />
              ))}
            </section>

            <section className="rounded-2xl border bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-950">
                    {t("account.ledger.title")}
                  </h2>
                  <p className="mt-1 text-sm text-gray-600">
                    {t("account.ledger.description")}
                  </p>
                </div>
                <label className="grid gap-1 text-sm font-medium text-gray-700 md:min-w-64">
                  <span>{t("account.ledger.filter")}</span>
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
                        canOpenJourneyProvenance={canOpenJourneyProvenance}
                        canOpenReceipt={canOpenReceipt}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center">
                    <h3 className="text-base font-bold text-gray-900">
                      {t("account.empty")}
                    </h3>
                    <p className="mt-2 text-sm text-gray-600">
                      {t("account.emptyHelp")}
                    </p>
                  </div>
                )}
              </div>

              {ledgerEntries ? (
                <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-gray-600">
                    {t("account.showingPage", { page: ledgerEntries.page, pages: totalPages, total: ledgerEntries.total })}
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
                      disabled={ledgerEntries.page <= 1}
                      onClick={() => changePage(ledgerEntries.page - 1)}
                    >
                      {t("common.previous")}
                    </button>
                    <button
                      type="button"
                      className="rounded-xl border bg-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
                      disabled={ledgerEntries.page >= totalPages}
                      onClick={() => changePage(ledgerEntries.page + 1)}
                    >
                      {t("common.next")}
                    </button>
                  </div>
                </div>
              ) : null}
            </section>
          </>
        ) : null}
      </section>

      {showFinancialProjection && canViewFinancialProjection ? (
        <CurrentAndFutureEarningsModal
          collaboratorId={id}
          onClose={() => setShowFinancialProjection(false)}
        />
      ) : null}
    </main>
  );
}

type DisplayBalance = Pick<
  CurrentAccountBalance,
  "valueUnitCode" | "valueUnitLabel" | "balance"
>;

const canonicalDisplayBalances: DisplayBalance[] = [
  { valueUnitCode: "BRL", valueUnitLabel: "Real", balance: 0 },
  { valueUnitCode: "GOLD_GRAM", valueUnitLabel: "Grams of Gold", balance: 0 },
];

function balancesForDisplay(balances: CurrentAccountBalance[]): DisplayBalance[] {
  const balancesByCode = new Map(
    balances.map((balance) => [
      (balance.valueUnitCode || "").toUpperCase(),
      balance,
    ]),
  );
  const canonicalCodes = new Set(
    canonicalDisplayBalances.map((balance) => balance.valueUnitCode),
  );
  const canonicalBalances = canonicalDisplayBalances.map((balance) => ({
    ...balance,
    balance: balancesByCode.get(balance.valueUnitCode || "")?.balance ?? 0,
  }));
  const additionalBalances = balances.filter(
    (balance) => !canonicalCodes.has((balance.valueUnitCode || "").toUpperCase()),
  );

  return [...canonicalBalances, ...additionalBalances];
}

function BalanceCard({ balance }: { balance: DisplayBalance }) {
  const { t, formatCurrency, formatNumber } = useI18n();
  const code = balance.valueUnitCode || balance.valueUnitLabel || "Balance";
  return (
    <article className="rounded-2xl border bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        {code === "BRL" ? t("account.real") : code === "GOLD_GRAM" ? t("account.gramsGold") : balance.valueUnitLabel || code}
      </p>
      <p className="mt-2 text-2xl font-bold text-gray-950">
        {code.toUpperCase().includes("GOLD") ? `${formatNumber(balance.balance, { maximumFractionDigits: 8 })} ${t("account.goldUnit")}` : formatCurrency(balance.balance, "BRL")}
      </p>
      <p className="mt-1 text-xs text-gray-500">{code}</p>
    </article>
  );
}

function LedgerEntryRow({
  entry,
  canOpenOperationalSources,
  canOpenJourneyProvenance,
  canOpenReceipt,
}: {
  entry: LedgerEntry;
  canOpenOperationalSources: boolean;
  canOpenJourneyProvenance: boolean;
  canOpenReceipt: boolean;
}) {
  const { t, formatCurrency, formatDate, formatNumber } = useI18n();
  const receipt = entry.receipt;
  return (
    <article className="grid gap-3 p-4 md:grid-cols-[1fr_auto] md:items-center">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-bold text-gray-950">{ledgerEntryTypeLabel(entry.entryType, t)}</h3>
          <span className={`rounded-full px-2 py-1 text-xs font-semibold ${entry.direction === "DEBIT" ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
            {ledgerDirectionLabel(entry.direction, t)}
          </span>
          {receipt ? (
            <span className={`rounded-full px-2 py-1 text-xs font-semibold ${receiptStatusTone(receipt.status)}`}>
              {t("account.receiptLabel", { status: receiptStatusLabel(receipt.status, t) })}
            </span>
          ) : entry.direction === "DEBIT" ? (
            <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
              {t("account.receiptMissing")}
            </span>
          ) : null}
        </div>
        <p className="mt-1 text-sm text-gray-700">
          {formatAccountAmount(entry.signedAmount, entry.valueUnitCode || entry.valueUnitLabel, formatCurrency, formatNumber, t)} · {t("account.effective", { date: formatDate(entry.effectiveDate) })}
        </p>
        <p className="mt-1 text-xs text-gray-500">
          {t("account.source")} {sourceLabel(entry, t)}
        </p>
        {entry.description ? (
          <p className="mt-1 text-sm text-gray-600">{entry.description}</p>
        ) : null}
        <dl className="mt-2 grid gap-1 rounded-xl border border-gray-100 bg-gray-50 p-3 text-xs text-gray-700 sm:grid-cols-2">
          <div>
            <dt className="inline font-semibold text-gray-900">{t("account.personOwner")} </dt>
            <dd className="inline font-mono">{entry.personId}</dd>
          </div>
          <div>
            <dt className="inline font-semibold text-gray-900">{t("account.journeyProvenance")} </dt>
            <dd className="inline">
              {canOpenJourneyProvenance ? (
                <Link
                  className="font-mono font-semibold underline"
                  to={`/collaborators/${entry.collaboratorId}`}
                >
                  {entry.collaboratorId}
                </Link>
              ) : (
                <span className="font-mono">{entry.collaboratorId}</span>
              )}
            </dd>
          </div>
        </dl>
        {receipt && isFinalSettlementReceipt(receipt.receiptPurpose) ? (
          <dl className="mt-2 grid gap-1 rounded-xl bg-gray-50 p-3 text-xs text-gray-700 sm:grid-cols-2">
            <div>
              <dt className="inline font-semibold text-gray-900">{t("account.paymentDirection")}: </dt>
              <dd className="inline">{paymentDirectionCodeLabel(receipt.paymentDirection || "", t)}</dd>
            </div>
            <div>
              <dt className="inline font-semibold text-gray-900">{t("account.acceptingParty")}: </dt>
              <dd className="inline">{acceptingPartyCodeLabel(receipt.acceptingParty || "", t)}</dd>
            </div>
          </dl>
        ) : null}
        {receipt?.outstanding ? (
          <p className="mt-2 rounded-xl bg-amber-50 p-2 text-xs font-semibold text-amber-900">
            {isFinalSettlementReceipt(receipt.receiptPurpose)
              ? receipt.acceptingParty === "TENANT"
                ? t("account.awaitingTenantAcceptance")
                : t("account.awaitingCollaboratorAcceptance")
              : t("account.outstandingManualReceipt")}
          </p>
        ) : receipt && !receipt.outstanding ? (
          <p className={`mt-2 rounded-xl p-2 text-xs font-semibold ${receipt.status === "CANCELLED" ? "bg-gray-100 text-gray-700" : "bg-green-50 text-green-900"}`}>
            {isFinalSettlementReceipt(receipt.receiptPurpose)
              ? t("account.finalReceiptAccepted")
              : receipt.status === "CANCELLED"
                ? t("account.receiptCancelled")
                : t("account.receiptReturned")}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2 md:justify-end">
        {canOpenOperationalSources && sourceLink(entry) ? (
          <Link className="rounded-xl border px-4 py-2 text-sm font-semibold" to={sourceLink(entry)!}>
            {sourceActionLabel(entry, t)}
          </Link>
        ) : null}
        {canOpenReceipt && shouldShowReceiptAction(entry, receipt) ? (
          <Link
            className={receipt && !receipt.outstanding
              ? "rounded-xl border px-4 py-2 text-sm font-semibold"
              : "rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white"}
            to={`/ledger-entries/${entry.id}/receipt`}
          >
            {receiptActionLabel(receipt, t)}
          </Link>
        ) : null}
      </div>
    </article>
  );
}


function receiptActionLabel(receipt: LedgerEntry["receipt"], t: ReturnType<typeof useI18n>["t"]) {
  if (isFinalSettlementReceipt(receipt?.receiptPurpose)) {
    return t("account.reviewReceipt");
  }
  if (receipt && !receipt.outstanding) {
    return t("account.viewReceipt");
  }
  return t("account.printReturnReceipt");
}

function shouldShowReceiptAction(
  entry: LedgerEntry,
  receipt: LedgerEntry["receipt"],
) {
  if (!receipt) {
    return entry.direction === "DEBIT";
  }
  if (isFinalSettlementReceipt(receipt.receiptPurpose)) {
    return receipt.outstanding;
  }
  return true;
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

function sourceActionLabel(entry: LedgerEntry, t: ReturnType<typeof useI18n>["t"]) {
  if (entry.sourceType === "WORK_PERIOD_ASSIGNMENT") {
    return t("account.openWorkPeriod");
  }
  return t("account.openSource");
}

function sourceLabel(entry: LedgerEntry, t: ReturnType<typeof useI18n>["t"]) {
  if (entry.sourceLabel) {
    return `${entry.sourceLabel} · ${t("account.assignment")} ${shortId(entry.sourceId)}`;
  }
  return `${ledgerSourceTypeLabel(entry.sourceType, t)} · ${entry.sourceId}`;
}

function shortId(value: string) {
  if (!value) return "—";
  return value.length <= 12 ? value : `${value.slice(0, 8)}…`;
}

function formatAccountAmount(
  value: number,
  unit: string | undefined,
  formatCurrency: ReturnType<typeof useI18n>["formatCurrency"],
  formatNumber: ReturnType<typeof useI18n>["formatNumber"],
  t: ReturnType<typeof useI18n>["t"],
) {
  const normalized = (unit || "").toUpperCase();
  if (normalized.includes("GOLD")) {
    return `${formatNumber(value, { maximumFractionDigits: 8 })} ${t("account.goldUnit")}`;
  }
  return formatCurrency(value, "BRL");
}

function isFinalSettlementReceipt(purpose?: string) {
  return purpose === "FINAL_SETTLEMENT_TENANT_PAYMENT" ||
    purpose === "FINAL_SETTLEMENT_COLLABORATOR_PAYMENT";
}
