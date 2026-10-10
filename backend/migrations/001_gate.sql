-- Gate sandbox foundation. Tenant RLS and locked counters prevent cross-org spend and oversubscription.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='gate_runtime') THEN CREATE ROLE gate_runtime NOLOGIN; END IF;
END $$;

CREATE TABLE organizations (id uuid PRIMARY KEY, name text NOT NULL);
CREATE TABLE principals (
  id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES organizations, name text NOT NULL,
  role text NOT NULL CHECK (role IN ('OPERATOR','AGENT','FINANCE','AUDITOR','ADMIN')),
  active boolean NOT NULL DEFAULT true, approval_limit_minor bigint NOT NULL DEFAULT 0 CHECK (approval_limit_minor >= 0),
  UNIQUE (org_id,id)
);
CREATE TABLE credentials (
  id uuid PRIMARY KEY, org_id uuid NOT NULL, principal_id uuid NOT NULL,
  token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, revoked_at timestamptz,
  FOREIGN KEY (org_id,principal_id) REFERENCES principals(org_id,id), UNIQUE(org_id,id)
);
CREATE TABLE projects (
  id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES organizations, name text NOT NULL,
  UNIQUE(org_id,id)
);
CREATE TABLE principal_projects (
  org_id uuid NOT NULL, principal_id uuid NOT NULL, project_id uuid NOT NULL,
  PRIMARY KEY(org_id,principal_id,project_id),
  FOREIGN KEY(org_id,principal_id) REFERENCES principals(org_id,id),
  FOREIGN KEY(org_id,project_id) REFERENCES projects(org_id,id)
);
CREATE TABLE agents (
  id uuid PRIMARY KEY, org_id uuid NOT NULL, owner_id uuid NOT NULL, project_id uuid NOT NULL,
  name text NOT NULL, active boolean NOT NULL DEFAULT true, cap_minor bigint NOT NULL DEFAULT 500000 CHECK(cap_minor>0),
  version integer NOT NULL DEFAULT 1,
  FOREIGN KEY(org_id,owner_id) REFERENCES principals(org_id,id),
  FOREIGN KEY(org_id,project_id) REFERENCES projects(org_id,id), UNIQUE(org_id,id)
);
CREATE TABLE merchants (
  id uuid PRIMARY KEY, org_id uuid NOT NULL REFERENCES organizations, name text NOT NULL,
  status text NOT NULL CHECK(status IN ('ALLOWED','REVIEW','DENIED')),
  destination_ref text NOT NULL, version integer NOT NULL DEFAULT 1, UNIQUE(org_id,id)
);
CREATE TABLE budgets (
  id uuid PRIMARY KEY, org_id uuid NOT NULL, project_id uuid NOT NULL,
  period_start timestamptz NOT NULL, period_end timestamptz NOT NULL,
  limit_minor bigint NOT NULL CHECK(limit_minor>0), reserved_minor bigint NOT NULL DEFAULT 0,
  spent_minor bigint NOT NULL DEFAULT 0,
  CHECK(period_end>period_start), CHECK(reserved_minor>=0 AND spent_minor>=0 AND reserved_minor+spent_minor<=limit_minor),
  UNIQUE(org_id,project_id,period_start), UNIQUE(org_id,id), FOREIGN KEY(org_id,project_id) REFERENCES projects(org_id,id)
);
CREATE TABLE source_records (
  id uuid PRIMARY KEY, org_id uuid NOT NULL, project_id uuid NOT NULL,
  dataset_label text NOT NULL, manifest_hash text NOT NULL, domain text NOT NULL, source_id text NOT NULL,
  source_path text NOT NULL, source_pointer text NOT NULL, source_hash text NOT NULL,
  content jsonb NOT NULL, UNIQUE(org_id,domain,source_id), UNIQUE(org_id,id),
  FOREIGN KEY(org_id,project_id) REFERENCES projects(org_id,id)
);
CREATE TABLE source_links (
  org_id uuid NOT NULL, from_id uuid NOT NULL, to_id uuid NOT NULL, basis_pointer text NOT NULL,
  PRIMARY KEY(org_id,from_id,to_id),
  CHECK(from_id<>to_id),
  FOREIGN KEY(org_id,from_id) REFERENCES source_records(org_id,id),
  FOREIGN KEY(org_id,to_id) REFERENCES source_records(org_id,id)
);
CREATE TABLE requests (
  id uuid PRIMARY KEY, org_id uuid NOT NULL, created_by uuid NOT NULL, credential_id uuid NOT NULL,
  agent_id uuid NOT NULL, project_id uuid NOT NULL, merchant_id uuid NOT NULL,
  amount_minor bigint NOT NULL CHECK(amount_minor>0), proposal jsonb NOT NULL,
  evidence jsonb NOT NULL, decision jsonb NOT NULL,
  status text NOT NULL CHECK(status IN ('AWAITING_EVIDENCE','AWAITING_CONSENT','REJECTED','AUTHORIZED','EXECUTING','COMPLETED','FAILED','RECONCILING','CANCELLED','EXPIRED')),
  version integer NOT NULL DEFAULT 1, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id,id), FOREIGN KEY(org_id,created_by) REFERENCES principals(org_id,id),
  FOREIGN KEY(org_id,credential_id) REFERENCES credentials(org_id,id),
  FOREIGN KEY(org_id,agent_id) REFERENCES agents(org_id,id),
  FOREIGN KEY(org_id,project_id) REFERENCES projects(org_id,id), FOREIGN KEY(org_id,merchant_id) REFERENCES merchants(org_id,id)
);
CREATE TABLE previews (
  id uuid PRIMARY KEY, org_id uuid NOT NULL, request_id uuid NOT NULL,
  request_version integer NOT NULL, payload jsonb NOT NULL, preview_hash text NOT NULL,
  expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id,id), FOREIGN KEY(org_id,request_id) REFERENCES requests(org_id,id)
);
CREATE TABLE approvals (
  id uuid PRIMARY KEY, org_id uuid NOT NULL, request_id uuid NOT NULL, preview_id uuid NOT NULL,
  actor_id uuid NOT NULL, choice text NOT NULL CHECK(choice IN ('approve','reject')),
  reason text NOT NULL, consent_hash text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id,request_id), UNIQUE(org_id,id),
  FOREIGN KEY(org_id,request_id) REFERENCES requests(org_id,id), FOREIGN KEY(org_id,preview_id) REFERENCES previews(org_id,id),
  FOREIGN KEY(org_id,actor_id) REFERENCES principals(org_id,id)
);
CREATE TABLE payments (
  id uuid PRIMARY KEY, org_id uuid NOT NULL, request_id uuid NOT NULL, approval_id uuid NOT NULL,
  budget_id uuid NOT NULL, amount_minor bigint NOT NULL CHECK(amount_minor>0), bound_hash text NOT NULL,
  status text NOT NULL CHECK(status IN ('QUEUED','PROCESSING','UNKNOWN','SUCCEEDED','FAILED','CANCELLED')),
  hold_state text NOT NULL CHECK(hold_state IN ('HELD','CAPTURED','RELEASED')),
  expires_at timestamptz NOT NULL, dispatched_at timestamptz, receipt jsonb,
  fault_mode text NOT NULL DEFAULT 'SUCCESS' CHECK(fault_mode IN ('SUCCESS','DECLINE','TIMEOUT_AFTER_COMMIT')),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(org_id,request_id), UNIQUE(org_id,id),
  FOREIGN KEY(org_id,request_id) REFERENCES requests(org_id,id), FOREIGN KEY(org_id,approval_id) REFERENCES approvals(org_id,id),
  FOREIGN KEY(org_id,budget_id) REFERENCES budgets(org_id,id)
);
CREATE TABLE budget_entries (
  id uuid PRIMARY KEY, org_id uuid NOT NULL, payment_id uuid NOT NULL, budget_id uuid NOT NULL,
  kind text NOT NULL CHECK(kind IN ('RESERVE','CAPTURE','RELEASE')), amount_minor bigint NOT NULL CHECK(amount_minor>0),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(org_id,payment_id,kind),
  FOREIGN KEY(org_id,payment_id) REFERENCES payments(org_id,id), FOREIGN KEY(org_id,budget_id) REFERENCES budgets(org_id,id)
);
CREATE TABLE simulator_transactions (
  id uuid PRIMARY KEY, org_id uuid NOT NULL, payment_id uuid NOT NULL, payload_hash text NOT NULL,
  status text NOT NULL CHECK(status IN ('SUCCEEDED','FAILED')), receipt jsonb NOT NULL,
  UNIQUE(org_id,payment_id), FOREIGN KEY(org_id,payment_id) REFERENCES payments(org_id,id)
);
CREATE TABLE jobs (
  id uuid PRIMARY KEY, org_id uuid NOT NULL, payment_id uuid NOT NULL,
  lease_owner uuid, lease_until timestamptz, available_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0, done boolean NOT NULL DEFAULT false,
  UNIQUE(org_id,payment_id), FOREIGN KEY(org_id,payment_id) REFERENCES payments(org_id,id)
);
CREATE TABLE idempotency_records (
  org_id uuid NOT NULL, principal_id uuid NOT NULL, operation text NOT NULL, key text NOT NULL,
  request_hash text NOT NULL, response jsonb NOT NULL,
  PRIMARY KEY(org_id,principal_id,operation,key), FOREIGN KEY(org_id,principal_id) REFERENCES principals(org_id,id)
);
CREATE TABLE audit_heads (org_id uuid PRIMARY KEY REFERENCES organizations, sequence bigint NOT NULL DEFAULT 0, head_hash text NOT NULL DEFAULT 'GENESIS');
CREATE TABLE audit_events (
  org_id uuid NOT NULL, sequence bigint NOT NULL, packet jsonb NOT NULL, prev_hash text NOT NULL, event_hash text NOT NULL,
  PRIMARY KEY(org_id,sequence), FOREIGN KEY(org_id) REFERENCES organizations
);

