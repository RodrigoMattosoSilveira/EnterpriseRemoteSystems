import { ApiError } from "../api/client";

export function ApiErrorPanel({ error }: { error: unknown }) {
  if (!error) return null;

  const message = error instanceof Error ? error.message : "Unexpected error";
  const authenticationHint = authenticationRecoveryHint(error);

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
              {Object.entries(error.fields).map(([field, fieldMessage]) => (
                <li key={field}>
                  <span className="font-medium">{field}:</span> {fieldMessage}
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

function authenticationRecoveryHint(error: unknown): string | null {
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
    return "An authenticated user session is required. Sign in again before retrying this operation.";
  }

  if (error.code === "tenant_selection_required") {
    return "Select an available authorization context before retrying this operation.";
  }

  return null;
}
