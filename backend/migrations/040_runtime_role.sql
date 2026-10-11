-- Allow the migration identity to open restricted runtime sessions.
GRANT gate_runtime TO CURRENT_USER WITH INHERIT FALSE, SET TRUE;
