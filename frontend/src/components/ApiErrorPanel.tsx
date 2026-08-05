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