-- Authentication is a narrowly scoped lookup before tenant context exists.
CREATE FUNCTION gate_authenticate(digest text) RETURNS TABLE(id uuid,org_id uuid,credential_id uuid,role text,approval_limit_minor bigint)
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT p.id,p.org_id,c.id,p.role,p.approval_limit_minor FROM principals p
  JOIN credentials c ON c.org_id=p.org_id AND c.principal_id=p.id
  WHERE c.token_hash=digest AND c.revoked_at IS NULL AND c.expires_at>now() AND p.active;
$$;
-- Worker enumeration exposes tenant IDs only, never source data or credentials.
CREATE FUNCTION gate_pending_orgs() RETURNS TABLE(org_id uuid)
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT DISTINCT org_id FROM jobs WHERE NOT done;
$$;
REVOKE ALL ON FUNCTION gate_authenticate(text),gate_pending_orgs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION gate_authenticate(text),gate_pending_orgs() TO gate_runtime;

DO $$ DECLARE name text; BEGIN
  FOREACH name IN ARRAY ARRAY['principals','credentials','projects','principal_projects','agents','merchants','budgets','source_records','source_links','requests','previews','approvals','payments','budget_entries','simulator_transactions','jobs','idempotency_records','audit_heads','audit_events'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',name);
    EXECUTE format('CREATE POLICY tenant_scope ON %I TO gate_runtime USING (org_id::text=current_setting(''gate.org_id'',true)) WITH CHECK (org_id::text=current_setting(''gate.org_id'',true))',name);
  END LOOP;
END $$;
GRANT USAGE ON SCHEMA public TO gate_runtime;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO gate_runtime;
REVOKE SELECT ON organizations FROM gate_runtime;
GRANT INSERT ON requests,previews,approvals,payments,budget_entries,simulator_transactions,jobs,idempotency_records,audit_events TO gate_runtime;
GRANT UPDATE(status,version) ON requests TO gate_runtime;
-- PostgreSQL requires an UPDATE privilege for row locks; configuration values remain read-only.
GRANT UPDATE(version) ON agents,merchants TO gate_runtime;
GRANT UPDATE(reserved_minor,spent_minor) ON budgets TO gate_runtime;
GRANT UPDATE(status,hold_state,dispatched_at,receipt) ON payments TO gate_runtime;
GRANT UPDATE(lease_owner,lease_until,available_at,attempts,done) ON jobs TO gate_runtime;
GRANT UPDATE(sequence,head_hash) ON audit_heads TO gate_runtime;

CREATE INDEX request_queue ON requests(org_id,project_id,status,created_at);
CREATE INDEX agent_velocity ON requests(org_id,agent_id,created_at);
CREATE INDEX job_queue ON jobs(available_at,lease_until) WHERE NOT done;
CREATE INDEX source_project ON source_records(org_id,project_id);
