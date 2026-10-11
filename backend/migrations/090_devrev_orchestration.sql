-- Advisory orchestration only: no grants or writes to financial tables.
CREATE TABLE orchestration_runs (
 id uuid PRIMARY KEY, org_id uuid NOT NULL, request_id uuid NOT NULL, created_by uuid NOT NULL, created_credential_id uuid NOT NULL,
 idempotency_key text NOT NULL, input_hash text NOT NULL, snapshot jsonb NOT NULL,
 status text NOT NULL CHECK(status IN ('RUNNING','COMPLETED','HUMAN_REVIEW_REQUIRED','FAILED','TIMED_OUT')),
 current_stage integer NOT NULL DEFAULT 1 CHECK(current_stage BETWEEN 1 AND 3),
 escalation jsonb, error_code text, retry_of uuid,
 created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
 UNIQUE(org_id,id), UNIQUE(org_id,created_by,idempotency_key),
 FOREIGN KEY(org_id,request_id) REFERENCES requests(org_id,id),
 FOREIGN KEY(org_id,created_by) REFERENCES principals(org_id,id),
 FOREIGN KEY(org_id,created_credential_id) REFERENCES credentials(org_id,id),
 FOREIGN KEY(org_id,retry_of) REFERENCES orchestration_runs(org_id,id)
);
CREATE TABLE orchestration_stages (
 id uuid PRIMARY KEY, org_id uuid NOT NULL, run_id uuid NOT NULL,
 ordinal integer NOT NULL CHECK(ordinal BETWEEN 1 AND 3), agent_id text NOT NULL, agent_version text NOT NULL,
 session_object text NOT NULL UNIQUE, session_id text,
 status text NOT NULL CHECK(status IN ('READY','SENDING','WAITING','DISPATCH_UNKNOWN','SUCCEEDED','FAILED','TIMED_OUT')),
 dispatch_confirmed boolean NOT NULL DEFAULT false, http_status integer,
 prompt jsonb, prompt_hash text, tool_result jsonb, final_result text, findings jsonb,
 error_code text, error_detail jsonb, started_at timestamptz, expires_at timestamptz, completed_at timestamptz,
 UNIQUE(org_id,id), UNIQUE(org_id,run_id,ordinal),
 FOREIGN KEY(org_id,run_id) REFERENCES orchestration_runs(org_id,id)
);
CREATE TABLE orchestration_events (
 org_id uuid NOT NULL, stage_id uuid NOT NULL, event_hash text NOT NULL,
 event jsonb NOT NULL, ignored boolean NOT NULL DEFAULT false, received_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(org_id,stage_id,event_hash), FOREIGN KEY(org_id,stage_id) REFERENCES orchestration_stages(org_id,id)
);
DO $$ DECLARE name text; BEGIN
 FOREACH name IN ARRAY ARRAY['orchestration_runs','orchestration_stages','orchestration_events'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',name);
  EXECUTE format('CREATE POLICY tenant_scope ON %I TO gate_runtime USING (org_id::text=current_setting(''gate.org_id'',true)) WITH CHECK (org_id::text=current_setting(''gate.org_id'',true))',name);
 END LOOP;
END $$;
GRANT SELECT,INSERT ON orchestration_runs,orchestration_stages,orchestration_events TO gate_runtime;
GRANT UPDATE(status,current_stage,escalation,error_code,completed_at) ON orchestration_runs TO gate_runtime;
GRANT UPDATE(session_id,status,dispatch_confirmed,http_status,prompt,prompt_hash,tool_result,final_result,findings,error_code,error_detail,started_at,expires_at,completed_at) ON orchestration_stages TO gate_runtime;
CREATE INDEX orchestration_pending ON orchestration_runs(org_id,status,created_at);
