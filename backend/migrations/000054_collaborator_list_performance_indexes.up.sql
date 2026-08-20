-- Keep active Collaborator Journey pagination ordered without sorting the
-- tenant's complete open-journey set on every page.
CREATE INDEX IF NOT EXISTS idx_collaborator_journeys_tenant_open_created
ON collaborator_journeys (
  tenant_id,
  created_at DESC,
  journey_start_date DESC
)
WHERE closed_at IS NULL;
