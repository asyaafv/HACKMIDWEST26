# Four-chat assignment map

Paste each numbered file into a different Codex chat attached to the same repo. These files are instructions to those chats; no chats were automatically created or messaged.

1. **Data/evidence:** versioned synthetic seed, repeatable import, verified account paths, scoped context.
2. **Payments/policy:** durable provider boundary, authorization/accounting, attempts/reconciliation/faults.
3. **Gatekeepers/auth:** scoped agent identities, MCP contracts/driver, browser auth, skill compatibility.
4. **Console/integration:** temporary UI, shared files/dependencies/route wiring, combined tests and handoff.

All four can start now. Chat 1 supplies the usable demo data; Chat 4 integrates the final manual workflow once the other interfaces land. Shared implementation files have one owner; other chats supply exported modules and handoff requests.

If all chats share one checkout, keep its current branch. Do not ask each chat to check out a different branch in the same directory. Separate worktrees are an alternative only when deliberately arranged, with Chat 4 merging reviewed changes. Each chat writes its own handoff under `backend/docs/handoffs/` and leaves other chats' work intact.

Only Chat 4 installs packages/updates the lockfile, edits shared contracts/app wiring, applies integrated migrations to the shared demo database and runs the combined suite. Other chats can use isolated databases/tests. Never use the shared seed's private credentials as test output or overwrite pending payment state for a reset.
