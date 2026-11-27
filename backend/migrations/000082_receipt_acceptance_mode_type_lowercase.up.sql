-- Reference data types are lowercase snake_case everywhere else in the app.
-- Migration 000081 seeded RECEIPT_ACCEPTANCE_MODE in uppercase, which the
-- reference data admin screen does not list. Align the type code.
UPDATE reference_data
SET type = 'receipt_acceptance_mode'
WHERE type = 'RECEIPT_ACCEPTANCE_MODE';
