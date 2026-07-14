import { Link, Outlet } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "./LanguageSwitcher";

export function RootLayout() {
  const { t } = useTranslation("common");

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-20 border-b bg-white/95 px-4 py-4 shadow-sm backdrop-blur">
        <div className="mx-auto flex flex-wrap items-center justify-between gap-4 max-w-7xl">
          <div className="flex flex-wrap items-center gap-6">
            <Link to="/people" className="text-xl font-semibold">
              {t("appName")}
            </Link>
            <nav className="flex flex-wrap items-center gap-4 text-sm text-slate-600">
              <Link className="hover:text-slate-900" to="/people">
                {t("people")}
              </Link>
              <Link className="hover:text-slate-900" to="/collaborators">
                {t("collaborators")}
              </Link>
              <Link className="hover:text-slate-900" to="/expenses">
                {t("expenses")}
              </Link>
              <Link className="hover:text-slate-900" to="/work-periods">
                {t("planning")}
              </Link>
              <Link className="hover:text-slate-900" to="/receipts/outstanding">
                {t("receipts")}
              </Link>
              <Link className="hover:text-slate-900" to="/admin/reference-data">
                {t("referenceData")}
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <LanguageSwitcher />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl p-4">
        <Outlet />
      </main>
    </div>
  );
}
