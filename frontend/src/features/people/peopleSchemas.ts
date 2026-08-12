import type { UpdatePersonInput } from "../../types/people";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RG_RE = /^[A-Za-z0-9.\-]{5,20}$/;
const BRAZILIAN_CELLULAR_RE = /^\+?55?[1-9]{2}9[0-9]{8}$|^[1-9]{2}9[0-9]{8}$/;
const CEP_SEPARATOR_RE = /[.\-‐‑‒–—−\s]/g;

export function isValidUpdatePersonInput(input: UpdatePersonInput): boolean {
  if (
    isBlank(input.firstName) ||
    isBlank(input.lastName) ||
    isBlank(input.nickname) ||
    isBlank(input.cpf) ||
    isBlank(input.rg) ||
    isBlank(input.cellular) ||
    isBlank(input.email) ||
    isBlank(input.statusId)
  ) {
    return false;
  }

  if (!isValidCPF(input.cpf)) return false;
  if (!RG_RE.test(input.rg.trim())) return false;
  if (!isValidBrazilianCellular(input.cellular)) return false;
  if (!EMAIL_RE.test(input.email.trim())) return false;

  if (input.cep && !isValidCEP(input.cep)) return false;
  if (
    input.emergencyCellular &&
    !isValidBrazilianCellular(input.emergencyCellular)
  ) {
    return false;
  }
  if (input.emergencyEmail && !EMAIL_RE.test(input.emergencyEmail.trim())) {
    return false;
  }
  if (input.country && input.country.trim() !== "Brasil") return false;

  return true;
}

export function updatePersonFingerprint(input: UpdatePersonInput): string {
  return JSON.stringify({
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    nickname: input.nickname.trim(),
    cpf: digitsOnly(input.cpf),
    rg: input.rg.trim(),
    cellular: digitsOnly(input.cellular),
    email: input.email.trim().toLowerCase(),
    street1: (input.street1 ?? "").trim(),
    street2: (input.street2 ?? "").trim(),
    state: (input.state ?? "").trim(),
    cep: normalizeCEP(input.cep ?? ""),
    city: (input.city ?? "").trim(),
    country: (input.country ?? "Brasil").trim() || "Brasil",
    bankName: (input.bankName ?? "").trim(),
    bankNumber: (input.bankNumber ?? "").trim(),
    checkingAccount: (input.checkingAccount ?? "").trim(),
    pixKey: (input.pixKey ?? "").trim(),
    emergencyName: (input.emergencyName ?? "").trim(),
    emergencyCellular: digitsOnly(input.emergencyCellular ?? ""),
    emergencyEmail: (input.emergencyEmail ?? "").trim().toLowerCase(),
    statusId: input.statusId.trim(),
    notes: (input.notes ?? "").trim(),
  });
}

function isBlank(value: string): boolean {
  return value.trim() === "";
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function isValidBrazilianCellular(value: string): boolean {
  const trimmed = value.trim();
  const normalized = trimmed.startsWith("+")
    ? `+${digitsOnly(trimmed.slice(1))}`
    : digitsOnly(trimmed);

  return BRAZILIAN_CELLULAR_RE.test(normalized);
}

function isValidCEP(value: string): boolean {
  const compact = value.trim().replace(CEP_SEPARATOR_RE, "");
  return /^\d{5}$/.test(compact) || /^\d{8}$/.test(compact);
}

function normalizeCEP(value: string): string {
  const compact = value.trim().replace(CEP_SEPARATOR_RE, "");
  if (/^\d{5}$/.test(compact)) return `${compact}000`;
  return compact;
}

function isValidCPF(value: string): boolean {
  const cpf = digitsOnly(value);
  if (cpf.length !== 11 || /^([0-9])\1{10}$/.test(cpf)) return false;

  const firstCheckDigit = cpfCheckDigit(cpf.slice(0, 9), 10);
  if (firstCheckDigit !== Number(cpf[9])) return false;

  const secondCheckDigit = cpfCheckDigit(cpf.slice(0, 10), 11);
  return secondCheckDigit === Number(cpf[10]);
}

function cpfCheckDigit(digits: string, weightStart: number): number {
  let sum = 0;
  for (let index = 0; index < digits.length; index += 1) {
    sum += Number(digits[index]) * (weightStart - index);
  }

  const digit = 11 - (sum % 11);
  return digit >= 10 ? 0 : digit;
}
