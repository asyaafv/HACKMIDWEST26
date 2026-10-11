-- Resolve a preselected Gate credential after the MCP boundary verifies its DevRev user.
CREATE FUNCTION gate_credential_identity(credential uuid)
RETURNS TABLE(id uuid,org_id uuid,credential_id uuid,role text,approval_limit_minor bigint)
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT p.id,p.org_id,c.id,p.role,p.approval_limit_minor FROM principals p
  JOIN credentials c ON c.org_id=p.org_id AND c.principal_id=p.id
  WHERE c.id=credential AND c.revoked_at IS NULL AND c.expires_at>now() AND p.active;
$$;
REVOKE ALL ON FUNCTION gate_credential_identity(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION gate_credential_identity(uuid) TO gate_runtime;
