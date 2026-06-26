PRAGMA foreign_keys = ON;

-- Keep gold-price source rows easy to scan and compare from SQLite-backed Go code.
-- Older local/dev rows may have been stored as timestamps or with NULL notes;
-- the API exposes priceDate as YYYY-MM-DD and notes as an optional string.
UPDATE gold_prices
SET price_date = substr(price_date, 1, 10)
WHERE price_date IS NOT NULL
  AND length(price_date) > 10;

UPDATE gold_prices
SET notes = ''
WHERE notes IS NULL;
