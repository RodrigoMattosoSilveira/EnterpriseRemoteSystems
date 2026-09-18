import { useEffect } from "react";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import { JourneyDaysRemaining } from "../../components/JourneyDaysRemaining";
import { useFinancialProjection } from "./useFinancialProjection";
import { useI18n, translateEnglish, type Translate } from "../../i18n";

export function CurrentAndFutureEarningsModal({
  collaboratorId,
  onClose,
}: {
  collaboratorId: string;
  onClose: () => void;
}) {
  const { t, formatCurrency, formatNumber, formatDate } = useI18n();
  const projectionQuery = useFinancialProjection(collaboratorId, true);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const projection = projectionQuery.data;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        aria-labelledby="current-future-earnings-title"
        aria-modal="true"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {t("earnings.financialEstimate")}
            </p>
            <h2
              id="current-future-earnings-title"
              className="text-xl font-bold text-gray-950"
            >
              {t("earnings.title")}
            </h2>
            {projection?.collaboratorLabel && (
              <p className="mt-1 text-sm text-gray-500">
                {projection.collaboratorLabel}
              </p>
            )}
            {projection ? (
              <p className="mt-1 text-xs text-gray-500">
                {t("accrual.journeyProvenance")}: <span className="font-mono">{projection.collaboratorId}</span>
              </p>
            ) : null}
          </div>
          <button
            aria-label={t("earnings.closeAria")}
            className="rounded-lg px-3 py-1 text-2xl leading-none text-gray-500 hover:bg-gray-100"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>

        {projectionQuery.isLoading && (
          <p className="mt-6 text-sm text-gray-600">{t("earnings.loading")}</p>
        )}
        <ApiErrorPanel error={projectionQuery.error} translate={t} />

        {projection && (
          <div className="mt-6 space-y-5">
            <AmountSection
              title={t("earnings.currentBalances")}
              amounts={projection.currentBalances}
              colorBySign
              formatCurrency={formatCurrency}
              formatNumber={formatNumber}
              t={t}
            />
            <AmountSection
              title={t("earnings.ready")}
              amounts={projection.unpostedReadyEarnings ?? zeroAmounts}
              formatCurrency={formatCurrency}
              formatNumber={formatNumber}
              t={t}
            />
            <AmountSection
              title={t("earnings.future")}
              amounts={projection.estimatedFutureEarnings ?? zeroAmounts}
              formatCurrency={formatCurrency}
              formatNumber={formatNumber}
              t={t}
            />
            <AmountSection
              title={t("earnings.projected")}
              amounts={projection.projectedEarnings}
              formatCurrency={formatCurrency}
              formatNumber={formatNumber}
              t={t}
            />
            <AmountSection
              title={t("earnings.projectedBalances")}
              amounts={projection.projectedFinalBalances}
              colorBySign
              formatCurrency={formatCurrency}
              formatNumber={formatNumber}
              t={t}
            />

            <section className="rounded-xl border bg-gray-50 p-4 text-sm text-gray-700">
              <h3 className="font-semibold text-gray-950">{t("earnings.basis")}</h3>
              <JourneyDaysRemaining
                projectedEndDate={projection.projection.journeyEndDate}
                className="mt-1 block text-sm"
              />
              <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                <Detail
                  label={t("earnings.journeyEnd")}
                  value={formatDate(projection.projection.journeyEndDate)}
                />
                <Detail
                  label={t("earnings.calendarPeriods")}
                  value={String(
                    projection.projection.calendarWorkPeriods ??
                      projection.projection.remainingWorkPeriods,
                  )}
                />
                <Detail
                  label={t("earnings.postedPeriods")}
                  value={String(projection.projection.postedWorkPeriods ?? 0)}
                />
                <Detail
                  label={t("earnings.readyPeriods")}
                  value={String(
                    projection.projection.readyAccrualWorkPeriods ?? 0,
                  )}
                />
                <Detail
                  label={t("earnings.futurePeriods")}
                  value={String(
                    projection.projection.estimatedFutureWorkPeriods ??
                      projection.projection.remainingWorkPeriods,
                  )}
                />
                <Detail
                  label={t("earnings.pendingItems")}
                  value={String(projection.projection.pendingAccrualItems ?? 0)}
                />
                {projection.projection.locationLabel && (
                  <Detail
                    label={t("earnings.assignedWell")}
                    value={projection.projection.locationLabel}
                  />
                )}
                {projection.projection.productionMethod && (
                  <Detail
                    label={t("earnings.method")}
                    value={formatMethod(projection.projection.productionMethod)}
                  />
                )}
                {projection.projection.productionValueUsed !== undefined && (
                  <Detail
                    label={t("earnings.productionValue")}
                    value={`${formatNumber(projection.projection.productionValueUsed, { maximumFractionDigits: 8 })} g`}
                  />
                )}
              </dl>
              {projection.projection.warning && (
                <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
                  {formatWarning(projection.projection.warning, t)}
                </p>
              )}
              <p className="mt-3 text-xs text-gray-500">
                {t("earnings.basisHelp")}
              </p>
            </section>
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <button
            className="rounded-xl bg-gray-950 px-5 py-2.5 text-sm font-semibold text-white"
            onClick={onClose}
            type="button"
          >
            {t("earnings.close")}
          </button>
        </div>
      </section>
    </div>
  );
}

const zeroAmounts = { brlAmount: 0, goldGramAmount: 0 };

function AmountSection({
  title,
  amounts,
  colorBySign = false,
  formatCurrency,
  formatNumber,
  t,
}: {
  title: string;
  amounts: { brlAmount: number | null; goldGramAmount: number | null };
  colorBySign?: boolean;
  formatCurrency: (value: number, currency: string) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
  t: Translate;
}) {
  return (
    <section className="rounded-xl border p-4">
      <h3 className="font-semibold text-gray-950">{title}</h3>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        <Detail
          label={t("earnings.brl")}
          value={
            amounts.brlAmount === null
              ? t("earnings.unavailable")
              : formatCurrency(amounts.brlAmount, "BRL")
          }
          valueClassName={
            colorBySign ? balanceTextClassName(amounts.brlAmount) : undefined
          }
        />
        <Detail
          label={t("earnings.gramsGold")}
          value={
            amounts.goldGramAmount === null
              ? t("earnings.unavailable")
              : `${formatNumber(amounts.goldGramAmount, { maximumFractionDigits: 8 })} g`
          }
          valueClassName={
            colorBySign
              ? balanceTextClassName(amounts.goldGramAmount)
              : undefined
          }
        />
      </dl>
    </section>
  );
}

function Detail({
  label,
  value,
  valueClassName = "text-gray-950",
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        {label}
      </dt>
      <dd className={`mt-1 font-medium ${valueClassName}`}>{value}</dd>
    </div>
  );
}

function balanceTextClassName(value: number | null) {
  if (value === null) return "text-gray-950";
  return value >= 0 ? "text-green-700" : "text-red-700";
}

function formatMethod(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatWarning(value: string, t: Translate = translateEnglish) {
  if (value === "NO_GOLD_PRODUCTION_HISTORY")
    return t("earnings.warningNoGold");
  if (value === "PENDING_ACCRUAL_INPUTS")
    return t("earnings.warningPending");
  return value;
}
