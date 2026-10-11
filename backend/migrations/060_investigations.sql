-- Investigation leases fence stale agents; immutable reports/reviews preserve prior evaluations.
CREATE TABLE investigations (
 org_id uuid NOT NULL, request_id uuid NOT NULL, version integer NOT NULL DEFAULT 1,
 status text NOT NULL CHECK(status IN ('WAITING','INVESTIGATING','EVIDENCE_RECEIVED','EVALUATED','FAILED')),
 run_id uuid, actor_id uuid, mode text CHECK(mode IN ('LOCAL_TEST','GATEKEEPER')),
 request_version integer, lease_until timestamptz, started_at timestamptz,
 evidence_received_at timestamptz, evaluated_at timestamptz, failed_at timestamptz,
 failure_reason text, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(org_id,request_id), FOREIGN KEY(org_id,request_id) REFERENCES requests(org_id,id),
 FOREIGN KEY(org_id,actor_id) REFERENCES principals(org_id,id)
);
CREATE TABLE investigation_reports (
 id uuid PRIMARY KEY, org_id uuid NOT NULL, request_id uuid NOT NULL, run_id uuid NOT NULL,
 actor_id uuid NOT NULL, mode text NOT NULL CHECK(mode IN ('LOCAL_TEST','GATEKEEPER')),
 request_version integer NOT NULL, report jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(org_id,request_id,request_version), FOREIGN KEY(org_id,request_id) REFERENCES requests(org_id,id),
 FOREIGN KEY(org_id,actor_id) REFERENCES principals(org_id,id)
);
DO $$ DECLARE name text; BEGIN
 FOREACH name IN ARRAY ARRAY['investigations','investigation_reports'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',name);
  EXECUTE format('CREATE POLICY tenant_scope ON %I TO gate_runtime USING (org_id::text=current_setting(''gate.org_id'',true)) WITH CHECK (org_id::text=current_setting(''gate.org_id'',true))',name);
 END LOOP;
END $$;
GRANT SELECT,INSERT ON investigations,investigation_reports TO gate_runtime;
GRANT UPDATE(version,status,run_id,actor_id,mode,request_version,lease_until,started_at,evidence_received_at,evaluated_at,failed_at,failure_reason) ON investigations TO gate_runtime;
GRANT UPDATE(evidence,decision) ON requests TO gate_runtime;
ALTER TABLE transaction_reviews DROP CONSTRAINT transaction_reviews_pkey;
ALTER TABLE transaction_reviews ADD PRIMARY KEY(org_id,request_id,request_version);
CREATE INDEX investigation_queue ON investigations(org_id,status,created_at);

-- Existing unreviewed proposals enter the queue; reviewed/historical financial records keep their state.
INSERT INTO investigations(org_id,request_id,status,created_at)
 SELECT r.org_id,r.id,'WAITING',r.created_at FROM requests r
 WHERE NOT EXISTS(SELECT 1 FROM payments p WHERE p.org_id=r.org_id AND p.request_id=r.id)
 AND NOT EXISTS(SELECT 1 FROM transaction_reviews t WHERE t.org_id=r.org_id AND t.request_id=r.id);
