-- Server-authorized demo reviews have no bearer credential; retain their initiator explicitly.
ALTER TABLE orchestration_runs ALTER COLUMN created_credential_id DROP NOT NULL;
ALTER TABLE orchestration_runs ADD COLUMN initiator_type text NOT NULL DEFAULT 'CREDENTIAL'
 CHECK(initiator_type IN ('CREDENTIAL','DEMO_REVIEW'));
ALTER TABLE orchestration_runs ADD CONSTRAINT orchestration_initiator_credential_check CHECK(
 (initiator_type='CREDENTIAL' AND created_credential_id IS NOT NULL)
 OR (initiator_type='DEMO_REVIEW' AND created_credential_id IS NULL)
);
