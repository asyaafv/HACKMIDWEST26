-- Credential capabilities and browser sessions retain server-owned tenant/identity.
ALTER TABLE credentials ADD COLUMN capabilities text[] NOT NULL DEFAULT ARRAY['catalog:read','context:read','request:read','request:preview','request:submit','request:cancel'];
UPDATE credentials c SET capabilities = CASE p.role
 WHEN 'FINANCE' THEN ARRAY['catalog:read','context:read','request:read','finance:consent','request:cancel','payment:read','payment:reconcile']
 WHEN 'AUDITOR' THEN ARRAY['catalog:read','context:read','request:read','payment:read']
 WHEN 'ADMIN' THEN ARRAY['catalog:read','context:read','request:read','identity:manage','payment:read','payment:reconcile','development:fault']
 ELSE ARRAY['catalog:read','context:read','request:read','request:preview','request:submit','request:cancel','payment:read'] END
 FROM principals p WHERE p.org_id=c.org_id AND p.id=c.principal_id;
-- Human legacy issuance inherits its role; AGENT issuance always requires explicit scopes.
ALTER TABLE credentials ALTER COLUMN capabilities SET DEFAULT NULL;
CREATE FUNCTION gate_default_credential_capabilities() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.capabilities IS NULL THEN
  SELECT CASE role
   WHEN 'OPERATOR' THEN ARRAY['catalog:read','context:read','request:read','request:preview','request:submit','request:cancel','payment:read']
   WHEN 'FINANCE' THEN ARRAY['catalog:read','context:read','request:read','finance:consent','request:cancel','payment:read','payment:reconcile']
   WHEN 'ADMIN' THEN ARRAY['catalog:read','context:read','request:read','identity:manage','payment:read','payment:reconcile','development:fault']
   WHEN 'AUDITOR' THEN ARRAY['catalog:read','context:read','request:read','payment:read']
   ELSE ARRAY[]::text[] END INTO NEW.capabilities FROM principals WHERE org_id=NEW.org_id AND id=NEW.principal_id;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER credential_default_capabilities BEFORE INSERT ON credentials FOR EACH ROW EXECUTE FUNCTION gate_default_credential_capabilities();
CREATE FUNCTION gate_credential_capabilities(credential uuid) RETURNS text[]
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT c.capabilities FROM credentials c JOIN principals p ON p.org_id=c.org_id AND p.id=c.principal_id
 WHERE c.id=credential AND c.revoked_at IS NULL AND c.expires_at>now() AND p.active;
$$;
CREATE TABLE human_logins (
 org_id uuid NOT NULL, principal_id uuid NOT NULL, username text NOT NULL UNIQUE, password_hash text NOT NULL,
 PRIMARY KEY(org_id,principal_id), FOREIGN KEY(org_id,principal_id) REFERENCES principals(org_id,id)
);
CREATE TABLE browser_sessions (
 id uuid PRIMARY KEY, org_id uuid NOT NULL, principal_id uuid NOT NULL, credential_id uuid NOT NULL,
 token_hash text NOT NULL UNIQUE, csrf_hash text NOT NULL, expires_at timestamptz NOT NULL, revoked_at timestamptz,
 FOREIGN KEY(org_id,principal_id) REFERENCES principals(org_id,id),
 FOREIGN KEY(org_id,credential_id) REFERENCES credentials(org_id,id)
);
ALTER TABLE human_logins ENABLE ROW LEVEL SECURITY;
ALTER TABLE browser_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_scope ON browser_sessions TO gate_runtime USING(org_id::text=current_setting('gate.org_id',true)) WITH CHECK(org_id::text=current_setting('gate.org_id',true));
CREATE FUNCTION gate_login_lookup(login text) RETURNS TABLE(id uuid,org_id uuid,password_hash text)
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT p.id,p.org_id,h.password_hash FROM human_logins h JOIN principals p ON p.org_id=h.org_id AND p.id=h.principal_id
 WHERE h.username=login AND p.active AND p.role<>'AGENT';
$$;
CREATE FUNCTION gate_session_lookup(digest text) RETURNS TABLE(id uuid,org_id uuid,credential_id uuid,role text,approval_limit_minor bigint,csrf_hash text)
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT p.id,p.org_id,c.id,p.role,p.approval_limit_minor,s.csrf_hash FROM browser_sessions s
 JOIN principals p ON p.org_id=s.org_id AND p.id=s.principal_id
 JOIN credentials c ON c.org_id=s.org_id AND c.id=s.credential_id AND c.principal_id=s.principal_id
 WHERE s.token_hash=digest AND s.revoked_at IS NULL AND s.expires_at>now() AND c.revoked_at IS NULL AND c.expires_at>now() AND p.active AND p.role<>'AGENT';
$$;
REVOKE ALL ON FUNCTION gate_credential_capabilities(uuid),gate_login_lookup(text),gate_session_lookup(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION gate_credential_capabilities(uuid),gate_login_lookup(text),gate_session_lookup(text) TO gate_runtime;
GRANT SELECT,INSERT ON browser_sessions TO gate_runtime;
GRANT UPDATE(revoked_at) ON browser_sessions TO gate_runtime;
-- Session issuance is available only to the trusted backend after password verification.
CREATE FUNCTION gate_issue_session(principal uuid, organization uuid, session uuid, credential uuid, digest text, csrf text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE permissions text[];
BEGIN
 SELECT CASE role WHEN 'FINANCE' THEN ARRAY['catalog:read','context:read','request:read','finance:consent','request:cancel','payment:read','payment:reconcile']
 WHEN 'OPERATOR' THEN ARRAY['catalog:read','context:read','request:read','request:preview','request:submit','request:cancel','payment:read']
 WHEN 'ADMIN' THEN ARRAY['catalog:read','context:read','request:read','identity:manage','payment:read','payment:reconcile','development:fault']
 ELSE ARRAY['catalog:read','context:read','request:read','payment:read'] END INTO permissions
 FROM principals WHERE id=principal AND org_id=organization AND active AND role<>'AGENT';
 IF permissions IS NULL THEN RAISE EXCEPTION 'Invalid human identity'; END IF;
 INSERT INTO credentials(id,org_id,principal_id,token_hash,expires_at,capabilities) VALUES(credential,organization,principal,'session:'||digest,now()+interval '8 hours',permissions);
 INSERT INTO browser_sessions VALUES(session,organization,principal,credential,digest,csrf,now()+interval '8 hours',NULL);
END $$;
REVOKE ALL ON FUNCTION gate_issue_session(uuid,uuid,uuid,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION gate_issue_session(uuid,uuid,uuid,uuid,text,text) TO gate_runtime;
