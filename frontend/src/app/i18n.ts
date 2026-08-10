import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import commonEn from "../locales/en/common.json";
import commonPtBR from "../locales/pt-BR/common.json";
import collaboratorsEn from "../locales/en/collaborators.json";
import collaboratorsPtBR from "../locales/pt-BR/collaborators.json";
import expensesEn from "../locales/en/expenses.json";
import expensesPtBR from "../locales/pt-BR/expenses.json";
import peopleEn from "../locales/en/people.json";
import peoplePtBR from "../locales/pt-BR/people.json";
import planningEn from "../locales/en/planning.json";
import planningPtBR from "../locales/pt-BR/planning.json";

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { common: commonEn, collaborators: collaboratorsEn, expenses: expensesEn, people: peopleEn, planning: planningEn },
      "pt-BR": {
        common: commonPtBR,
        collaborators: collaboratorsPtBR,
        expenses: expensesPtBR,
        people: peoplePtBR,
        planning: planningPtBR,
      },
    },
    fallbackLng: "en",
    supportedLngs: ["en", "pt-BR"],
    defaultNS: "common",
    ns: ["common", "collaborators", "expenses", "people", "planning"],
    interpolation: { escapeValue: false },
    detection: {
      order: ["querystring", "localStorage", "navigator"],
      caches: ["localStorage"],
    },
    react: { useSuspense: false },
  });

export default i18n;
