import type { AppLocale } from "../../i18n";
import { SERVER_MESSAGE_LOCALE, translateForLocale, type TranslationKey } from "../../i18n";
import type { AuthzPermission } from "../../types/authz";

// Only the presentation is localized. Permission codes remain server-authoritative.
// Unknown future codes preserve the backend label and description rather than guessing.
const permissionTranslationKeys: Record<string, readonly [TranslationKey, TranslationKey]> = {
  "people.read": ["byte352.support.permission.people.read.label", "byte352.support.permission.people.read.description"],
  "people.create": ["byte352.support.permission.people.create.label", "byte352.support.permission.people.create.description"],
  "people.update": ["byte352.support.permission.people.update.label", "byte352.support.permission.people.update.description"],
  "collaborators.read": ["byte352.support.permission.collaborators.read.label", "byte352.support.permission.collaborators.read.description"],
  "collaborators.create": ["byte352.support.permission.collaborators.create.label", "byte352.support.permission.collaborators.create.description"],
  "collaborators.update": ["byte352.support.permission.collaborators.update.label", "byte352.support.permission.collaborators.update.description"],
  "collaborators.work_assignment.update": ["byte352.support.permission.collaborators.work_assignment.update.label", "byte352.support.permission.collaborators.work_assignment.update.description"],
  "planning.read": ["byte352.support.permission.planning.read.label", "byte352.support.permission.planning.read.description"],
  "planning.create": ["byte352.support.permission.planning.create.label", "byte352.support.permission.planning.create.description"],
  "planning.update": ["byte352.support.permission.planning.update.label", "byte352.support.permission.planning.update.description"],
  "earnings.read": ["byte352.support.permission.earnings.read.label", "byte352.support.permission.earnings.read.description"],
  "earnings.create": ["byte352.support.permission.earnings.create.label", "byte352.support.permission.earnings.create.description"],
  "earnings.update": ["byte352.support.permission.earnings.update.label", "byte352.support.permission.earnings.update.description"],
  "price_lists.read": ["byte352.support.permission.price_lists.read.label", "byte352.support.permission.price_lists.read.description"],
  "price_lists.create": ["byte352.support.permission.price_lists.create.label", "byte352.support.permission.price_lists.create.description"],
  "price_lists.update": ["byte352.support.permission.price_lists.update.label", "byte352.support.permission.price_lists.update.description"],
  "gold_prices.manage": ["byte352.support.permission.gold_prices.manage.label", "byte352.support.permission.gold_prices.manage.description"],
  "gold_production.manage": ["byte352.support.permission.gold_production.manage.label", "byte352.support.permission.gold_production.manage.description"],
  "reference_data.read": ["byte352.support.permission.reference_data.read.label", "byte352.support.permission.reference_data.read.description"],
  "reference_data.manage": ["byte352.support.permission.reference_data.manage.label", "byte352.support.permission.reference_data.manage.description"],
  "expenses.read": ["byte352.support.permission.expenses.read.label", "byte352.support.permission.expenses.read.description"],
  "expenses.create": ["byte352.support.permission.expenses.create.label", "byte352.support.permission.expenses.create.description"],
  "expenses.update": ["byte352.support.permission.expenses.update.label", "byte352.support.permission.expenses.update.description"],
  "current_accounts.summary.read": ["byte352.support.permission.current_accounts.summary.read.label", "byte352.support.permission.current_accounts.summary.read.description"],
  "current_accounts.ledger.read": ["byte352.support.permission.current_accounts.ledger.read.label", "byte352.support.permission.current_accounts.ledger.read.description"],
  "current_accounts.ledger.create": ["byte352.support.permission.current_accounts.ledger.create.label", "byte352.support.permission.current_accounts.ledger.create.description"],
  "current_accounts.settings.read": ["byte352.support.permission.current_accounts.settings.read.label", "byte352.support.permission.current_accounts.settings.read.description"],
  "current_accounts.settings.update": ["byte352.support.permission.current_accounts.settings.update.label", "byte352.support.permission.current_accounts.settings.update.description"],
  "ledger.receipts.read": ["byte352.support.permission.ledger.receipts.read.label", "byte352.support.permission.ledger.receipts.read.description"],
  "ledger.receipts.create": ["byte352.support.permission.ledger.receipts.create.label", "byte352.support.permission.ledger.receipts.create.description"],
  "ledger.receipts.print": ["byte352.support.permission.ledger.receipts.print.label", "byte352.support.permission.ledger.receipts.print.description"],
  "ledger.receipts.return": ["byte352.support.permission.ledger.receipts.return.label", "byte352.support.permission.ledger.receipts.return.description"],
  "ledger.receipts.backfill": ["byte352.support.permission.ledger.receipts.backfill.label", "byte352.support.permission.ledger.receipts.backfill.description"],
  "ledger.receipts.tenant.accept": ["byte352.support.permission.ledger.receipts.tenant.accept.label", "byte352.support.permission.ledger.receipts.tenant.accept.description"],
  "ledger.corrections.create": ["byte352.support.permission.ledger.corrections.create.label", "byte352.support.permission.ledger.corrections.create.description"],
  "journey.settlements.preview": ["byte352.support.permission.journey.settlements.preview.label", "byte352.support.permission.journey.settlements.preview.description"],
  "journey.settlements.zero_gold": ["byte352.support.permission.journey.settlements.zero_gold.label", "byte352.support.permission.journey.settlements.zero_gold.description"],
  "journey.settlements.partial_payout": ["byte352.support.permission.journey.settlements.partial_payout.label", "byte352.support.permission.journey.settlements.partial_payout.description"],
  "journey.settlements.final_tenant_payment": ["byte352.support.permission.journey.settlements.final_tenant_payment.label", "byte352.support.permission.journey.settlements.final_tenant_payment.description"],
  "journey.settlements.final_collaborator_payment": ["byte352.support.permission.journey.settlements.final_collaborator_payment.label", "byte352.support.permission.journey.settlements.final_collaborator_payment.description"],
  "journey.settlements.close": ["byte352.support.permission.journey.settlements.close.label", "byte352.support.permission.journey.settlements.close.description"],
};

export function supportAccessPermissionText(locale: AppLocale, permission: AuthzPermission) {
  const keys = permissionTranslationKeys[permission.code];
  // The server writes permission text in SERVER_MESSAGE_LOCALE; every other locale uses the catalog.
  if (locale === SERVER_MESSAGE_LOCALE || !keys) {
    return { label: permission.label || permission.code, description: permission.description };
  }
  return {
    label: translateForLocale(locale, keys[0]),
    description: translateForLocale(locale, keys[1]),
  };
}
