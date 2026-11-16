import type { UpdatePersonInput } from "../../types/people";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RG_RE = /^[A-Za-z0-9.\-]{5,20}$/;
const BRAZILIAN_CELLULAR_RE = /^\+?55?[1-9]{2}9[0-9]{8}$|^[1-9]{2}9[0-9]{8}$/;
const CEP_SEPARATOR_RE = /[.\-‐‑‒–—−\s]/g;

export function isValidUpdatePersonInput(input: UpdatePersonInput): boolean {
  return getUpdatePersonIssues(input).length === 0;
}

// Returns the labels of every field that blocks saving, so the form can tell the
// user exactly what to correct. Mirrors the backend validation rules.
export function getUpdatePersonIssues(input: UpdatePersonInput): string[] {
  const issues: string[] = [];
  if (isBlank(input.firstName)) issues.push("First name");
  if (isBlank(input.lastName)) issues.push("Last name");
  if (isBlank(input.nickname)) issues.push("Nickname");
  if (isBlank(input.cpf)) issues.push("CPF");
  if (isBlank(input.rg)) issues.push("RG");
  if (isBlank(input.cellular)) issues.push("Cellular");
  if (isBlank(input.email)) issues.push("Email");
  if (isBlank(input.statusId)) issues.push("Status");

  if (!isBlank(input.cpf) && !isValidCPF(input.cpf)) issues.push("CPF (invalid number)");
  if (!isBlank(input.rg) && !RG_RE.test(input.rg.trim())) issues.push("RG (5-20 letters/digits)");
  if (!isBlank(input.cellular) && !isValidBrazilianCellular(input.cellular)) issues.push("Cellular (format)");
  if (!isBlank(input.email) && !EMAIL_RE.test(input.email.trim())) issues.push("Email (format)");
  if (input.cep && !isValidCEP(input.cep)) issues.push("CEP (format)");
  if (input.emergencyCellular && !isValidBrazilianCellular(input.emergencyCellular)) {
    issues.push("Emergency cellular (format)");
  }
  if (input.emergencyEmail && !EMAIL_RE.test(input.emergencyEmail.trim())) {
    issues.push("Emergency email (format)");
  }
  if (input.country && input.country.trim() !== "Brasil") issues.push("Country");
  return issues;
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
