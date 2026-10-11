-- Automatic policy authority has no fabricated human approval; snapshot binds exact payment inputs.
ALTER TABLE payments ALTER COLUMN approval_id DROP NOT NULL;
ALTER TABLE authorizations ALTER COLUMN approval_id DROP NOT NULL;
ALTER TABLE payments ADD COLUMN policy_snapshot jsonb;
ALTER TABLE payments ADD CONSTRAINT payment_authority_required CHECK (approval_id IS NOT NULL OR policy_snapshot IS NOT NULL);
