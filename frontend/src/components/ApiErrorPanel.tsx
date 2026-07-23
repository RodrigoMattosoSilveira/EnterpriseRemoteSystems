import { ApiError } from "../api/client";
import {
  isDefaultRequestActor,
  isLocalRequestActorRuntime,
  readRequestActorSelection,
  resetDefaultRequestActorStored,
} from "../api/requestActorBootstrap";

export function ApiErrorPanel({ error }: { error: unknown }) {
  if (!error) return null;

  const message = error instanceof Error ? error.message : "Unexpected error";
  const recovery = localForbiddenActorRecovery(error);

  function restoreLocalBootstrapActor() {
    if (typeof window === "undefined") return;
    resetDefaultRequestActorStored(window.localStorage);
    window.location.reload();
  }

  return (
    <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800">
      <p className="font-semibold">{message}</p>

      {error instanceof ApiError && (
        <>
          {error.url && (
            <p className="mt-1 text-xs text-red-700">
              URL: {error.url}
            </p>
          )}

          <p className="mt-1 text-xs text-red-700">
            Status: {error.status ?? "network failure"}
            {error.code ? ` · Code: ${error.code}` : ""}
          </p>

          {error.fields && (
            <ul className="mt-2 list-disc pl-5 text-sm">
              {Object.entries(error.fields).map(([field, message]) => (
                <li key={field}>
                  <span className="font-medium">{field}:</span> {message}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {recovery && (
        <div className="mt-3 rounded-xl border border-red-300 bg-white/70 p-3 text-sm text-red-900">
          <p>
            Local ERS is currently operating as{" "}
            <code className="font-semibold">{recovery.actorId}</code> for tenant{" "}
            <code className="font-semibold">{recovery.tenantId}</code>. That persisted
            actor does not have permission for this page.
          </p>
          <p className="mt-1 text-xs text-red-700">
            Switching is explicit so authorization tests are never silently elevated.
          </p>
          <button
            type="button"
            onClick={restoreLocalBootstrapActor}
            className="mt-3 rounded-xl bg-red-900 px-3 py-2 text-sm font-semibold text-white shadow-sm"
          >
            Use bootstrap-admin and reload
          </button>
        </div>
      )}
    </div>
  );
}

function localForbiddenActorRecovery(error: unknown) {
  if (
    !(error instanceof ApiError) ||
    error.status !== 403 ||
    error.code !== "forbidden" ||
    typeof window === "undefined" ||
    !isLocalRequestActorRuntime()
  ) {
    return null;
  }

  const actor = readRequestActorSelection(window.localStorage);
  return isDefaultRequestActor(actor) ? null : actor;
}
