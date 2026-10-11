# Gate Render and DevRev handoff

## Current DevRev organization

The DevRev team URL is `https://app.devrev.ai/maplestudio-playground-10-193711`.
Render's `DEVREV_MCP_ORG_ID` is `17WZM4zcjj`. The existing email and scoped Gate
credential mapping are retained. The connector uses
`https://hackmidwest26.onrender.com/mcp`; neither the Gate database organization
nor the global DevRev API endpoint changes with the team URL.

The hosted binding was updated through Render's Save and deploy action, reusing
the existing deployed commit. The observations below describe the earlier setup.

Observed October 10, 2026. The deployed Render web service is
`https://hackmidwest26.onrender.com` at commit `ed0766f`.

## Hosted state

- `gate-postgres` contains one `Gate sandbox` organization and 18 verified
  `SYNTHETIC_DEMO_DATA` source records. There are no payment or simulator
  transaction rows. This seed was already present when checked; it was not
  restored a second time.
- The Render start command is `node dist/scripts/migrate.js && npm start`.
  The deploy log confirmed migrations applied, including
  `040_transaction_reviews.sql`, before the server started.
- The database-specific PostgreSQL inbound list is empty again. A temporary
  single-IP rule used for inspection was removed; external traffic is blocked.
- `/health/ready` returned 200. Authenticated MCP discovery with the existing
  scoped AGENT credential returned exactly seven tools: `gate_catalog`,
  `gate_search_context`, `gate_get_context`, `gate_preview_spend`,
  `gate_request_spend`, `gate_list_requests`, and `gate_get_request`.
- Hosted read calls successfully returned catalog, search results and verified
  context for `pm:GATE-ISSUE-101`. A read-only $200 sandbox preview returned an
  `APPROVE` policy verdict with complete evidence.

## DevRev next step

The user chose to work from the existing local skill and connector files; the
DevRev UI was not changed here. Refresh the existing DevRev Computer connector's
cached discovery for the authenticated `/mcp` endpoint, bind only the seven
tools above, and update the existing `Gatekeeper Review` skill body from
`backend/computer/gate-spend-review/SKILL.md`. The copy in this repository is a
draft and is not proof of installation. Configure the Gate bearer credential
only in DevRev's secret field. The existing private credential expires on
October 17, 2026 at 7:35 PM CDT; reprovision it before then if needed.

The current main dashboard records independent enterprise reviews and does not
execute new payments. A DevRev tool call and review trace must be observed in
DevRev before the integration can be called verified end to end.
