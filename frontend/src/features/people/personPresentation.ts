import type { Translate } from "../../i18n";

export function personStatusLabel(
  codeOrId: string,
  fallback: string,
  t: Translate,
): string {
  const normalized = codeOrId.trim().toUpperCase();
  if (normalized === "ACTIVE" || normalized === "REF-PERSON-STATUS-ACTIVE") {
    return t("common.active");
  }
  if (normalized === "INACTIVE" || normalized === "REF-PERSON-STATUS-INACTIVE") {
    return t("common.inactive");
  }
  if (normalized === "DISCONTINUED" || normalized === "REF-PERSON-STATUS-DISCONTINUED") {
    return t("common.discontinued");
  }
  return fallback;
}

export function personMissingSectionLabel(section: string, t: Translate): string {
  switch (section) {
    case "Address":
      return t("people.form.tab.address");
    case "Bank":
      return t("people.form.tab.bank");
    case "Emergency":
      return t("people.form.tab.emergency");
    default:
      return section;
  }
}
