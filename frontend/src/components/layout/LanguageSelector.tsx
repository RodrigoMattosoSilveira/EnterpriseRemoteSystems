import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { useI18n } from "../../i18n";

export function LanguageSelector({ compact = false }: { compact?: boolean }) {
  const { locale, localeSource, setLocale, t, useBrowserLocale } = useI18n();
  const value = localeSource === "stored" ? locale : "browser";
  const selectRef = useRef<HTMLSelectElement>(null);

  const synchronizeNativeValue = useCallback(() => {
    const select = selectRef.current;
    if (select && select.value !== value) {
      select.value = value;
    }
  }, [value]);

  useLayoutEffect(() => {
    // Native <select> controls can be restored by the browser independently of
    // React state during a full reload/HMR recovery. Keep the visible control
    // authoritative to the I18nProvider instead of allowing a stale restored
    // option to imply a locale that ERS is not actually using.
    synchronizeNativeValue();
  }, [synchronizeNativeValue]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const synchronizeAfterBrowserRestore = () => {
      // Browser form restoration may happen after React's layout effects. Run
      // once more on the next frame, and whenever the page is restored/focused,
      // so the selector cannot drift from the provider's locale source.
      window.requestAnimationFrame(synchronizeNativeValue);
    };

    const frame = window.requestAnimationFrame(synchronizeNativeValue);
    window.addEventListener("pageshow", synchronizeAfterBrowserRestore);
    window.addEventListener("focus", synchronizeAfterBrowserRestore);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("pageshow", synchronizeAfterBrowserRestore);
      window.removeEventListener("focus", synchronizeAfterBrowserRestore);
    };
  }, [synchronizeNativeValue]);

  return (
    <label className={`grid gap-1 text-xs font-bold text-slate-600 ${compact ? "min-w-[11rem]" : "w-full"}`}>
      {t("locale.selectorLabel")}
      <select
        ref={selectRef}
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
