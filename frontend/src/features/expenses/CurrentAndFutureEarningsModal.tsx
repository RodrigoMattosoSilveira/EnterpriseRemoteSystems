import { useEffect } from "react";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import { JourneyDaysRemaining } from "../../components/JourneyDaysRemaining";
import { useFinancialProjection } from "./useFinancialProjection";

export function CurrentAndFutureEarningsModal({
  collaboratorId,
  onClose,
}: {
  collaboratorId: string;
  onClose: () => void;
}) {
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
              Financial estimate
            </p>
            <h2
              id="current-future-earnings-title"
              className="text-xl font-bold text-gray-950"
            >
              Current and Future Earnings
            </h2>
            {projection?.collaboratorLabel && (
              <p className="mt-1 text-sm text-gray-500">
                {projection.collaboratorLabel}
              </p>
            )}
          </div>
          <button
            aria-label="Close Current and Future Earnings"
            className="rounded-lg px-3 py-1 text-2xl leading-none text-gray-500 hover:bg-gray-100"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>

        {projectionQuery.isLoading && (
          <p className="mt-6 text-sm text-gray-600">Loading earnings...</p>
        )}
        <ApiErrorPanel error={projectionQuery.error} />

        {projection && (
          <div className="mt-6 space-y-5">
            <AmountSection
              title="Current Balances"
              amounts={projection.currentBalances}
              colorBySign
            />
            <AmountSection
              title="Ready Accrual Earnings Not Yet Posted"
              amounts={projection.unpostedReadyEarnings ?? zeroAmounts}
            />
            <AmountSection
              title="Estimated Future Earnings"
              amounts={projection.estimatedFutureEarnings ?? zeroAmounts}
            />
            <AmountSection
              title="Projected Earnings Through Journey End"
              amounts={projection.projectedEarnings}
            />
            <AmountSection
              title="Projected Journey-End Balances"
              amounts={projection.projectedFinalBalances}
              colorBySign
            />

            <section className="rounded-xl border bg-gray-50 p-4 text-sm text-gray-700">
              <h3 className="font-semibold text-gray-950">Projection Basis</h3>
              <JourneyDaysRemaining
                projectedEndDate={projection.projection.journeyEndDate}
                className="mt-1 block text-sm"
              />
              <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                <Detail
                  label="Journey end"
                  value={formatDate(projection.projection.journeyEndDate)}
                />
                <Detail
                  label="Calendar work periods"
                  value={String(
                    projection.projection.calendarWorkPeriods ??
                      projection.projection.remainingWorkPeriods,
                  )}
                />
                <Detail
                  label="Posted work periods"
                  value={String(projection.projection.postedWorkPeriods ?? 0)}
                />
                <Detail
                  label="Ready accrual work periods"
                  value={String(
                    projection.projection.readyAccrualWorkPeriods ?? 0,
                  )}
                />
                <Detail
                  label="Estimated future work periods"
                  value={String(
                    projection.projection.estimatedFutureWorkPeriods ??
                      projection.projection.remainingWorkPeriods,
                  )}
                />
                <Detail
                  label="Pending accrual items"
                  value={String(projection.projection.pendingAccrualItems ?? 0)}
                />
                {projection.projection.locationLabel && (
                  <Detail
                    label="Assigned well"
                    value={projection.projection.locationLabel}
                  />
                )}
                {projection.projection.productionMethod && (
                  <Detail
                    label="Method"
                    value={formatMethod(projection.projection.productionMethod)}
                  />
                )}
                {projection.projection.productionValueUsed !== undefined && (
                  <Detail
                    label="Production value used"
                    value={`${formatGold(projection.projection.productionValueUsed)} g`}
                  />
                )}
              </dl>
              {projection.projection.warning && (
                <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
                  {formatWarning(projection.projection.warning)}
                </p>
              )}
              <p className="mt-3 text-xs text-gray-500">
                Current balances include posted ledger entries. Ready accruals are
                calculated but not posted yet. Estimated future earnings exclude
                work periods already posted or already represented by ready
                accruals.
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
            Close
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
}: {
  title: string;
  amounts: { brlAmount: number | null; goldGramAmount: number | null };
  colorBySign?: boolean;
}) {
  return (
    <section className="rounded-xl border p-4">
      <h3 className="font-semibold text-gray-950">{title}</h3>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        <Detail
          label="BRL"
          value={
            amounts.brlAmount === null
              ? "Unavailable"
              : formatBRL(amounts.brlAmount)
          }
          valueClassName={
            colorBySign ? balanceTextClassName(amounts.brlAmount) : undefined
          }
        />
        <Detail
          label="Grams of gold"
          value={
            amounts.goldGramAmount === null
              ? "Unavailable"
              : `${formatGold(amounts.goldGramAmount)} g`
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

function formatBRL(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function formatGold(value: number) {
  return value.toFixed(8);
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return year && month && day ? `${month}/${day}/${year}` : value;
}

function formatMethod(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatWarning(value: string) {
  if (value === "NO_GOLD_PRODUCTION_HISTORY")
    return "Projected gold earnings are unavailable because no usable gold-production history exists for the assigned well.";
  if (value === "PENDING_ACCRUAL_INPUTS")
    return "Some accrual items still need inputs. Ready accruals are included, but pending items are not counted until resolved.";
  return value;
}
