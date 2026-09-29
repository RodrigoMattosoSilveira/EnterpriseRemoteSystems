DROP TRIGGER IF EXISTS trg_journey_close_requires_extension_resolution;
DROP TRIGGER IF EXISTS trg_journey_extension_no_delete;
DROP TRIGGER IF EXISTS trg_journey_extension_terminal_immutable;
DROP TABLE IF EXISTS journey_extension_requests;
DELETE FROM authz_permissions WHERE code = 'journey.extensions.self.respond';
