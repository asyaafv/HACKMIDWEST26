-- Typed relationships supplement baseline links without changing legacy insert shape.
CREATE TABLE source_link_types (
  org_id uuid NOT NULL, from_id uuid NOT NULL, to_id uuid NOT NULL,
  relationship text NOT NULL CHECK (relationship IN ('ISSUE_TICKET','TICKET_ACCOUNT','DOCUMENT_TICKET')),
  PRIMARY KEY(org_id,from_id,to_id),
  FOREIGN KEY(org_id,from_id,to_id) REFERENCES source_links(org_id,from_id,to_id)
);
ALTER TABLE source_link_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON source_link_types TO gate_runtime USING (org_id::text=current_setting('gate.org_id',true)) WITH CHECK (org_id::text=current_setting('gate.org_id',true));
GRANT SELECT ON source_link_types TO gate_runtime;
CREATE INDEX source_link_from ON source_links(org_id,from_id);
