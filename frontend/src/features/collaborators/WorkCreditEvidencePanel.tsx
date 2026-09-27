import type { ReactNode } from "react";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import { useI18n, type Translate, type TranslationKey } from "../../i18n";
import type {
  WorkCreditAccountPosting,
  WorkCreditAccrualEvidence,
  WorkCreditWorkEvidence,
} from "../../types/workCreditEvidence";
import { formatCollaboratorPaymentValue } from "./paymentValue";
import { useSelfWorkCreditEvidence } from "./useCollaborators";

export function WorkCreditEvidencePanel({ journeyId }: { journeyId: string }) {
  const { t, formatCurrency, formatDate, formatNumber } = useI18n();
  const query = useSelfWorkCreditEvidence(journeyId, Boolean(journeyId));

  return (
    <section className="rounded-2xl border bg-white p-5 shadow-sm lg:col-span-2">
      <h2 className="text-lg font-semibold text-gray-950">{t("workCredit.title")}</h2>
      <p className="mt-1 text-sm text-gray-500">{t("workCredit.help")}</p>

      {query.isLoading ? (
        <p className="mt-5 text-sm text-gray-600">{t("workCredit.loading")}</p>
      ) : query.error ? (
        <div className="mt-5">
          <ApiErrorPanel error={query.error} translate={t} />
        </div>
      ) : query.data ? (
        <div className="mt-5 grid gap-5">
          <section className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
            <h3 className="font-semibold text-gray-950">{t("workCredit.compensationRule")}</h3>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <EvidenceFact
                label={t("collaborator.method")}
                value={query.data.journey.paymentMethodLabel || query.data.journey.paymentMethodId}
              />
              <EvidenceFact
                label={t("collaborator.value")}
                value={formatCollaboratorPaymentValue(query.data.journey, formatCurrency)}
              />
            </dl>
          </section>

          <EvidenceSection
            title={t("workCredit.workRecognized")}
            help={t("workCredit.workRecognizedHelp")}
            empty={query.data.workRecognized.length === 0 ? t("workCredit.emptyWork") : ""}
          >
            {query.data.workRecognized.map((item) => (
              <WorkEvidenceRow key={item.assignmentId} item={item} />
            ))}
          </EvidenceSection>

          <EvidenceSection
            title={t("workCredit.earningsCalculated")}
            help={t("workCredit.earningsCalculatedHelp")}
            empty={query.data.earningsCalculated.length === 0 ? t("workCredit.emptyAccrual") : ""}
          >
            {query.data.earningsCalculated.map((item) => (
              <AccrualEvidenceRow key={item.id} item={item} />
            ))}
          </EvidenceSection>

          <EvidenceSection
            title={t("workCredit.accountPostings")}
            help={t("workCredit.accountPostingsHelp")}
            empty={query.data.accountPostings.length === 0 ? t("workCredit.emptyPostings") : ""}
          >
            {query.data.accountPostings.map((item) => (
              <PostingEvidenceRow key={item.id} item={item} />
            ))}
          </EvidenceSection>
        </div>
      ) : null}
    </section>
  );

  function WorkEvidenceRow({ item }: { item: WorkCreditWorkEvidence }) {
    const title = [formatDate(item.workDate), item.workPeriodName || item.periodCode]
      .filter(Boolean)
      .join(" · ");
    const production = item.productionEntries > 0
      ? t("workCredit.productionGold", {
          grams: formatNumber(item.goldGramsProduced, { maximumFractionDigits: 8 }),
        })
      : t("workCredit.productionNone");

    return (
      <article className="rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h4 className="font-semibold text-gray-950">{title}</h4>
            <p className="mt-1 text-xs text-gray-500">
              {t("workCredit.workPeriodId")}: <span className="font-mono">{item.workPeriodId}</span>
            </p>
          </div>
          <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">
            {domainCodeLabel(item.workPeriodStatus, t)}
          </span>
        </div>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <EvidenceFact label={t("workCredit.actualOutcome")} value={domainCodeLabel(item.actualStatus || "—", t)} />
          <EvidenceFact label={t("workCredit.plannedStatus")} value={domainCodeLabel(item.plannedStatus, t)} />
          <EvidenceFact label={t("collaborator.sector")} value={item.sectorLabel || item.sectorId} />
          <EvidenceFact label={t("collaborator.location")} value={item.locationLabel || item.locationId} />
          <EvidenceFact label={t("collaborator.task")} value={item.taskLabel || item.taskId} />
          <EvidenceFact label={t("workCredit.productionInput")} value={production} />
          <EvidenceFact label={t("workCredit.assignmentId")} value={item.assignmentId} mono />
        </dl>
      </article>
    );
  }

  function AccrualEvidenceRow({ item }: { item: WorkCreditAccrualEvidence }) {
    return (
      <article className="rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h4 className="font-semibold text-gray-950">
              {formatDate(item.workDate)} · {domainCodeLabel(item.calculationType, t)}
            </h4>
            <p className="mt-1 text-xs text-gray-500">
              {t("workCredit.accrualRunId")}: <span className="font-mono">{item.accrualRunId}</span>
            </p>
          </div>
          <span className="rounded-full bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-700">
            {domainCodeLabel(item.status, t)}
          </span>
        </div>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <EvidenceFact label={t("workCredit.calculationRule")} value={domainCodeLabel(item.calculationType, t)} />
          <EvidenceFact label={t("accrual.direction")} value={financialDirectionLabel(item.direction, t)} />
          <EvidenceFact label={t("workCredit.amountEarned")} value={accrualAmount(item)} />
          <EvidenceFact label={t("workCredit.accrualDate")} value={formatDate(item.accrualDate)} />
          <EvidenceFact label={t("workCredit.accrualRun")} value={domainCodeLabel(item.accrualRunStatus, t)} />
          {item.pendingReason ? (
            <EvidenceFact label={t("workCredit.pendingReason")} value={domainCodeLabel(item.pendingReason, t)} />
          ) : null}
          <EvidenceFact label={t("workCredit.workPeriodId")} value={item.workPeriodId} mono />
          {item.workPeriodAssignmentId ? (
            <EvidenceFact label={t("workCredit.assignmentId")} value={item.workPeriodAssignmentId} mono />
          ) : null}
        </dl>
        {item.description ? <p className="mt-3 text-sm text-gray-600">{item.description}</p> : null}
      </article>
    );
  }

  function PostingEvidenceRow({ item }: { item: WorkCreditAccountPosting }) {
    const receipt = item.receipt;
    return (
      <article className="rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h4 className="font-semibold text-gray-950">{financialEntryLabel(item.entryType, t)}</h4>
            <p className="mt-1 text-sm text-gray-700">
              {postingAmount(item)} · {formatDate(item.effectiveDate)}
            </p>
          </div>
          <span className={`rounded-full px-2 py-1 text-xs font-semibold ${item.direction === "DEBIT" ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
            {postingDirectionLabel(item.direction, t)}
          </span>
        </div>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <EvidenceFact label={t("workCredit.sourceProvenance")} value={financialSourceLabel(item.sourceType, t)} />
          <EvidenceFact label={t("workCredit.sourceId")} value={item.sourceId} mono />
          <EvidenceFact label={t("workCredit.correction")} value={correctionLabel(item.correctionType, t)} />
          {item.relatedEntryId ? (
            <EvidenceFact label={t("workCredit.relatedEntry")} value={item.relatedEntryId} mono />
          ) : null}
          {receipt ? (
            <EvidenceFact
              label={t("workCredit.receipt")}
              value={`${receiptStatusLabel(receipt.status, t)} · ${receipt.outstanding ? t("workCredit.receiptOutstanding") : t("workCredit.receiptComplete")}${receipt.receiptNumber ? ` · ${receipt.receiptNumber}` : ""}`}
            />
          ) : null}
          {!item.active ? <EvidenceFact label={t("workCredit.status")} value={t("workCredit.inactivePosting")} /> : null}
        </dl>
        {item.description ? <p className="mt-3 text-sm text-gray-600">{item.description}</p> : null}
        {item.correctionReasonText ? <p className="mt-2 text-xs text-gray-500">{item.correctionReasonText}</p> : null}
      </article>
    );
  }

  function accrualAmount(item: WorkCreditAccrualEvidence) {
    const values: string[] = [];
    if (item.brlAmount !== undefined) values.push(formatCurrency(item.brlAmount, "BRL"));
    if (item.goldGramAmount !== undefined) {
      values.push(`${formatNumber(item.goldGramAmount, { maximumFractionDigits: 8 })} g`);
    }
    return values.length > 0 ? values.join(" · ") : "—";
  }

  function postingAmount(item: WorkCreditAccountPosting) {
    const code = (item.valueUnitCode || "").toUpperCase();
    if (code === "BRL") return formatCurrency(item.signedAmount, "BRL");
    if (code.includes("GOLD")) {
      return `${formatNumber(item.signedAmount, { maximumFractionDigits: 8 })} g`;
    }
    return `${formatNumber(item.signedAmount, { maximumFractionDigits: 8 })} ${item.valueUnitLabel || item.valueUnitCode || ""}`.trim();
  }
}

function EvidenceSection({
  title,
  help,
  empty,
  children,
}: {
  title: string;
  help: string;
  empty: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h3 className="font-semibold text-gray-950">{title}</h3>
      <p className="mt-1 text-sm text-gray-500">{help}</p>
      {empty ? <p className="mt-3 rounded-xl border border-dashed p-4 text-sm text-gray-600">{empty}</p> : <div className="mt-3 grid gap-3">{children}</div>}
    </section>
  );
}

function EvidenceFact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="font-semibold text-gray-900">{label}</dt>
      <dd className={`mt-0.5 text-gray-700 ${mono ? "break-all font-mono text-xs" : ""}`}>{value || "—"}</dd>
    </div>
  );
}

const domainCodeKeys: Record<string, TranslationKey> = {
  PLANNING: "planning.code.PLANNING",
  INFORMED: "planning.code.INFORMED",
  ACCRUAL_OPEN: "planning.code.ACCRUAL_OPEN",
  PARTIALLY_POSTED: "planning.code.PARTIALLY_POSTED",
  FULLY_POSTED: "planning.code.FULLY_POSTED",
  CLOSED: "planning.code.CLOSED",
  INCLUDED: "planning.code.INCLUDED",
  EXCLUDED: "planning.code.EXCLUDED",
  WORKED: "planning.code.WORKED",
  ABSENT: "planning.code.ABSENT",
  SICK_DAY_OFF: "planning.code.SICK_DAY_OFF",
  TIME_OFF: "planning.code.TIME_OFF",
  REPLACED: "planning.code.REPLACED",
  CANCELLED: "planning.code.CANCELLED",
  DRAFT: "planning.code.DRAFT",
  PENDING_INPUT: "planning.code.PENDING_INPUT",
  READY_TO_POST: "planning.code.READY_TO_POST",
  POSTED: "planning.code.POSTED",
  VOIDED: "planning.code.VOIDED",
  PENDING: "planning.code.PENDING",
  READY: "planning.code.READY",
  SKIPPED: "planning.code.SKIPPED",
  ACTUAL_OUTCOME: "planning.code.ACTUAL_OUTCOME",
  DAILY_BRL: "planning.code.DAILY_BRL",
  FIXED_BRL_DAILY: "planning.code.FIXED_BRL_DAILY",
  GOLD_COMMISSION: "planning.code.GOLD_COMMISSION",
  ACTUAL_OUTCOME_MISSING: "planning.code.ACTUAL_OUTCOME_MISSING",
  GOLD_PRODUCTION_MISSING: "planning.code.GOLD_PRODUCTION_MISSING",
  PAYMENT_CONFIGURATION_MISSING: "planning.code.PAYMENT_CONFIGURATION_MISSING",
  REPLACEMENT_RULE_DEFERRED: "planning.code.REPLACEMENT_RULE_DEFERRED",
  REPLACEMENT_ASSIGNMENT_MISSING: "planning.code.REPLACEMENT_ASSIGNMENT_MISSING",
};

function domainCodeLabel(code: string, t: Translate) {
  const normalized = (code || "").trim().toUpperCase();
  return domainCodeKeys[normalized] ? t(domainCodeKeys[normalized]) : code || "—";
}

const financialEntryKeys: Record<string, TranslationKey> = {
  EARNING_CREDIT: "financial.entry.EARNING_CREDIT",
  EXPENSE_DEDUCTION: "financial.entry.EXPENSE_DEDUCTION",
  GOLD_TO_BRL_CONVERSION: "financial.entry.GOLD_TO_BRL_CONVERSION",
  PIX_REMITTANCE: "financial.entry.PIX_REMITTANCE",
  REPLACEMENT_TRANSFER: "financial.entry.REPLACEMENT_TRANSFER",
  PAYOUT: "financial.entry.PAYOUT",
  FINAL_SETTLEMENT: "financial.entry.FINAL_SETTLEMENT",
  ADJUSTMENT: "financial.entry.ADJUSTMENT",
};

const financialSourceKeys: Record<string, TranslationKey> = {
  EXPENSE: "financial.source.EXPENSE",
  EXPENSE_REPLACEMENT: "financial.source.EXPENSE_REPLACEMENT",
  JOURNEY_SETTLEMENT: "financial.source.JOURNEY_SETTLEMENT",
  LEDGER_CORRECTION: "financial.source.LEDGER_CORRECTION",
  ACCRUAL_ITEM: "financial.source.ACCRUAL_ITEM",
  WORK_PERIOD_ASSIGNMENT: "financial.source.WORK_PERIOD_ASSIGNMENT",
};

function financialEntryLabel(code: string, t: Translate) {
  return financialEntryKeys[code] ? t(financialEntryKeys[code]) : code;
}

function financialSourceLabel(code: string, t: Translate) {
  return financialSourceKeys[code] ? t(financialSourceKeys[code]) : code;
}

function financialDirectionLabel(code: string, t: Translate) {
  return code === "DEBIT" ? t("financial.direction.DEBIT") : code === "CREDIT" ? t("financial.direction.CREDIT") : code;
}

function postingDirectionLabel(code: string, t: Translate) {
  if (code === "CREDIT") return t("workCredit.creditPosted");
  if (code === "DEBIT") return t("workCredit.debitPosted");
  return code;
}

function correctionLabel(code: string, t: Translate) {
  switch ((code || "").toUpperCase()) {
    case "REVERSAL": return t("workCredit.correction.REVERSAL");
    case "REPLACEMENT": return t("workCredit.correction.REPLACEMENT");
    default: return t("workCredit.correction.ORIGINAL");
  }
}

function receiptStatusLabel(code: string, t: Translate) {
  switch ((code || "").toUpperCase()) {
    case "PENDING_ISSUE": return t("receipt.status.pendingIssue");
    case "ISSUED": return t("receipt.status.issued");
    case "PRINTED": return t("receipt.status.printed");
    case "SIGNED": return t("receipt.status.signed");
    case "RETURNED": return t("receipt.status.returned");
    case "CANCELLED": return t("receipt.status.cancelled");
    default: return code;
  }
}
