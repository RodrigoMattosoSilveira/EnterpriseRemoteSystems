import type { Collaborator } from "../../types/collaborators";
import { translateEnglish, type Translate } from "../../i18n";

export type PaymentValueInputConfig = {
  maxDecimals: number;
  placeholder: string;
  helperText: string;
  pattern: string;
};

export function normalizePaymentMethodCode(code?: string) {
  switch ((code ?? "").trim().toUpperCase()) {
    case "DAILY":
    case "DAILY_WAGES":
    case "DAILY_BRL":
      return "DAILY_BRL";
    case "SALARY":
    case "FIXED_BRL":
      return "FIXED_BRL";
    case "COMMISSION":
    case "GOLD_COMMISSION":
      return "GOLD_COMMISSION";
    default:
      return "";
  }
}

export function paymentValueInputConfig(
  paymentMethodCode?: string,
  t: Translate = translateEnglish,
): PaymentValueInputConfig {
  switch (normalizePaymentMethodCode(paymentMethodCode)) {
    case "GOLD_COMMISSION":
      return {
        maxDecimals: 8,
        placeholder: "7.12345678",
        helperText: t("collaborators.paymentHelp.goldCommission"),
        pattern: "[0-9]+([\\.,][0-9]{1,8})?",
      };
    case "DAILY_BRL":
    case "FIXED_BRL":
      return {
        maxDecimals: 2,
        placeholder: "150.00",
        helperText: t("collaborators.paymentHelp.brl"),
        pattern: "[0-9]+([\\.,][0-9]{1,2})?",
      };
    default:
      return {
        maxDecimals: 8,
        placeholder: "0.00",
        helperText: t("collaborators.paymentHelp.selectMethod"),
        pattern: "[0-9]+([\\.,][0-9]{1,8})?",
      };
  }
}

export function validatePaymentValueInput(
  rawValue: string,
  config: PaymentValueInputConfig,
  t: Translate = translateEnglish,
): { valid: boolean; value: number; message: string } {
  const normalized = rawValue.trim().replace(",", ".");

  if (!normalized) {
    return {
      valid: false,
      value: Number.NaN,
      message: t("collaborators.paymentValidation.required"),
    };
  }

  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    return {
      valid: false,
      value: Number.NaN,
      message: t("collaborators.paymentValidation.numeric"),
    };
  }

  const decimalPart = normalized.split(".")[1] ?? "";
  if (decimalPart.length > config.maxDecimals) {
    return {
      valid: false,
      value: Number.NaN,
      message: t("collaborators.paymentValidation.decimals", {
        count: config.maxDecimals,
      }),
    };
  }

  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) {
    return {
      valid: false,
      value,
      message: t("collaborators.paymentValidation.positive"),
    };
  }

  return { valid: true, value, message: "" };
}

export function formatCollaboratorPaymentValue(
  collaborator: Collaborator,
  formatCurrency?: (value: number, currency: string) => string,
) {
  if (collaborator.goldCommissionPercent !== undefined) {
    return `${formatDecimal(collaborator.goldCommissionPercent, 8)}%`;
  }

  if (formatCurrency) {
    return formatCurrency(collaborator.paymentValue, "BRL");
  }

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(collaborator.paymentValue);
}

function formatDecimal(value: number, maxDecimals: number) {
  return value
    .toFixed(maxDecimals)
    .replace(/(\.\d*?[1-9])0+$/, "$1")
    .replace(/\.0+$/, "");
}
