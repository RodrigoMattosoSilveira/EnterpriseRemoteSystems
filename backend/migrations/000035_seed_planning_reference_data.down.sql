PRAGMA foreign_keys = ON;

-- Reverse only rows inserted by 000035. This avoids deleting tenant-created
-- reference data that happens to reuse one of these codes.
DELETE FROM reference_data
WHERE id LIKE 'seed-ref-%'
  AND type = 'sector'
  AND code IN (
    'UNDERGROUND_MINING',
    'PROCESSING',
    'SITE_SUPPORT',
    'MAINTENANCE'
  );

DELETE FROM reference_data
WHERE id LIKE 'seed-ref-%'
  AND type = 'location'
  AND code IN (
    'NORTH_PIT',
    'SOUTH_PIT',
    'PROCESSING_PLANT',
    'CAMP'
  );

DELETE FROM reference_data
WHERE id LIKE 'seed-ref-%'
  AND type = 'task'
  AND code IN (
    'DRILLING',
    'HAULING',
    'GOLD_PROCESSING',
    'EQUIPMENT_MAINTENANCE',
    'CAMP_SUPPORT'
  );
