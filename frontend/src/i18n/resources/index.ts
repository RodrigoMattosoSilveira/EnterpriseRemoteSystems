import { enUSMessages, type TranslationKey } from "./en-US";
import { ptBRMessages } from "./pt-BR";
import type { AppLocale } from "../locale";

export { enUSMessages, ptBRMessages };
export type { TranslationKey };

export const messagesByLocale: Record<AppLocale, Record<TranslationKey, string>> = {
  "en-US": enUSMessages,
  "pt-BR": ptBRMessages,
};
