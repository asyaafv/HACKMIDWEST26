# Gate — HACKMIDWEST26

Start the local project from the repository root:

```sh
./run-gate.sh
```

The launcher installs dependencies when needed, prepares the local PostgreSQL
database without resetting existing history, and starts the API, payment worker,
temporary backend console, and frontend. It requires Node.js 22.12 or newer and
can use the bundled Codex runtime when available.

The launcher prints the actual addresses; the usual defaults are:

- Backend test console: http://127.0.0.1:8000/dev-console
- Frontend visual demo: http://127.0.0.1:5173
- API: http://127.0.0.1:8000/v1
- MCP endpoint: http://127.0.0.1:8000/mcp

Use the backend console to test real service behavior. The frontend currently
uses browser-local demo data and is not connected to the API. Copy the appropriate
operator or finance token from the private, ignored
`backend/work/demo-credentials.json` file into the console. Do not share or commit
these tokens.

Press **Ctrl+C** to stop services started by the launcher. Database contents are
preserved. Logs are stored in `backend/work/`. Existing services are not stopped;
the launcher selects another port when necessary.

To check startup and then shut down automatically:

```sh
./run-gate.sh --smoke
```

This local environment uses synthetic enterprise data and sandbox payments. Live
DevRev Gatekeepers must be configured separately.
