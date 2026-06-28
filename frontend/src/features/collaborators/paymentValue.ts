import type { Collaborator } from "../../types/collaborators";

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
): PaymentValueInputConfig {
  switch (normalizePaymentMethodCode(paymentMethodCode)) {
    case "GOLD_COMMISSION":
      return {
        maxDecimals: 8,
        placeholder: "7.12345678",
        helperText:
          "For gold commission, enter the collaborator's production percentage. Up to eight decimal places are allowed.",
        pattern: "[0-9]+([\\.,][0-9]{1,8})?",
      };
    case "DAILY_BRL":
    case "FIXED_BRL":
      return {
        maxDecimals: 2,
        placeholder: "150.00",
        helperText:
          "For Brazilian Real payments, enter a BRL amount. Up to two decimal places are allowed.",
        pattern: "[0-9]+([\\.,][0-9]{1,2})?",
      };
    default:
      return {
        maxDecimals: 8,
        placeholder: "0.00",
        helperText:
          "Select a payment method to see whether this value is a BRL amount or gold-production percentage.",
        pattern: "[0-9]+([\\.,][0-9]{1,8})?",
      };
  }
}

export function validatePaymentValueInput(
  rawValue: string,
  config: PaymentValueInputConfig,
): { valid: boolean; value: number; message: string } {
  const normalized = rawValue.trim().replace(",", ".");

  if (!normalized) {
    return {
      valid: false,
      value: Number.NaN,
      message: "Payment value is required.",
    };
  }

  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    return {
      valid: false,
      value: Number.NaN,
      message:
        "Payment value must use digits and an optional decimal separator.",
    };
  }

  const decimalPart = normalized.split(".")[1] ?? "";
  if (decimalPart.length > config.maxDecimals) {
    return {
      valid: false,
      value: Number.NaN,
      message: `Payment value can have at most ${numberWord(
        config.maxDecimals,
      )} decimal places.`,
    };
  }

  const value = Number(normalized);
  if (!Number.isFinite(value) || value <= 0) {
    return {
      valid: false,
      value,
      message: "Payment value must be greater than zero.",
    };
  }

  return { valid: true, value, message: "" };
}

export function formatCollaboratorPaymentValue(collaborator: Collaborator) {
  if (collaborator.goldCommissionPercent !== undefined) {
    return `${formatDecimal(collaborator.goldCommissionPercent, 8)}%`;
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

function numberWord(value: number) {
  switch (value) {
    case 2:
      return "two";
    case 8:
      return "eight";
    default:
      return String(value);
  }
}
