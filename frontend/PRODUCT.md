# Gate

<!-- impeccable:product-schema 1 -->

## Platform
web

## Stack
User-approved React, TypeScript, and Vite. PostgreSQL-backed asynchronous dashboard adapter.

## Users
Agent operators and finance reviewers inspecting proposed company spending, its business evidence, and policy decisions.

## Product Purpose
Make every agent transaction and its reason inspectable in a working hackathon frontend demo.

## Capabilities and Constraints
Seven pages: Overview, Needs a decision, Transactions/Requests, Gatekeepers,
Policies, Audit log, Settings. Opens without login into the shared hackathon
workspace. Stored requests and linked historical payments refresh every five
seconds. Approve/reject persists an independent Gate transaction review and reason;
it does not mutate financial state. Agent/policy configuration is read-only.
No local fixtures substitute for unavailable backend data. DevRev is pending.


## Brand Commitments

The user-authorized cinematic welcome may feature a faithful 3D interpretation of the rainbow logo outside the header for a single 5.8-second arrival sequence. The source logo is preserved. Its decorative Approved moment does not represent a transaction decision.
Name: Gate. Supplied rainbow logo stays in the top-left brand, with the cinematic welcome exception described above. User-supplied dark dashboard sets the layout; the user-approved theme uses a dark palette of navy #000B58, blue #003161, teal #006A67, and pale yellow #FFF4B7 and Open Sans, without gradients, glows, shadows, or decorative blur. Agents navigation/page renamed Gatekeepers. Supplied original ten character images used as circular crops; images may be reused. Original artwork stays intact; user-authorized clean plates repair eye regions for character animation. Unapproved visual changes require the user's decision.

## Evidence on Hand
Reference screenshot and original logo PNG supplied in chat; ten original character PNGs supplied in a ZIP. User-authorized merchant logos are fetched from official company websites and stored locally with source provenance; generated substitutes are not authorized. Demo records are synthetic, with 24 initial records and consistent dates.

## Product Principles
- Preserve the approved screenshot and artwork.
- Keep decisions and their evidence inspectable.
- Derive counts and activity from one shared state.
- Persist only after storage succeeds; failures are visible.
- Keep the demo boundary visible.

## Updated scope: backend-connected main dashboard

The earlier local-demo capabilities above are historical. The main dashboard now
uses scoped PostgreSQL responses through the shared no-login demo workspace and has no fixture fallback.
Unsupported agent/policy configuration writes are read-only. Finance review is a
version-bound enterprise decision with no payment/job/budget reservation. The
backend console and separate /live UI are removed. DevRev is an independent
context-source integration, not a prerequisite for the main API adapter.
