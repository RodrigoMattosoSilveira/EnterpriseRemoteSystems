import { useMemo, useEffect } from "react";
import { useI18n } from "../../i18n";
export function PersonPhotoPicker({ file, onChange }: { file: File | null; onChange: (file: File | null) => void }) {
 const { t } = useI18n();
 const url = useMemo(() => file ? URL.createObjectURL(file) : "", [file]);
 useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
 return <section className="mb-5 rounded-2xl border bg-white p-4 shadow-sm">
  <h2 className="text-lg font-semibold text-gray-950">{t("people.photo.title")}</h2>
  <p className="mt-1 text-sm text-gray-500">{t("people.photo.createDescription")}</p>
  <div className="mt-4 flex items-center gap-4">{url && <img src={url} alt={t("people.photo.previewAlt")} className="h-24 w-24 rounded-2xl border object-cover" />}
   <label className="cursor-pointer rounded-xl border px-4 py-2 text-sm font-semibold">{file ? t("people.photo.replace") : t("people.photo.add")}<input className="sr-only" aria-label={t("people.photo.fileLabel")} type="file" accept="image/jpeg,image/png" onChange={(e)=>onChange(e.target.files?.[0] ?? null)} /></label>
   {file && <button type="button" className="rounded-xl border px-4 py-2 text-sm" onClick={()=>onChange(null)}>{t("people.photo.clearSelection")}</button>}
  </div>
  <p className="mt-3 text-xs text-gray-500">{t("people.photo.requirements")}</p>
 </section>;
}
