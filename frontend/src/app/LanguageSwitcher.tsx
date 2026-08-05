import { useTranslation } from "react-i18next";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "pt-BR", label: "Português (BR)" },
];

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation("common");

  return (
    <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
      <span>{t("language")}</span>
      <select
        className="rounded border border-gray-300 px-2 py-1 text-sm shadow-sm"
        value={i18n.language}
        onChange={(e) => void i18n.changeLanguage(e.target.value)}
      >
        {LANGUAGES.map(({ code, label }) => (
          <option key={code} value={code}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}
