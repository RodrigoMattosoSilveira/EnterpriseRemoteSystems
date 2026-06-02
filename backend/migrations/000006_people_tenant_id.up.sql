PRAGMA foreign_keys = OFF;

ALTER TABLE people ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default';

DROP INDEX IF EXISTS ux_people_cpf;
DROP INDEX IF EXISTS ux_people_rg;
DROP INDEX IF EXISTS ux_people_cellular;
DROP INDEX IF EXISTS ux_people_email;
DROP INDEX IF EXISTS ux_people_pix_key;

CREATE UNIQUE INDEX IF NOT EXISTS ux_people_tenant_cpf ON people(tenant_id, cpf);
CREATE UNIQUE INDEX IF NOT EXISTS ux_people_tenant_rg ON people(tenant_id, rg);
CREATE UNIQUE INDEX IF NOT EXISTS ux_people_tenant_cellular ON people(tenant_id, cellular);
CREATE UNIQUE INDEX IF NOT EXISTS ux_people_tenant_email ON people(tenant_id, email);
CREATE UNIQUE INDEX IF NOT EXISTS ux_people_tenant_pix_key ON people(tenant_id, pix_key) WHERE pix_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_people_tenant_id ON people(tenant_id);

PRAGMA foreign_keys = ON;
