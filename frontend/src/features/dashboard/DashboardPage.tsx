import { useI18n } from "../../i18n";
export default function DashboardPage() {
  const { t } = useI18n();
  return (
    <div className="p-6">
      <h1>{t("dashboard.dashboard_d87f47")}</h1>
      <p>{t("dashboard.welcome_724486")}</p>
    </div>
  );
}