PRAGMA foreign_keys = OFF;

DROP INDEX IF EXISTS ux_people_tenant_cpf;
DROP INDEX IF EXISTS ux_people_tenant_rg;
DROP INDEX IF EXISTS ux_people_tenant_cellular;
DROP INDEX IF EXISTS ux_people_tenant_email;
DROP INDEX IF EXISTS ux_people_tenant_pix_key;
DROP INDEX IF EXISTS idx_people_tenant_id;

CREATE UNIQUE INDEX IF NOT EXISTS ux_people_cpf ON people(cpf);
CREATE UNIQUE INDEX IF NOT EXISTS ux_people_rg ON people(rg);
CREATE UNIQUE INDEX IF NOT EXISTS ux_people_cellular ON people(cellular);
CREATE UNIQUE INDEX IF NOT EXISTS ux_people_email ON people(email);
CREATE UNIQUE INDEX IF NOT EXISTS ux_people_pix_key ON people(pix_key) WHERE pix_key IS NOT NULL;

PRAGMA foreign_keys = ON;
