import { ApiError } from "../api/client";
import {
  DEFAULT_LOCALE,
  describeApiError,
  translateEnglish,
  useOptionalI18n,
  type Translate,
} from "../i18n";

export function ApiErrorPanel({ error, translate }: { error: unknown; translate?: Translate }) {
  // Callers no longer need to pass `translate`: inside I18nProvider the active
  // locale is used automatically. Outside it (isolated tests) English is used.
  const i18n = useOptionalI18n();
  if (!error) return null;

  const t = translate ?? i18n?.t ?? translateEnglish;
  const locale = i18n?.locale ?? DEFAULT_LOCALE;
  const described = describeApiError(error, locale, t);
  const authenticationHint = authenticationRecoveryHint(error, t);

  return (
    <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800">
      <p className="font-semibold">{described.message}</p>

      {error instanceof ApiError && (
        <>
          {error.url && (
            <p className="mt-1 text-xs text-red-700">{t("common.error.url")}: {error.url}</p>
          )}

          <p className="mt-1 text-xs text-red-700">
            {t("common.error.status")}: {error.status ?? t("common.error.networkFailure")}
            {error.code ? ` · ${t("common.error.code")}: ${error.code}` : ""}
          </p>

          {described.fields.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-sm">
              {described.fields.map(({ field, label, message }) => (
                <li key={field}>
                  <span className="font-medium">{label}:</span> {message}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {authenticationHint && (
        <p className="mt-3 rounded-xl border border-red-300 bg-white/70 p-3 text-sm text-red-900">
          {authenticationHint}
        </p>
      )}
    </div>
  );
}

function authenticationRecoveryHint(error: unknown, t: Translate): string | null {
  if (!(error instanceof ApiError)) return null;

  if (
    error.status === 401 &&
    [
      "authentication_required",
      "session_expired",
      "account_inactive",
      "account_security_suspended",
      "account_operationally_inactive",
      "actor_inactive",
    ].includes(error.code ?? "")
  ) {
    return t("common.error.authenticationHint");
  }

  if (error.code === "tenant_selection_required") {
    return t("common.error.tenantSelectionHint");
  }

  return null;
}
