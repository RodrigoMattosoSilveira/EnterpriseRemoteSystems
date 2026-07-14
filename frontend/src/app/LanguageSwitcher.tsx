import { useTranslation } from "react-i18next";

const AVAILABLE_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "pt-BR", label: "Português (BR)" },
];

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();

  return (
    <label className="flex items-center gap-2">
      <span>{t("language")}</span>
      <select
        className="rounded border px-2 py-1"
        value={i18n.language}
        onChange={(event) => void i18n.changeLanguage(event.target.value)}
      >
        {AVAILABLE_LANGUAGES.map((item) => (
          <option key={item.code} value={item.code}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  );
}
