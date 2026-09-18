import { useEffect, useState, type FormEvent } from "react";
import type { GoldProductionEntry } from "../../types/accruals";
import type { ReferenceDataItem } from "../../types/referenceData";
import { useI18n } from "../../i18n";

export type MineProductionFormInput = {
  locationId: string;
  productionDate: string;
  goldGramsProduced: number;
  notes?: string;
};

export function MineProductionForm({
  workDate,
  locations,
  editingEntry,
  pending,
  resetToken,
  onSubmit,
  onCancelEdit,
}: {
  workDate?: string;
  locations: ReferenceDataItem[];
  editingEntry?: GoldProductionEntry | null;
  pending: boolean;
  resetToken: number;
  onSubmit: (input: MineProductionFormInput) => void;
  onCancelEdit: () => void;
}) {
  const { t } = useI18n();
  const [locationId, setLocationId] = useState("");
  const [grams, setGrams] = useState("");
  const [notes, setNotes] = useState("");
  const [validation, setValidation] = useState("");

  useEffect(() => {
    setValidation("");
    if (editingEntry) {
      setLocationId(editingEntry.locationId);
      setGrams(trimTrailingZeros(editingEntry.goldGramsProduced.toFixed(8)));
      setNotes(editingEntry.notes ?? "");
      return;
    }
    setLocationId("");
    setGrams("");
    setNotes("");
  }, [editingEntry, resetToken]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setValidation("");
    if (!workDate) {
      setValidation(t("production.validation.workPeriod"));
      return;
    }
    if (!locationId) {
      setValidation(t("production.validation.location"));
      return;
    }
    const trimmedGrams = grams.trim();
    if (!/^\d+(?:\.\d{1,8})?$/.test(trimmedGrams)) {
      setValidation(t("production.validation.decimals"));
      return;
    }
    const value = Number(trimmedGrams);
    if (!Number.isFinite(value) || value <= 0) {
      setValidation(t("production.validation.positive"));
      return;
    }
    onSubmit({
      locationId,
      productionDate: workDate,
      goldGramsProduced: value,
      notes: notes.trim(),
    });
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-2xl border bg-white p-5 shadow-sm"
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          {t("production.authorizedWorkflow")}
        </p>
        <h2 className="text-lg font-semibold text-gray-950">
          {editingEntry ? t("production.editTitle") : t("production.recordTitle")}
        </h2>
        <p className="text-sm text-gray-500">{t("production.formHelp")}</p>
      </div>
      {validation && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {validation}
        </div>
      )}
      <label className="block text-sm font-medium text-gray-700">
        {t("production.date")}
        <input
          readOnly
          value={workDate ?? ""}
          placeholder={t("production.selectWorkPeriod")}
          className="mt-1 w-full rounded-xl border bg-gray-50 px-3 py-2 text-gray-700"
        />
      </label>
      <label className="block text-sm font-medium text-gray-700">
        {t("production.locationRequired")}
        <select
          className="mt-1 w-full rounded-xl border px-3 py-2"
          value={locationId}
          onChange={(event) => setLocationId(event.target.value)}
          disabled={!workDate || pending}
        >
          <option value="">{t("production.selectWell")}</option>
          {locations.map((row) => (
            <option key={row.id} value={row.id}>
              {row.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm font-medium text-gray-700">
        {t("production.gramsRequired")}
        <input
          className="mt-1 w-full rounded-xl border px-3 py-2"
          inputMode="decimal"
          value={grams}
          onChange={(event) => setGrams(event.target.value)}
          placeholder="12.12345678"
          disabled={!workDate || pending}
        />
      </label>
      <label className="block text-sm font-medium text-gray-700">
        {t("common.notes")}
        <textarea
          className="mt-1 w-full rounded-xl border px-3 py-2"
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          rows={3}
          disabled={!workDate || pending}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          disabled={!workDate || pending}
          className="rounded-xl bg-gray-950 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {pending
            ? t("common.saving")
            : editingEntry
              ? t("production.save")
              : t("production.record")}
        </button>
        {editingEntry ? (
          <button
            type="button"
            onClick={onCancelEdit}
            className="rounded-xl border px-4 py-2 text-sm font-semibold"
          >
            {t("production.cancelEdit")}
          </button>
        ) : null}
      </div>
    </form>
  );
}

function trimTrailingZeros(value: string) {
  return value.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}
