-- Trust gates only new requests explicitly opted in; historical payments remain immutable.
ALTER TABLE requests ADD COLUMN trust_required boolean NOT NULL DEFAULT false;
GRANT INSERT(trust_required) ON requests TO gate_runtime;

CREATE TABLE trust_history_labels (
 org_id uuid NOT NULL, request_id uuid NOT NULL, actor_id uuid NOT NULL,
 legitimacy text NOT NULL CHECK(legitimacy IN ('CONFIRMED_LEGITIMATE','CONFIRMED_FRAUD')),
 reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(org_id,request_id), FOREIGN KEY(org_id,request_id) REFERENCES requests(org_id,id),
 FOREIGN KEY(org_id,actor_id) REFERENCES principals(org_id,id)
);
CREATE TABLE trust_assessments (
 id uuid PRIMARY KEY, org_id uuid NOT NULL, request_id uuid NOT NULL,
 input jsonb NOT NULL, input_hash text NOT NULL, proposal_hash text NOT NULL,
 status text NOT NULL CHECK(status IN ('QUEUED','SENT','COMPLETED','FAILED','TIMED_OUT')),
 response jsonb, adjustment integer NOT NULL DEFAULT 0 CHECK(adjustment BETWEEN -10 AND 30),
 failure_code text, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 completed_at timestamptz, UNIQUE(org_id,request_id),
 FOREIGN KEY(org_id,request_id) REFERENCES requests(org_id,id)
);
DO $$ DECLARE name text; BEGIN
 FOREACH name IN ARRAY ARRAY['trust_assessments','trust_history_labels'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',name);
  EXECUTE format('CREATE POLICY tenant_scope ON %I TO gate_runtime USING (org_id::text=current_setting(''gate.org_id'',true)) WITH CHECK (org_id::text=current_setting(''gate.org_id'',true))',name);
 END LOOP;
END $$;
GRANT SELECT,INSERT ON trust_assessments,trust_history_labels TO gate_runtime;
GRANT UPDATE(status,response,adjustment,failure_code,completed_at) ON trust_assessments TO gate_runtime;
CREATE INDEX trust_queue ON trust_assessments(org_id,status,created_at);
CREATE FUNCTION gate_trust_pending_orgs() RETURNS TABLE(org_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT DISTINCT org_id FROM trust_assessments WHERE status IN ('QUEUED','SENT');
$$;
REVOKE ALL ON FUNCTION gate_trust_pending_orgs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION gate_trust_pending_orgs() TO gate_runtime;
