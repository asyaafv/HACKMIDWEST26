-- Independent enterprise reviews preserve the original financial records and tenant scope.
CREATE TABLE transaction_reviews (
  org_id uuid NOT NULL,
  request_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  choice text NOT NULL CHECK(choice IN ('approve','reject')),
  reason text NOT NULL,
  snapshot_hash text NOT NULL,
  request_version integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(org_id,request_id),
  FOREIGN KEY(org_id,request_id) REFERENCES requests(org_id,id),
  FOREIGN KEY(org_id,actor_id) REFERENCES principals(org_id,id)
);
ALTER TABLE transaction_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON transaction_reviews TO gate_runtime
  USING(org_id::text=current_setting('gate.org_id',true))
  WITH CHECK(org_id::text=current_setting('gate.org_id',true));
GRANT SELECT,INSERT ON transaction_reviews TO gate_runtime;
