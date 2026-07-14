import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import commonEn from "../locales/en/common.json";
import peopleEn from "../locales/en/people.json";
import commonPtBR from "../locales/pt-BR/common.json";
import peoplePtBR from "../locales/pt-BR/people.json";

const resources = {
  en: {
    common: commonEn,
    people: peopleEn,
  },
  "pt-BR": {
    common: commonPtBR,
    people: peoplePtBR,
  },
};

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: "en",
    supportedLngs: ["en", "pt-BR"],
    defaultNS: "common",
    ns: ["common", "people"],
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ["querystring", "localStorage", "navigator"],
      caches: ["localStorage"],
    },
    react: {
      useSuspense: false,
    },
  });

export default i18n;
