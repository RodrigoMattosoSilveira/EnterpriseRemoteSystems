import { useI18n } from "../../i18n";
export default function SettingsPage() {
  const { t } = useI18n();
  return <section><h1>{t("settings.settings_c7f73b")}</h1><p>{t("settings.reference.data.and.system.settings_292fd5")}</p></section>;
}
