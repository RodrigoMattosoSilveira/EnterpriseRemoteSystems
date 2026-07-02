PRAGMA foreign_keys = ON;

-- Starter planning reference data for Work Period planning.
--
-- Edit these values before applying the migration if your operational names differ.
-- Keep type values as: sector, location, task.
-- Keep codes stable after deployment because existing Collaborator Journeys and
-- Work Period Assignments reference these rows by id.

-- Sectors
INSERT OR IGNORE INTO reference_data (
  id,
  tenant_id,
  type,
  code,
  label,
  description,
  active,
  sort_order,
  metadata_json,
  created_at,
  updated_at
)
SELECT
  'seed-ref-' || tenants.id || '-sector-underground-mining',
  tenants.id,
  'sector',
  'UNDERGROUND_MINING',
  'Underground Mining',
  'Mine extraction and underground production work',
  1,
  20,
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM tenants
WHERE tenants.active = 1;

INSERT OR IGNORE INTO reference_data (
  id, tenant_id, type, code, label, description, active, sort_order, metadata_json, created_at, updated_at
)
SELECT
  'seed-ref-' || tenants.id || '-sector-processing',
  tenants.id,
  'sector',
  'PROCESSING',
  'Processing',
  'Ore handling, processing, and production support',
  1,
  30,
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM tenants
WHERE tenants.active = 1;

INSERT OR IGNORE INTO reference_data (
  id, tenant_id, type, code, label, description, active, sort_order, metadata_json, created_at, updated_at
)
SELECT
  'seed-ref-' || tenants.id || '-sector-site-support',
  tenants.id,
  'sector',
  'SITE_SUPPORT',
  'Site Support',
  'Logistics, supplies, and camp/site support work',
  1,
  40,
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM tenants
WHERE tenants.active = 1;

INSERT OR IGNORE INTO reference_data (
  id, tenant_id, type, code, label, description, active, sort_order, metadata_json, created_at, updated_at
)
SELECT
  'seed-ref-' || tenants.id || '-sector-maintenance',
  tenants.id,
  'sector',
  'MAINTENANCE',
  'Maintenance',
  'Equipment, infrastructure, and site maintenance work',
  1,
  50,
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM tenants
WHERE tenants.active = 1;

-- Locals / Locations
INSERT OR IGNORE INTO reference_data (
  id, tenant_id, type, code, label, description, active, sort_order, metadata_json, created_at, updated_at
)
SELECT
  'seed-ref-' || tenants.id || '-location-north-pit',
  tenants.id,
  'location',
  'NORTH_PIT',
  'North Pit',
  'North production area',
  1,
  20,
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM tenants
WHERE tenants.active = 1;

INSERT OR IGNORE INTO reference_data (
  id, tenant_id, type, code, label, description, active, sort_order, metadata_json, created_at, updated_at
)
SELECT
  'seed-ref-' || tenants.id || '-location-south-pit',
  tenants.id,
  'location',
  'SOUTH_PIT',
  'South Pit',
  'South production area',
  1,
  30,
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM tenants
WHERE tenants.active = 1;

INSERT OR IGNORE INTO reference_data (
  id, tenant_id, type, code, label, description, active, sort_order, metadata_json, created_at, updated_at
)
SELECT
  'seed-ref-' || tenants.id || '-location-processing-plant',
  tenants.id,
  'location',
  'PROCESSING_PLANT',
  'Processing Plant',
  'Ore and gold processing area',
  1,
  40,
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM tenants
WHERE tenants.active = 1;

INSERT OR IGNORE INTO reference_data (
  id, tenant_id, type, code, label, description, active, sort_order, metadata_json, created_at, updated_at
)
SELECT
  'seed-ref-' || tenants.id || '-location-camp',
  tenants.id,
  'location',
  'CAMP',
  'Camp',
  'Camp and lodging area',
  1,
  50,
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM tenants
WHERE tenants.active = 1;

-- Tasks
INSERT OR IGNORE INTO reference_data (
  id, tenant_id, type, code, label, description, active, sort_order, metadata_json, created_at, updated_at
)
SELECT
  'seed-ref-' || tenants.id || '-task-drilling',
  tenants.id,
  'task',
  'DRILLING',
  'Drilling',
  'Drilling and preparation work',
  1,
  20,
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM tenants
WHERE tenants.active = 1;

INSERT OR IGNORE INTO reference_data (
  id, tenant_id, type, code, label, description, active, sort_order, metadata_json, created_at, updated_at
)
SELECT
  'seed-ref-' || tenants.id || '-task-hauling',
  tenants.id,
  'task',
  'HAULING',
  'Hauling',
  'Hauling ore, supplies, or site materials',
  1,
  30,
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM tenants
WHERE tenants.active = 1;

INSERT OR IGNORE INTO reference_data (
  id, tenant_id, type, code, label, description, active, sort_order, metadata_json, created_at, updated_at
)
SELECT
  'seed-ref-' || tenants.id || '-task-gold-processing',
  tenants.id,
  'task',
  'GOLD_PROCESSING',
  'Gold Processing',
  'Gold processing and production support',
  1,
  40,
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM tenants
WHERE tenants.active = 1;

INSERT OR IGNORE INTO reference_data (
  id, tenant_id, type, code, label, description, active, sort_order, metadata_json, created_at, updated_at
)
SELECT
  'seed-ref-' || tenants.id || '-task-equipment-maintenance',
  tenants.id,
  'task',
  'EQUIPMENT_MAINTENANCE',
  'Equipment Maintenance',
  'Equipment inspection, repair, and maintenance',
  1,
  50,
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM tenants
WHERE tenants.active = 1;

INSERT OR IGNORE INTO reference_data (
  id, tenant_id, type, code, label, description, active, sort_order, metadata_json, created_at, updated_at
)
SELECT
  'seed-ref-' || tenants.id || '-task-camp-support',
  tenants.id,
  'task',
  'CAMP_SUPPORT',
  'Camp Support',
  'Camp support, meals, cleaning, and logistics',
  1,
  60,
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM tenants
WHERE tenants.active = 1;
