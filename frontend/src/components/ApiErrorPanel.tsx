import { useTranslation } from "react-i18next";
import { ApiError } from "../api/client";

export function ApiErrorPanel({ error }: { error: unknown }) {
  const { t } = useTranslation("common");

  if (!error) return null;

  const codeKey = error instanceof ApiError ? apiErrorCodeToKey(error.code) : undefined;
  const message = codeKey
    ? t(codeKey, { defaultValue: error instanceof Error ? error.message : "" })
    : error instanceof Error
    ? error.message
    : t("apiErrors.unexpected");

  const hintKey = authenticationHintKey(error);

  return (
    <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800">
      <p className="font-semibold">{message}</p>

      {error instanceof ApiError && (
        <>
          {error.url && (
            <p className="mt-1 text-xs text-red-700">URL: {error.url}</p>
          )}

          <p className="mt-1 text-xs text-red-700">
            Status: {error.status ?? "network failure"}
            {error.code ? ` · Code: ${error.code}` : ""}
          </p>

          {error.fields && (
            <ul className="mt-2 list-disc pl-5 text-sm">
              {Object.entries(error.fields).map(([field, fieldMessage]) => {
                const fieldKey = FIELD_ERROR_KEY[fieldMessage];
                return (
                  <li key={field}>
                    <span className="font-medium">{field}:</span>{" "}
                    {fieldKey ? t(fieldKey, { defaultValue: fieldMessage }) : fieldMessage}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {hintKey && (
        <p className="mt-3 rounded-xl border border-red-300 bg-white/70 p-3 text-sm text-red-900">
          {t(hintKey)}
        </p>
      )}
    </div>
  );
}

// Maps the fixed English strings emitted by the backend to common-namespace keys.
const FIELD_ERROR_KEY: Record<string, string> = {
  "Required": "fieldErrors.required",
  "CPF is invalid": "fieldErrors.cpfInvalid",
  "RG is invalid": "fieldErrors.rgInvalid",
  "Cellular must be a valid Brazilian mobile number": "fieldErrors.cellularInvalid",
  "Email is invalid": "fieldErrors.emailInvalid",
  "CEP is invalid": "fieldErrors.cepInvalid",
  "Emergency cellular must be a valid Brazilian mobile number": "fieldErrors.emergencyCellularInvalid",
  "Emergency email is invalid": "fieldErrors.emergencyEmailInvalid",
  "Country must be Brasil": "fieldErrors.countryInvalid",
  "Journey start date must be YYYY-MM-DD": "fieldErrors.journeyStartDateInvalid",
  "Extension days must be zero or greater": "fieldErrors.extensionDaysInvalid",
  "Planning availability must be ACTIVE, DAY_OFF, or LEAVE_OF_ABSENCE": "fieldErrors.planningAvailabilityInvalid",
  "Work date must be YYYY-MM-DD": "fieldErrors.workDateInvalid",
  "Start time must be RFC3339": "fieldErrors.startsAtInvalid",
  "End time must be RFC3339": "fieldErrors.endsAtInvalid",
  "End time must be after start time": "fieldErrors.endsAtAfterStart",
  "Date from must be YYYY-MM-DD": "fieldErrors.dateFromInvalid",
  "Date to must be YYYY-MM-DD": "fieldErrors.dateToInvalid",
  "Unknown work period status": "fieldErrors.unknownWorkPeriodStatus",
  "Page must be greater than zero": "fieldErrors.pageInvalid",
  "Page size must be greater than zero": "fieldErrors.pageSizeInvalid",
  "Collaborator can only appear once": "fieldErrors.collaboratorDuplicate",
  "Planned status must be INCLUDED or EXCLUDED": "fieldErrors.plannedStatusInvalid",
  "Actual status must be WORKED, ABSENT, SICK_DAY_OFF, TIME_OFF, REPLACED, or CANCELLED": "fieldErrors.actualStatusInvalid",
  "Replacement collaborator must be saved in this Work Period plan": "fieldErrors.replacementCollaboratorMissing",
  "Replacement collaborator must be selected in this Work Period plan": "fieldErrors.replacementCollaboratorNotSelected",
  "Accrual date must be YYYY-MM-DD": "fieldErrors.accrualDateInvalid",
  "Unknown accrual run status": "fieldErrors.unknownAccrualRunStatus",
  "Unknown accrual item status": "fieldErrors.unknownAccrualItemStatus",
  "Payment method must be active reference data of type method": "fieldErrors.paymentMethodReferenceInvalid",
  "Sector must be active reference data of type sector": "fieldErrors.sectorReferenceInvalid",
  "Location must be active reference data of type location": "fieldErrors.locationReferenceInvalid",
  "Task must be active reference data of type task": "fieldErrors.taskReferenceInvalid",
  "Status must be active reference data of type collaborator_status": "fieldErrors.collaboratorStatusReferenceInvalid",
  "Person profile must be complete before creating a collaborator": "fieldErrors.personProfileIncompleteForCollaborator",
  "Person already has an active collaborator journey": "fieldErrors.personAlreadyHasActiveCollaboratorJourney",
  "Collaborator status is required": "fieldErrors.collaboratorStatusRequired",
  "Payment value must be greater than zero": "fieldErrors.paymentValueGreaterThanZero",
  "Sector is inactive or does not exist": "fieldErrors.sectorInactiveOrMissing",
  "Item type must be CANTEEN or ADMINISTRATIVE": "fieldErrors.expenseItemTypeInvalid",
  "Currency code must be BRL or GOLD_GRAM": "fieldErrors.expenseCurrencyCodeInvalid",
  "Amount must be greater than zero": "fieldErrors.expenseAmountGreaterThanZero",
  "Quantity must be greater than zero": "fieldErrors.expenseQuantityGreaterThanZero",
  "Expense date must be YYYY-MM-DD": "fieldErrors.expenseDateInvalid",
  "Expense category is derived from the price list item": "fieldErrors.expenseCategoryDerived",
  "Value unit is derived from the selected currency": "fieldErrors.expenseValueUnitDerived",
  "Amount is calculated from unit price and quantity": "fieldErrors.expenseAmountCalculated",
  "Direction must be CREDIT or DEBIT": "fieldErrors.directionInvalid",
  "Effective date must be YYYY-MM-DD": "fieldErrors.effectiveDateInvalid",
  "Required when second-person approval is configured for sensitive operations": "fieldErrors.secondApprovalRequiredByPolicy",
  "Second approver must be different from the authorizing actor": "fieldErrors.secondApprovalMustDiffer",
  "BRL amount cannot be negative": "fieldErrors.brlAmountNonNegative",
  "BRL amount supports at most 2 decimal places": "fieldErrors.brlAmountMaxDecimals",
  "Gold amount cannot be negative": "fieldErrors.goldAmountNonNegative",
  "Gold amount supports at most 8 decimal places": "fieldErrors.goldAmountMaxDecimals",
  "At least one payout amount must be greater than zero": "fieldErrors.payoutAmountRequired",
  "Confirmation is required": "fieldErrors.confirmationRequired",
  "Status must be one of PENDING_ISSUE, ISSUED, PRINTED, or SIGNED": "fieldErrors.receiptStatusInvalid",
  "Source type must be one of EXPENSE, EXPENSE_REPLACEMENT, JOURNEY_SETTLEMENT, LEDGER_CORRECTION, or ACCRUAL_ITEM": "fieldErrors.receiptSourceTypeInvalid",
  "Authorized by is required": "fieldErrors.authorizedByRequired",
  "signed document reference is required to return a receipt": "fieldErrors.signedDocumentReferenceRequired",
};

// Maps known backend error codes to common-namespace translation keys.
function apiErrorCodeToKey(code?: string): string | undefined {
  switch (code) {
    case "forbidden":
      return "apiErrors.forbidden";
    case "authentication_required":
    case "session_expired":
    case "account_inactive":
      return "apiErrors.authenticationRequired";
    case "not_found":
      return "apiErrors.notFound";
    case "recent_reauthentication_required":
      return "apiErrors.recentReauthenticationRequired";
    case "no_positive_gold_balance":
      return "apiErrors.noPositiveGoldBalance";
    case "payout_exceeds_available_balance":
      return "apiErrors.payoutExceedsAvailableBalance";
    case "journey_close_conflict":
      return "apiErrors.journeyCloseConflict";
    case "ledger_settlement_disabled":
      return "apiErrors.ledgerSettlementDisabled";
    case "ledger_correction_disabled":
      return "apiErrors.ledgerCorrectionDisabled";
    case "ledger_correction_conflict":
      return "apiErrors.ledgerCorrectionConflict";
    case "receipt_cancelled":
      return "apiErrors.receiptCancelled";
    case "receipt_already_returned":
      return "apiErrors.receiptAlreadyReturned";
    case "missing_actor":
      return "apiErrors.missingActor";
    case "validation_failed":
    case "VALIDATION_ERROR":
    case "validation_error":
      return "apiErrors.validationFailed";
    default:
      return undefined;
  }
}

function authenticationHintKey(error: unknown): string | null {
  if (!(error instanceof ApiError)) return null;

  if (
    error.status === 401 &&
    [
      "authentication_required",
      "session_expired",
      "account_inactive",
      "actor_inactive",
    ].includes(error.code ?? "")
  ) {
    return "apiErrors.hints.signInAgain";
  }

  if (error.code === "tenant_selection_required") {
    return "apiErrors.hints.selectTenant";
  }

  return null;
}

