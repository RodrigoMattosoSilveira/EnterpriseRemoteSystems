import { useI18n } from "../../i18n";

export function LanguageSelector({ compact = false }: { compact?: boolean }) {
  const { locale, localeSource, setLocale, t, useBrowserLocale } = useI18n();
  const value = localeSource === "stored" ? locale : "browser";

  return (
    <label className={`grid gap-1 text-xs font-bold text-slate-600 ${compact ? "min-w-[11rem]" : "w-full"}`}>
      {t("locale.selectorLabel")}
      <select
        aria-label={t("locale.selectorLabel")}
        autoComplete="off"
        key={`${localeSource}:${locale}`}
        value={value}
        onChange={(event) => {
          const next = event.target.value;
          if (next === "browser") {
            useBrowserLocale();
          } else if (next === "en-US" || next === "pt-BR") {
            setLocale(next);
          }
        }}
        className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-300"
      >
        <option value="browser">{t("locale.browser")}</option>
        <option value="en-US">{t("locale.en-US")}</option>
        <option value="pt-BR">{t("locale.pt-BR")}</option>
      </select>
    </label>
  );
}
