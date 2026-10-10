-- Add immutable authorization snapshots and recoverable payment history without rewriting baseline rows.
ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_fault_mode_check;
ALTER TABLE payments ADD CONSTRAINT payments_fault_mode_check CHECK (fault_mode IN ('SUCCESS','DECLINE','TIMEOUT_BEFORE_COMMIT','TIMEOUT_AFTER_COMMIT'));
ALTER TABLE payments ADD COLUMN operation_key text;
UPDATE payments SET operation_key=id::text WHERE operation_key IS NULL;
ALTER TABLE payments ALTER COLUMN operation_key SET NOT NULL;
CREATE UNIQUE INDEX payments_operation_key ON payments(org_id,operation_key);

CREATE TABLE request_revisions (
  id uuid PRIMARY KEY, org_id uuid NOT NULL, request_id uuid NOT NULL, revision integer NOT NULL,
  proposal jsonb NOT NULL, proposal_hash text NOT NULL, evidence jsonb NOT NULL, evidence_hash text NOT NULL,
  decision jsonb NOT NULL, decision_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id,request_id,revision), FOREIGN KEY(org_id,request_id) REFERENCES requests(org_id,id)
);
INSERT INTO request_revisions(id,org_id,request_id,revision,proposal,proposal_hash,evidence,evidence_hash,decision,decision_hash,created_at)
SELECT id,org_id,id,1,proposal,md5(proposal::text),evidence,md5(evidence::text),decision,md5(decision::text),created_at FROM requests;

CREATE TABLE authorizations (
  id uuid PRIMARY KEY, org_id uuid NOT NULL, request_id uuid NOT NULL, approval_id uuid NOT NULL,
  payment_id uuid NOT NULL, budget_id uuid NOT NULL, bound_hash text NOT NULL,
  state text NOT NULL CHECK(state IN ('READY','DISPATCHED','CONSUMED','REVOKED','EXPIRED')),
  expires_at timestamptz NOT NULL, dispatched_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id,request_id), UNIQUE(org_id,payment_id),
  FOREIGN KEY(org_id,request_id) REFERENCES requests(org_id,id), FOREIGN KEY(org_id,approval_id) REFERENCES approvals(org_id,id),
  FOREIGN KEY(org_id,payment_id) REFERENCES payments(org_id,id), FOREIGN KEY(org_id,budget_id) REFERENCES budgets(org_id,id)
);
INSERT INTO authorizations(id,org_id,request_id,approval_id,payment_id,budget_id,bound_hash,state,expires_at,dispatched_at,created_at)
SELECT id,org_id,request_id,approval_id,id,budget_id,bound_hash,
  CASE WHEN hold_state='CAPTURED' THEN 'CONSUMED' WHEN hold_state='RELEASED' THEN CASE WHEN status='CANCELLED' AND receipt->>'reason'='AUTHORIZATION_EXPIRED' THEN 'EXPIRED' ELSE 'REVOKED' END WHEN dispatched_at IS NOT NULL THEN 'DISPATCHED' ELSE 'READY' END,
  expires_at,dispatched_at,created_at FROM payments;

CREATE TABLE payment_attempts (
  id uuid PRIMARY KEY, org_id uuid NOT NULL, payment_id uuid NOT NULL, attempt_number integer NOT NULL,
  operation text NOT NULL CHECK(operation IN ('EXECUTE','RETRIEVE')), outcome text NOT NULL CHECK(outcome IN ('STARTED','SUCCEEDED','FAILED','UNKNOWN','NO_RECORD')),
  safe_error_code text, started_at timestamptz NOT NULL DEFAULT now(), ended_at timestamptz,
  UNIQUE(org_id,payment_id,attempt_number), FOREIGN KEY(org_id,payment_id) REFERENCES payments(org_id,id)
);
CREATE TABLE payment_inbox (
  id uuid PRIMARY KEY, org_id uuid NOT NULL, payment_id uuid NOT NULL, provider_event_id text NOT NULL,
  event_status text NOT NULL CHECK(event_status IN ('PROCESSING','SUCCEEDED','FAILED')),
  receipt jsonb, received_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz,
  UNIQUE(org_id,provider_event_id), FOREIGN KEY(org_id,payment_id) REFERENCES payments(org_id,id)
);
ALTER TABLE jobs ADD COLUMN last_error_code text;
ALTER TABLE jobs ADD COLUMN manual_attention boolean NOT NULL DEFAULT false;
CREATE TABLE worker_heartbeats (owner uuid PRIMARY KEY, last_seen_at timestamptz NOT NULL, last_payment_id uuid);

DO $$ DECLARE name text; BEGIN
  FOREACH name IN ARRAY ARRAY['request_revisions','authorizations','payment_attempts','payment_inbox'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',name);
    EXECUTE format('CREATE POLICY tenant_scope ON %I TO gate_runtime USING (org_id::text=current_setting(''gate.org_id'',true)) WITH CHECK (org_id::text=current_setting(''gate.org_id'',true))',name);
  END LOOP;
END $$;
GRANT SELECT,INSERT ON request_revisions,authorizations,payment_attempts,payment_inbox TO gate_runtime;
GRANT UPDATE(state,dispatched_at) ON authorizations TO gate_runtime;
GRANT UPDATE(outcome,safe_error_code,ended_at) ON payment_attempts TO gate_runtime;
GRANT UPDATE(processed_at) ON payment_inbox TO gate_runtime;
GRANT UPDATE(fault_mode) ON payments TO gate_runtime;
GRANT UPDATE(last_error_code,manual_attention) ON jobs TO gate_runtime;
GRANT SELECT,INSERT,UPDATE ON worker_heartbeats TO gate_runtime;
CREATE INDEX payment_attempt_lookup ON payment_attempts(org_id,payment_id,attempt_number);
CREATE INDEX payment_inbox_pending ON payment_inbox(org_id,payment_id) WHERE processed_at IS NULL;
