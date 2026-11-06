import { useI18n } from "../i18n";

type WorkAttribution = {
  workSectorId?: string;
  workSectorLabel?: string;
  workLocationId?: string;
  workLocationLabel?: string;
  workTaskId?: string;
  workTaskLabel?: string;
};

// A missing snapshot is not evidence of work performed (e.g. absence,
// time off, pre-migration ledger entries). Do not invent an attribution.
export function WorkAttributionDetails({ entry }: { entry: WorkAttribution }) {
  const { t } = useI18n();
  if (!entry.workSectorId || !entry.workLocationId || !entry.workTaskId) return null;
  return (
    <dl className="mt-2 grid gap-1 rounded-lg border border-gray-200 bg-gray-50 p-2 text-xs sm:grid-cols-3">
      <div className="font-semibold text-gray-700 sm:col-span-3">{t("byte353.workPerformed")}</div>
      <div><dt className="font-semibold text-gray-600">{t("byte353.actualSector")}</dt><dd>{entry.workSectorLabel || entry.workSectorId}</dd></div>
      <div><dt className="font-semibold text-gray-600">{t("byte353.actualLocation")}</dt><dd>{entry.workLocationLabel || entry.workLocationId}</dd></div>
      <div><dt className="font-semibold text-gray-600">{t("byte353.actualTask")}</dt><dd>{entry.workTaskLabel || entry.workTaskId}</dd></div>
    </dl>
  );
}
