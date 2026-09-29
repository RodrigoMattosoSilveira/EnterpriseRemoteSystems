import { useEffect, useMemo, useState } from "react";
import { ApiErrorPanel } from "../../components/ApiErrorPanel";
import { useI18n } from "../../i18n";
import { useDeletePersonPhoto, usePersonPhoto, useSetPersonPhoto } from "./usePeople";

const MAX_BYTES = 5 * 1024 * 1024;

export function PersonPhotoCard({ personId, canManage, displayName }: { personId: string; canManage: boolean; displayName: string }) {
  const { t } = useI18n();
  const photoQuery = usePersonPhoto(personId);
  const setPhoto = useSetPersonPhoto(personId);
  const deletePhoto = useDeletePersonPhoto(personId);
  const [validationError, setValidationError] = useState("");
  const photoURL = useMemo(() => photoQuery.data ? URL.createObjectURL(photoQuery.data) : "", [photoQuery.data]);
  useEffect(() => () => { if (photoURL) URL.revokeObjectURL(photoURL); }, [photoURL]);

  async function choosePhoto(file: File | undefined) {
    setValidationError("");
    if (!file) return;
    if (file.type !== "image/jpeg" && file.type !== "image/png") { setValidationError(t("people.photo.invalidType")); return; }
    if (file.size <= 0 || file.size > MAX_BYTES) { setValidationError(t("people.photo.invalidSize")); return; }
    await setPhoto.mutateAsync(file);
  }

  const initials = displayName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("") || "?";

  return <section className="mb-5 rounded-2xl border bg-white p-4 shadow-sm" aria-labelledby="person-photo-title">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 id="person-photo-title" className="text-lg font-semibold text-gray-950">{t("people.photo.title")}</h2>
        <p className="mt-1 text-sm text-gray-500">{canManage ? t("people.photo.manageDescription") : t("people.photo.readDescription")}</p>
      </div>
      {canManage && <div className="flex gap-2">
        <label className="cursor-pointer rounded-xl border px-4 py-2 text-sm font-semibold">
          {photoQuery.data ? t("people.photo.replace") : t("people.photo.add")}
          <input aria-label={t("people.photo.fileLabel")} className="sr-only" type="file" accept="image/jpeg,image/png" disabled={setPhoto.isPending || deletePhoto.isPending} onChange={(event) => void choosePhoto(event.target.files?.[0])} />
        </label>
        <button type="button" className="rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-40" disabled={!photoQuery.data || setPhoto.isPending || deletePhoto.isPending} onClick={() => void deletePhoto.mutateAsync()}>{t("people.photo.remove")}</button>
      </div>}
    </div>
    <div className="mt-4 flex h-40 w-40 items-center justify-center overflow-hidden rounded-2xl border bg-gray-50">
      {photoURL ? <img src={photoURL} alt={t("people.photo.alt")} className="h-full w-full object-cover" /> : <span aria-label={t("people.photo.none")} className="text-3xl font-semibold text-gray-500">{initials}</span>}
    </div>
    {validationError && <p role="alert" className="mt-3 text-sm text-red-700">{validationError}</p>}
    <ApiErrorPanel error={photoQuery.error || setPhoto.error || deletePhoto.error} translate={t} />
    {canManage && <p className="mt-3 text-xs text-gray-500">{t("people.photo.requirements")}</p>}
  </section>;
}
