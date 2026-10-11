# Gate — HACKMIDWEST26

Gate is the enterprise context and authorization layer around existing financial
records. Its main React dashboard reads scoped PostgreSQL-backed API responses;
DevRev Gatekeepers use the same backend through MCP. No DevRev connection is
required to use the current dashboard and imported source records.

From the repository root:

```sh
./run-gate.sh
```

On Windows, double-click `run-gate.cmd`, or run `./run-gate.ps1` from PowerShell.
Both Windows launchers run the same supervisor as the shell script. Use
`./run-gate.ps1 -Smoke` to start, check readiness, and stop the services.
The Windows launcher keeps its persistent local database in
`backend/work/postgres-windows`. It is separate from the PostgreSQL database on
Render; running the local app does not read or change Render data.

Open the printed dashboard address (normally http://127.0.0.1:5173). The launcher
starts PostgreSQL, applies migrations, prepares synthetic demo context without
resetting history, and starts the API and frontend. It does **not** start a payment
worker. Node.js 22.12+ is required; the launcher can use Codex's bundled runtime.

The dashboard opens directly without login or tokens and refreshes PostgreSQL
records every five seconds. The launcher selects one prepared demo organization
and its shared finance reviewer. Dashboard decisions are attributed to that shared
hackathon workspace, not to an individually authenticated person. DevRev/MCP and
the other REST routes retain their separate authentication.

The backend console and separate `/live` workspace have been removed. All product
screens use the main dashboard. Agent/policy configuration is read-only where no
backend editing endpoint exists. No browser-local transaction fixtures are used
as fallback when the API is unavailable.

The dashboard reads stored `requests` with their linked `payments`, including
historical payment details. A separate `transaction_reviews` row records approval
or rejection, its reason and the reviewed snapshot; the original request status,
payment status and budget balances are preserved. No payment worker is started.
An empty database produces an empty dashboard. To create a labeled demo proposal,
open Gatekeepers → Simulate purchase. It runs the real policy/evidence engine using
imported sources. The form uses Gate's DevRev proposal fields and shows a read-only
policy preview before it records the sandbox request. The recorded proposal waits
for a Gatekeeper investigation. Open its detail and choose Run local investigation
to test imported evidence, then review the resulting policy decision. Live DevRev
record sync and the new Gatekeeper investigation flow are not yet verified.

Press Ctrl+C to stop services owned by the launcher. Existing history is preserved.
Logs are in backend/work. `./run-gate.sh --smoke` verifies startup and then stops
owned services. If services are already running, restart your owning terminal to
load the updated backend; the launcher never kills somebody else's process.

See [integration flow](backend/docs/integration-flow.md),
[API contracts](backend/docs/api.md), and
[Render deployment](backend/docs/render-deployment.md).
